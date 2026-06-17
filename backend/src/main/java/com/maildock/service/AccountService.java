package com.maildock.service;

import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.storage.AttachmentStorage;

import java.nio.file.Path;
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
    private final CryptoUtil crypto;
    private final AccountConnectionTester connectionTester;
    private final AccountImporter accountImporter;
    private final AccountDeletionService deletionService;

    public AccountService(AccountRepository accountRepo,
                          MessageRepository messageRepo,
                          AttachmentRepository attachmentRepo,
                          CryptoUtil crypto,
                          ImapClientFactory clientFactory,
                          Path attachmentsDir) {
        this(accountRepo, messageRepo, attachmentRepo, crypto, clientFactory, new AttachmentStorage(attachmentRepo, attachmentsDir));
    }

    public AccountService(AccountRepository accountRepo,
                          MessageRepository messageRepo,
                          AttachmentRepository attachmentRepo,
                          CryptoUtil crypto,
                          ImapClientFactory clientFactory,
                          AttachmentStorage attachmentStorage) {
        this.accountRepo = accountRepo;
        this.crypto = crypto;
        this.connectionTester = new AccountConnectionTester(accountRepo, crypto, clientFactory);
        this.accountImporter = new AccountImporter(accountRepo, crypto, connectionTester);
        this.deletionService = new AccountDeletionService(accountRepo, messageRepo, attachmentRepo, attachmentStorage);
    }

    /**
     * 创建账号：加密授权码后入库。不自动测活，账号初始为"待检测"状态
     * （lastTestAt == 0），由用户手动触发单个或批量测活。
     *
     * @param email    邮箱地址
     * @param authCode 明文授权码
     * @return 创建后的账号
     */
    public Account createAccount(long userId, String email, String authCode) {
        String enc = crypto.encrypt(authCode);
        return accountRepo.insert(userId, email, enc);
    }

    /** 解密账号中存储的授权码，返回明文。 */
    public String decryptAuthCode(Account account) {
        return crypto.decrypt(account.authCodeEnc());
    }

    /** 列出全部账号。 */
    public List<Account> listAccounts(long userId) {
        return accountRepo.listAll(userId);
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
    public AccountRepository.PagedAccounts queryAccounts(long userId, String email, String status, String sortBy, String sortOrder, int page, int size) {
        return accountRepo.query(userId, email, status, sortBy, sortOrder, page, size);
    }

    /** 按 id 查找账号。 */
    public Optional<Account> findById(long userId, long id) {
        return accountRepo.findById(userId, id);
    }

    /**
     * 测试某账号的 IMAP 连通性，并把结果（成功 / 失败 + 信息 + 时间）持久化到账号。
     *
     * @return 是否连通成功
     */
    public boolean testConnection(long userId, long accountId) {
        return connectionTester.testConnection(userId, accountId);
    }

    /**
     * 批量测活。
     *
     * @param ids 账号 id 列表；传 null 表示测试全部账号
     * @return 每个账号的测活结果
     */
    public List<TestResult> testBatch(long userId, List<Long> ids) {
        return connectionTester.testBatch(userId, ids);
    }

    /**
     * 删除账号，并级联清理其邮件、附件记录及落盘附件文件。
     */
    public void deleteAccount(long userId, long accountId) {
        deletionService.deleteAccount(userId, accountId);
    }

    /**
     * 批量删除账号，逐个级联清理其邮件、附件记录及落盘文件。
     * 不存在的 id 静默忽略。
     *
     * @param ids 待删除账号 id 列表
     * @return 实际删除的账号数量
     */
    public int deleteBatch(long userId, List<Long> ids) {
        return deletionService.deleteBatch(userId, ids);
    }

    /**
     * 从 txt 文本批量导入账号，每行格式 "账号 授权码"（空格或 Tab 分隔），
     * 忽略空行和以 # 开头的注释行。
     *
     * @param text      文本内容
     * @param test      导入后是否对成功导入的账号测活（false 则仅入库不测活）
     * @param overwrite 已存在邮箱是否覆盖授权码（false 则跳过）
     */
    public ImportResult importFromText(long userId, String text, boolean test, boolean overwrite) {
        return accountImporter.importFromText(userId, text, test, overwrite);
    }
}
