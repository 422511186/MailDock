package com.maildock.service;

import com.maildock.mail.FilenameSanitizer;
import com.maildock.mail.ImapClient;
import com.maildock.mail.ImapFetchResult;
import com.maildock.mail.ImapMessage;
import com.maildock.mail.MailParser;
import com.maildock.mail.ParsedAttachment;
import com.maildock.mail.ParsedMail;
import com.maildock.model.Account;
import com.maildock.model.Message;
import com.maildock.storage.AttachmentStorage;

import java.nio.file.Path;

/**
 * 邮件增量同步服务：刷新某账号时从 IMAP 增量拉取 INBOX 新邮件，
 * 解析后将正文入库、附件落盘并记录元数据，最后更新账号的增量游标。
 *
 * <p>增量依据账号已存邮件的最大 UID。若服务器返回的 UIDVALIDITY 与库中记录不一致
 * （邮箱重建等），视为需要全量重新拉取，从 UID 0 开始。
 *
 * <p>附件落盘路径为 {@code attachments/{userId}/{accountId}/{messageId}/{清洗后的文件名}}，
 * 库中存储该相对路径。文件名经 {@link FilenameSanitizer} 清洗以防路径穿越。
 *
 * <p>本服务内含阻塞的 IMAP 与磁盘 I/O，应在 worker 线程（executeBlocking）中调用，
 * 不要在 Vert.x 事件循环上直接执行。
 */
public final class MailSyncService {

    /** 创建 IMAP 客户端的工厂，便于测试注入指向内嵌服务器的实现。 */
    @FunctionalInterface
    public interface ImapClientFactory {
        ImapClient create(String host, int port, boolean useSsl, String email, String authCode);
    }

    private final com.maildock.repository.AccountRepository accountRepo;
    private final com.maildock.repository.MessageRepository messageRepo;
    private final com.maildock.repository.AttachmentRepository attachmentRepo;
    private final com.maildock.security.CryptoUtil crypto;
    private final ImapClientFactory clientFactory;
    private final AttachmentStorage attachmentStorage;

    public MailSyncService(com.maildock.repository.AccountRepository accountRepo,
                           com.maildock.repository.MessageRepository messageRepo,
                           com.maildock.repository.AttachmentRepository attachmentRepo,
                           com.maildock.security.CryptoUtil crypto,
                           ImapClientFactory clientFactory,
                           Path attachmentsDir) {
        this(accountRepo, messageRepo, attachmentRepo, crypto, clientFactory, new AttachmentStorage(attachmentRepo, attachmentsDir));
    }

    public MailSyncService(com.maildock.repository.AccountRepository accountRepo,
                           com.maildock.repository.MessageRepository messageRepo,
                           com.maildock.repository.AttachmentRepository attachmentRepo,
                           com.maildock.security.CryptoUtil crypto,
                           ImapClientFactory clientFactory,
                           AttachmentStorage attachmentStorage) {
        this.accountRepo = accountRepo;
        this.messageRepo = messageRepo;
        this.attachmentRepo = attachmentRepo;
        this.crypto = crypto;
        this.clientFactory = clientFactory;
        this.attachmentStorage = attachmentStorage;
    }

    public int refresh(long userId, long accountId) {
        Account account = accountRepo.findById(userId, accountId)
                .orElseThrow(() -> new RuntimeException("账号不存在: " + accountId));
        return refresh(userId, account);
    }

    private int refresh(long userId, Account account) {
        long accountId = account.id();

        // 确定增量起点：UIDVALIDITY 变化时从 0 重新全量拉取
        long lastUid = messageRepo.maxUid(accountId);
        long knownValidity = account.uidValidity();

        String authCode = crypto.decrypt(account.authCodeEnc());
        boolean useSsl = account.imapPort() == 993;
        ImapClient client = clientFactory.create(
                account.imapHost(), account.imapPort(), useSsl, account.email(), authCode);

        // 先以 lastUid 拉取；若 UIDVALIDITY 改变则重置为 0 再拉一次
        ImapFetchResult result = client.fetchSince(lastUid);
        if (knownValidity != 0 && result.uidValidity() != knownValidity) {
            System.err.printf("账号 %d 的 UIDVALIDITY 由 %d 变为 %d，执行全量重新同步%n",
                    accountId, knownValidity, result.uidValidity());
            result = client.fetchSince(0);
        }

        int newCount = 0;
        long maxUid = lastUid;
        for (ImapMessage im : result.messages()) {
            try {
                storeMessage(userId, accountId, im);
                newCount++;
                maxUid = Math.max(maxUid, im.uid());
            } catch (Exception e) {
                // 单封失败不中断整体同步，记录日志后跳过
                System.err.printf("账号 %d 邮件 uid=%d 入库失败，已跳过: %s%n",
                        accountId, im.uid(), e.getMessage());
            }
        }

        // 更新增量游标与同步时间
        accountRepo.updateSyncState(userId, accountId, maxUid, result.uidValidity(), System.currentTimeMillis());
        return newCount;
    }

    /** 解析单封邮件，正文入库、附件落盘并记录元数据。 */
    private void storeMessage(long userId, long accountId, ImapMessage im) throws Exception {
        ParsedMail parsed = MailParser.parse(im.message());
        boolean hasAttach = !parsed.attachments().isEmpty();

        // 先入库邮件以拿到 messageId（附件落盘路径需要它）
        Message toInsert = new Message(
                0, accountId, im.uid(), parsed.messageId(), parsed.subject(),
                parsed.from(), parsed.to(), parsed.cc(),
                parsed.sentAt(), System.currentTimeMillis(),
                parsed.bodyText(), parsed.bodyHtml(),
                hasAttach, false, parsed.bodyText() != null ? parsed.bodyText().length() : 0L, 0L);
        Message saved = messageRepo.insert(toInsert);

        for (ParsedAttachment att : parsed.attachments()) {
            attachmentStorage.store(userId, accountId, saved.id(), att);
        }
    }
}
