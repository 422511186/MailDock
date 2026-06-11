package com.maildock.service;

import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 邮箱账号业务服务：账号的创建（加密授权码 + 自动测活）、列表、删除（级联清理邮件 / 附件 /
 * 落盘文件）、单个测活、批量测活、txt 批量导入。
 *
 * <p>IMAP 客户端通过 {@link ImapClientFactory} 创建，便于测试时注入指向内嵌服务器的工厂。
 * 授权码使用 {@link CryptoUtil} 加密后存库，绝不明文落库。
 */
public final class AccountService {

    /** 创建 IMAP 客户端的工厂，便于测试替换实现。 */
    @FunctionalInterface
    public interface ImapClientFactory {
        ImapClient create(String host, int port, boolean useSsl, String email, String authCode);
    }

    /** 单个账号的测活结果。 */
    public record TestResult(long id, String email, boolean ok, String message, long latencyMs) {
    }

    /** 批量导入中单行的处理结果。 */
    public record ImportItem(String email, String status, String message) {
    }

    /** 批量导入的汇总结果。 */
    public record ImportResult(int total, int success, int failed, int skipped, List<ImportItem> results) {
    }

    private final AccountRepository accountRepo;
    private final MessageRepository messageRepo;
    private final AttachmentRepository attachmentRepo;
    private final CryptoUtil crypto;
    private final ImapClientFactory clientFactory;
    private final Path attachmentsDir;

    public AccountService(AccountRepository accountRepo,
                          MessageRepository messageRepo,
                          AttachmentRepository attachmentRepo,
                          CryptoUtil crypto,
                          ImapClientFactory clientFactory,
                          Path attachmentsDir) {
        this.accountRepo = accountRepo;
        this.messageRepo = messageRepo;
        this.attachmentRepo = attachmentRepo;
        this.crypto = crypto;
        this.clientFactory = clientFactory;
        this.attachmentsDir = attachmentsDir;
    }

    /**
     * 创建账号：加密授权码后入库。不自动测活，账号初始为"待检测"状态
     * （lastTestAt == 0），由用户手动触发单个或批量测活。
     *
     * @param email    邮箱地址
     * @param authCode 明文授权码
     * @return 创建后的账号
     */
    public Account createAccount(String email, String authCode) {
        String enc = crypto.encrypt(authCode);
        Account created = accountRepo.insert(email, enc);
        return created;
    }

    /** 解密账号中存储的授权码，返回明文。 */
    public String decryptAuthCode(Account account) {
        return crypto.decrypt(account.authCodeEnc());
    }

    /** 列出全部账号。 */
    public List<Account> listAccounts() {
        return accountRepo.listAll();
    }

    /**
     * 分页 + 邮箱搜索 + 状态过滤 + 排序查询账号（薄封装，委托给 repository）。
     *
     * @param email     邮箱子串（忽略大小写），null 或空白不过滤
     * @param status    状态过滤 pending/ok/fail，其他值不过滤
     * @param sortBy    排序字段，默认 lastSyncAt
     * @param sortOrder 排序方向 asc/desc，默认 desc
     * @param page      页码，从 1 开始
     * @param size      每页条数
     */
    public AccountRepository.PagedAccounts queryAccounts(String email, String status, String sortBy, String sortOrder, int page, int size) {
        return accountRepo.query(email, status, sortBy, sortOrder, page, size);
    }

    /** 按 id 查找账号。 */
    public Optional<Account> findById(long id) {
        return accountRepo.findById(id);
    }

    /**
     * 测试某账号的 IMAP 连通性，并把结果（成功 / 失败 + 信息 + 时间）持久化到账号。
     *
     * @return 是否连通成功
     */
    public boolean testConnection(long accountId) {
        Account account = accountRepo.findById(accountId)
                .orElseThrow(() -> new RuntimeException("账号不存在: " + accountId));
        long start = System.currentTimeMillis();
        boolean ok;
        String msg;
        try {
            ImapClient client = newClient(account);
            client.testConnection();
            ok = true;
            msg = "连接成功";
        } catch (Exception e) {
            ok = false;
            msg = rootMessage(e);
        }
        accountRepo.updateTestStatus(accountId, System.currentTimeMillis(), ok, msg);
        return ok;
    }

    /**
     * 批量测活。
     *
     * @param ids 账号 id 列表；传 null 表示测试全部账号
     * @return 每个账号的测活结果
     */
    public List<TestResult> testBatch(List<Long> ids) {
        List<Account> targets;
        if (ids == null) {
            targets = accountRepo.listAll();
        } else {
            targets = new ArrayList<>();
            for (Long id : ids) {
                accountRepo.findById(id).ifPresent(targets::add);
            }
        }

        List<TestResult> results = new ArrayList<>();
        for (Account account : targets) {
            long start = System.currentTimeMillis();
            boolean ok;
            String msg;
            try {
                newClient(account).testConnection();
                ok = true;
                msg = "连接成功";
            } catch (Exception e) {
                ok = false;
                msg = rootMessage(e);
            }
            long latency = System.currentTimeMillis() - start;
            accountRepo.updateTestStatus(account.id(), System.currentTimeMillis(), ok, msg);
            results.add(new TestResult(account.id(), account.email(), ok, msg, latency));
        }
        return results;
    }

