package com.maildock.service;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AccountServiceTest {

    // 内嵌 IMAP 服务器，用于测活验证（明文）
    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 字节
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Database db;
    private AccountRepository accountRepo;
    private AccountService service;
    private Path dbFile;
    private Path attachmentsDir;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-acct-svc", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        accountRepo = new AccountRepository(db);
        MessageRepository messageRepo = new MessageRepository(db);
        AttachmentRepository attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);

        // GreenMail 用户：用户名/密码即邮箱地址与授权码
        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
            // 已存在则复用
        }

        // 工厂忽略账号里存的 163 主机，统一指向 GreenMail，便于测试测活逻辑
        AccountService.ImapClientFactory factory =
                (host, port, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", ServerSetupTest.IMAP.getPort(), false, email, authCode);

        service = new AccountService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void createAccountEncryptsAuthCodeAndPersists() {
        // 创建账号：授权码应加密存储（库中不是明文），并能解密回原值
        Account created = service.createAccount(EMAIL, AUTH_CODE);

        assertTrue(created.id() > 0);
        Account stored = accountRepo.findById(created.id()).orElseThrow();
        assertNotEquals(AUTH_CODE, stored.authCodeEnc(), "授权码不应明文存储");
        assertEquals(AUTH_CODE, service.decryptAuthCode(stored), "应能解密回原始授权码");
    }

    @Test
    void createAccountDoesNotAutoTestAndStaysPending() {
        // 创建账号不再自动测活，初始为待检测状态（lastTestAt == 0）
        Account created = service.createAccount(EMAIL, AUTH_CODE);

        Account stored = accountRepo.findById(created.id()).orElseThrow();
        assertEquals(0, stored.lastTestAt(), "创建后不应自动测活，应保持待检测");
    }

    @Test
    void createDuplicateEmailThrows() {
        // 邮箱唯一：重复创建抛异常
        service.createAccount(EMAIL, AUTH_CODE);
        assertThrows(RuntimeException.class, () -> service.createAccount(EMAIL, AUTH_CODE));
    }

    @Test
    void listAccountsReturnsAll() {
        // 列出全部账号
        service.createAccount(EMAIL, AUTH_CODE);
        List<Account> all = service.listAccounts();
        assertEquals(1, all.size());
    }

    @Test
    void queryAccountsDelegatesPaginationAndFilter() {
        // 分页 + 邮箱搜索 + 状态过滤：薄封装委托给 repository
        for (int i = 1; i <= 3; i++) {
            service.createAccount("user" + i + "@163.com", AUTH_CODE);
        }
        AccountRepository.PagedAccounts page = service.queryAccounts("user", null, null, null, 1, 2);
        assertEquals(3, page.total());
        assertEquals(2, page.items().size());
    }

    @Test
    void testConnectionUpdatesStatusOnSuccess() {
        // 单个测活成功时更新状态为成功
        Account created = service.createAccount(EMAIL, AUTH_CODE);

        boolean ok = service.testConnection(created.id());

        assertTrue(ok);
        Account stored = accountRepo.findById(created.id()).orElseThrow();
        assertTrue(stored.lastTestOk());
    }

    @Test
    void testConnectionUpdatesStatusOnFailure() {
        // 授权码错误时测活失败并记录失败状态
        Account bad = service.createAccount("bad@example.com", "wrong-code");

        boolean ok = service.testConnection(bad.id());

        assertFalse(ok, "错误授权码测活应失败");
        Account stored = accountRepo.findById(bad.id()).orElseThrow();
        assertFalse(stored.lastTestOk(), "错误授权码测活应失败");
        assertNotNull(stored.lastTestMsg(), "应记录失败原因");
    }

    @Test
    void deleteAccountRemovesIt() {
        // 删除账号后查不到
        Account created = service.createAccount(EMAIL, AUTH_CODE);
        service.deleteAccount(created.id());
        assertTrue(accountRepo.findById(created.id()).isEmpty());
    }

    @Test
    void deleteBatchRemovesMultipleAccounts() {
        // 批量删除：传入多个 id，全部删除，返回成功删除的数量
        Account a1 = service.createAccount(EMAIL, AUTH_CODE);
        Account a2 = service.createAccount("a2@example.com", AUTH_CODE);
        Account a3 = service.createAccount("a3@example.com", AUTH_CODE);

        int deleted = service.deleteBatch(List.of(a1.id(), a2.id()));

        assertEquals(2, deleted, "应删除 2 个账号");
        assertTrue(accountRepo.findById(a1.id()).isEmpty());
        assertTrue(accountRepo.findById(a2.id()).isEmpty());
        assertTrue(accountRepo.findById(a3.id()).isPresent(), "未选中的账号应保留");
    }

    @Test
    void deleteBatchIgnoresNonexistentIds() {
        // 批量删除：不存在的 id 被忽略，只统计真正删除的数量
        Account a1 = service.createAccount(EMAIL, AUTH_CODE);

        int deleted = service.deleteBatch(List.of(a1.id(), 99999L));

        assertEquals(1, deleted, "只应删除存在的账号");
        assertTrue(accountRepo.findById(a1.id()).isEmpty());
    }

    @Test
    void testBatchReturnsResultPerAccount() {
        // 批量测活返回每个账号的结果
        Account a1 = service.createAccount(EMAIL, AUTH_CODE);
        Account a2 = service.createAccount("bad@example.com", "wrong-code");

        List<AccountService.TestResult> results = service.testBatch(List.of(a1.id(), a2.id()));

        assertEquals(2, results.size());
        Optional<AccountService.TestResult> r1 =
                results.stream().filter(r -> r.id() == a1.id()).findFirst();
        Optional<AccountService.TestResult> r2 =
                results.stream().filter(r -> r.id() == a2.id()).findFirst();
        assertTrue(r1.isPresent() && r1.get().ok(), "正确凭据应成功");
        assertTrue(r2.isPresent() && !r2.get().ok(), "错误凭据应失败");
    }

    @Test
    void testBatchWithNullTestsAllAccounts() {
        // 不传 ids 则测试全部账号
        service.createAccount(EMAIL, AUTH_CODE);
        service.createAccount("bad@example.com", "wrong-code");

        List<AccountService.TestResult> results = service.testBatch(null);

        assertEquals(2, results.size());
    }

    @Test
    void importFromTextParsesAndCreatesAccounts() {
        // 批量导入：每行 "账号 授权码"，忽略空行和 # 注释
        String txt = """
                # 这是注释行
                owner@example.com secret-pass

                another@example.com code-2
                """;

        AccountService.ImportResult result = service.importFromText(txt, false, false);

        assertEquals(2, result.total());
        assertEquals(2, result.success());
        assertEquals(0, result.failed());
        assertEquals(2, accountRepo.listAll().size());
    }

    @Test
    void importSkipsExistingByDefault() {
        // 已存在邮箱默认跳过，不覆盖
        service.createAccount(EMAIL, AUTH_CODE);

        AccountService.ImportResult result = service.importFromText(EMAIL + " new-code", false, false);

        assertEquals(1, result.total());
        assertEquals(0, result.success(), "已存在应跳过");
        assertEquals(1, result.skipped());
        // 授权码未被覆盖
        Account stored = accountRepo.findByEmail(EMAIL).orElseThrow();
        assertEquals(AUTH_CODE, service.decryptAuthCode(stored));
    }

    @Test
    void importOverwriteUpdatesExistingAuthCode() {
        // overwrite=true 时覆盖已存在邮箱的授权码
        service.createAccount(EMAIL, AUTH_CODE);

        AccountService.ImportResult result = service.importFromText(EMAIL + " new-code", false, true);

        assertEquals(1, result.success());
        Account stored = accountRepo.findByEmail(EMAIL).orElseThrow();
        assertEquals("new-code", service.decryptAuthCode(stored), "授权码应被覆盖");
    }

    @Test
    void importReportsMalformedLines() {
        // 格式错误的行（缺少授权码）应计入失败
        String txt = "only-email-no-code\ngood@example.com code";

        AccountService.ImportResult result = service.importFromText(txt, false, false);

        assertEquals(2, result.total());
        assertEquals(1, result.success());
        assertEquals(1, result.failed());
    }
}
