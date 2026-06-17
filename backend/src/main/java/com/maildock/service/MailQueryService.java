package com.maildock.service;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.storage.AttachmentStorage;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * 邮件查询服务：分页列出某账号的邮件、获取邮件详情（含附件列表）、读取附件二进制内容、
 * 标记已读。
 *
 * <p>附件读取会校验附件确实归属于指定邮件，防止越权访问他人附件。落盘路径以库中
 * 存储的相对路径为准（形如 {@code attachments/{userId}/{accountId}/{messageId}/{filename}}），
 * 相对附件根目录的上一级解析为绝对路径。
 */
public final class MailQueryService {

    /** 分页邮件结果：当前页邮件与总数。 */
    public record PagedMessages(List<Message> items, long total) {
    }

    /** 邮件详情：邮件本体与其附件列表。 */
    public record MessageDetail(Message message, List<Attachment> attachments) {
    }

    private final MessageRepository messageRepo;
    private final AttachmentRepository attachmentRepo;
    private final AttachmentStorage attachmentStorage;

    public MailQueryService(MessageRepository messageRepo,
                            AttachmentRepository attachmentRepo,
                            Path attachmentsDir) {
        this(messageRepo, attachmentRepo, new AttachmentStorage(attachmentRepo, attachmentsDir));
    }

    public MailQueryService(MessageRepository messageRepo,
                            AttachmentRepository attachmentRepo,
                            AttachmentStorage attachmentStorage) {
        this.messageRepo = messageRepo;
        this.attachmentRepo = attachmentRepo;
        this.attachmentStorage = attachmentStorage;
    }

    public PagedMessages list(long userId, long accountId, int page, int size) {
        List<Message> items = messageRepo.listByAccountForUser(userId, accountId, page, size);
        long total = messageRepo.countByAccountForUser(userId, accountId);
        return new PagedMessages(items, total);
    }

    /** 获取邮件详情（含附件列表），邮件不存在时返回空。 */
    public Optional<MessageDetail> getDetail(long userId, long messageId) {
        return messageRepo.findByIdForUser(userId, messageId)
                .map(m -> new MessageDetail(m, attachmentRepo.findByMessage(messageId)));
    }

    /** 标记邮件已读 / 未读。 */
    public void markRead(long userId, long messageId, boolean read) {
        messageRepo.markReadForUser(userId, messageId, read);
    }

    /**
     * 读取附件二进制内容，校验附件归属于指定邮件，防止越权。
     *
     * @param messageId    邮件 id
     * @param attachmentId 附件 id
     * @return 附件文件字节内容
     */
    public byte[] loadAttachment(long userId, long messageId, long attachmentId) {
        Attachment att = attachmentRepo.findByIdForUser(userId, messageId, attachmentId)
                .orElseThrow(() -> new RuntimeException("附件不存在: " + attachmentId));
        try {
            return attachmentStorage.read(att.filePath());
        } catch (Exception e) {
            throw new RuntimeException("读取附件文件失败: " + att.filePath(), e);
        }
    }
}