    /**
     * 删除账号，并级联清理其邮件、附件记录及落盘附件文件。
     */
    public void deleteAccount(long accountId) {
        // 先清理该账号下所有邮件的附件（记录 + 文件），再删邮件，最后删账号
        List<Message> messages = messageRepo.listAllByAccount(accountId);
        for (Message m : messages) {
            for (Attachment att : attachmentRepo.findByMessage(m.id())) {
                deleteFileQuietly(att.filePath());
            }
            attachmentRepo.deleteByMessage(m.id());
        }
        messageRepo.deleteByAccount(accountId);
        accountRepo.delete(accountId);

        // 清理该账号的附件目录
        deleteDirQuietly(attachmentsDir.resolve(String.valueOf(accountId)));
    }

    /**
     * 批量删除账号，逐个级联清理其邮件、附件记录及落盘文件。
     * 不存在的 id 静默忽略。
     *
     * @param ids 待删除账号 id 列表
     * @return 实际删除的账号数量
     */
    public int deleteBatch(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int deleted = 0;
        for (Long id : ids) {
            if (accountRepo.findById(id).isPresent()) {
                deleteAccount(id);
                deleted++;
            }
        }
        return deleted;
    }

    /**
     * 从 txt 文本批量导入账号，每行格式 "账号 授权码"（空格或 Tab 分隔），
     * 忽略空行和以 # 开头的注释行。
     *
     * @param text      文本内容
     * @param test      导入后是否对成功导入的账号测活（false 则仅入库不测活）
     * @param overwrite 已存在邮箱是否覆盖授权码（false 则跳过）
     */
    public ImportResult importFromText(String text, boolean test, boolean overwrite) {
        List<ImportItem> items = new ArrayList<>();
        int total = 0, success = 0, failed = 0, skipped = 0;

        for (String rawLine : text.split("\n")) {
            String line = rawLine.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            total++;

            String[] parts = line.split("\\s+", 2);
            if (parts.length < 2 || parts[0].isBlank() || parts[1].isBlank()) {
                failed++;
                items.add(new ImportItem(parts.length > 0 ? parts[0] : line, "failed", "格式错误：应为 账号 授权码"));
                continue;
            }

            String email = parts[0].strip();
            String authCode = parts[1].strip();

            try {
                Optional<Account> existing = accountRepo.findByEmail(email);
                if (existing.isPresent()) {
                    if (!overwrite) {
                        skipped++;
                        items.add(new ImportItem(email, "skipped", "邮箱已存在，已跳过"));
                        continue;
                    }
                    // 覆盖授权码
                    accountRepo.updateAuthCode(existing.get().id(), crypto.encrypt(authCode));
                    if (test) {
                        testConnection(existing.get().id());
                    }
                    success++;
                    items.add(new ImportItem(email, "success", "已覆盖授权码"));
                } else {
                    Account created = accountRepo.insert(email, crypto.encrypt(authCode));
                    if (test) {
                        testConnection(created.id());
                    }
                    success++;
                    items.add(new ImportItem(email, "success", "导入成功"));
                }
            } catch (Exception e) {
                failed++;
                items.add(new ImportItem(email, "failed", rootMessage(e)));
            }
        }

        return new ImportResult(total, success, failed, skipped, items);
    }

    /** 用账号信息（解密授权码）构造 IMAP 客户端。 */
    private ImapClient newClient(Account account) {
        String authCode = crypto.decrypt(account.authCodeEnc());
        boolean useSsl = account.imapPort() == 993;
        return clientFactory.create(account.imapHost(), account.imapPort(), useSsl, account.email(), authCode);
    }

    /** 取异常链最底层的可读信息。 */
    private String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        return msg != null ? msg : cur.getClass().getSimpleName();
    }

    /** 删除单个附件文件，忽略异常。 */
    private void deleteFileQuietly(String filePath) {
        try {
            Files.deleteIfExists(attachmentsDir.getParent() == null
                    ? Path.of(filePath)
                    : resolveAttachmentPath(filePath));
        } catch (Exception ignored) {
        }
    }

    /** 把库中存的相对路径解析为绝对路径（相对附件根目录的上一级，即包含 attachments 段）。 */
    private Path resolveAttachmentPath(String storedPath) {
        // 库里存的是形如 attachments/{accountId}/{messageId}/{filename} 的相对路径
        Path p = Path.of(storedPath);
        if (p.isAbsolute()) {
            return p;
        }
        // attachmentsDir 指向 attachments 目录，去掉首段 attachments 再拼接
        Path base = attachmentsDir;
        return base.getParent() != null ? base.getParent().resolve(storedPath) : base.resolve(storedPath);
    }

    /** 递归删除目录，忽略异常。 */
    private void deleteDirQuietly(Path dir) {
        try {
            if (!Files.exists(dir)) {
                return;
            }
            Files.walk(dir)
                    .sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (Exception ignored) {
                        }
                    });
        } catch (Exception ignored) {
        }
    }
}
