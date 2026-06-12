package com.maildock.service;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
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

    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef";
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Database db;
    private UserRepository userRepo;
    private AccountRepository accountRepo;
    private AccountService service;
    private Path dbFile;
    private Path attachmentsDir;
    private User userA;
    private User userB;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-acct-svc", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        userA = userRepo.insert("a@example.com", "User A", null);
        userB = userRepo.insert("b@example.com", "User B", null);
        accountRepo = new AccountRepository(db);
        MessageRepository messageRepo = new MessageRepository(db);
        AttachmentRepository attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);

        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
            // 已存在则复用
        }

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
    void createAccountEncryptsAuthCodeAndPersistsForUser() {
        Account created = service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        assertTrue(created.id() > 0);
        assertEquals(userA.id(), created.userId());
        Account stored = accountRepo.findById(userA.id(), created.id()).orElseThrow();
        assertNotEquals(AUTH_CODE, stored.authCodeEnc(), "授权码不应明文存储");
        assertEquals(AUTH_CODE, service.decryptAuthCode(stored), "应能解密回原始授权码");
    }

    @Test
    void createAccountDoesNotAutoTestAndStaysPending() {
        Account created = service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        Account stored = accountRepo.findById(userA.id(), created.id()).orElseThrow();
        assertEquals(0, stored.lastTestAt(), "创建后不应自动测活，应保持待检测");
    }

    @Test
    void sameMailboxCanBeCreatedForDifferentUsers() {
        Account a = service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        Account b = service.createAccount(userB.id(), EMAIL, AUTH_CODE);

        assertNotEquals(a.id(), b.id());
        assertEquals(userA.id(), a.userId());
        assertEquals(userB.id(), b.userId());
    }

    @Test
    void createDuplicateEmailThrowsOnlyWithinSameUser() {
        service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        assertThrows(RuntimeException.class, () -> service.createAccount(userA.id(), EMAIL, AUTH_CODE));
        assertDoesNotThrow(() -> service.createAccount(userB.id(), EMAIL, AUTH_CODE));
    }

    @Test
    void listAccountsReturnsOnlyCurrentUserAccounts() {
        service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        service.createAccount(userB.id(), "other@example.com", AUTH_CODE);

        List<Account> all = service.listAccounts(userA.id());

        assertEquals(1, all.size());
        assertEquals(EMAIL, all.get(0).email());
    }

    @Test
    void queryAccountsReturnsOnlyCurrentUserAccounts() {
        service.createAccount(userA.id(), "a@163.com", AUTH_CODE);
        service.createAccount(userB.id(), "b@163.com", AUTH_CODE);

        AccountRepository.PagedAccounts page =
                service.queryAccounts(userA.id(), null, null, "lastSyncAt", "desc", 1, 20);

        assertEquals(1, page.total());
        assertEquals("a@163.com", page.items().get(0).email());
    }

    @Test
    void queryAccountsDelegatesPaginationAndFilterWithinUserScope() {
        for (int i = 1; i <= 3; i++) {
            service.createAccount(userA.id(), "user" + i + "@163.com", AUTH_CODE);
        }
        service.createAccount(userB.id(), "user-other@163.com", AUTH_CODE);

        AccountRepository.PagedAccounts page =
                service.queryAccounts(userA.id(), "user", null, null, null, 1, 2);

        assertEquals(3, page.total());
        assertEquals(2, page.items().size());
        for (Account account : page.items()) {
            assertEquals(userA.id(), account.userId());
        }
    }

    @Test
    void findByIdRejectsOtherUsersAccount() {
        Account other = service.createAccount(userB.id(), EMAIL, AUTH_CODE);

        assertTrue(service.findById(userA.id(), other.id()).isEmpty());
        assertTrue(service.findById(userB.id(), other.id()).isPresent());
    }

    @Test
    void testConnectionUpdatesStatusOnSuccess() {
        Account created = service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        boolean ok = service.testConnection(userA.id(), created.id());

        assertTrue(ok);
        Account stored = accountRepo.findById(userA.id(), created.id()).orElseThrow();
        assertTrue(stored.lastTestOk());
    }

    @Test
    void testConnectionRejectsOtherUsersAccount() {
        Account other = service.createAccount(userB.id(), EMAIL, AUTH_CODE);

        assertThrows(RuntimeException.class, () -> service.testConnection(userA.id(), other.id()));
    }

    @Test
    void testConnectionUpdatesStatusOnFailure() {
        Account bad = service.createAccount(userA.id(), "bad@example.com", "wrong-code");

        boolean ok = service.testConnection(userA.id(), bad.id());

        assertFalse(ok, "错误授权码测活应失败");
        Account stored = accountRepo.findById(userA.id(), bad.id()).orElseThrow();
        assertFalse(stored.lastTestOk(), "错误授权码测活应失败");
        assertNotNull(stored.lastTestMsg(), "应记录失败原因");
    }

    @Test
    void deleteAccountRemovesOnlyCurrentUsersAccount() {
        Account own = service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        Account other = service.createAccount(userB.id(), "other@example.com", AUTH_CODE);

        assertThrows(RuntimeException.class, () -> service.deleteAccount(userA.id(), other.id()));
        assertTrue(accountRepo.findById(userB.id(), other.id()).isPresent());

        service.deleteAccount(userA.id(), own.id());
        assertTrue(accountRepo.findById(userA.id(), own.id()).isEmpty());
    }

    @Test
    void deleteBatchIgnoresOtherUsersAccounts() {
        Account own = service.createAccount(userA.id(), "a@163.com", AUTH_CODE);
        Account other = service.createAccount(userB.id(), "b@163.com", AUTH_CODE);

        int deleted = service.deleteBatch(userA.id(), List.of(own.id(), other.id()));

        assertEquals(1, deleted);
        assertTrue(accountRepo.findById(userA.id(), own.id()).isEmpty());
        assertTrue(accountRepo.findById(userB.id(), other.id()).isPresent());
    }

    @Test
    void deleteBatchIgnoresNonexistentIds() {
        Account a1 = service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        int deleted = service.deleteBatch(userA.id(), List.of(a1.id(), 99999L));

        assertEquals(1, deleted, "只应删除存在且属于当前用户的账号");
        assertTrue(accountRepo.findById(userA.id(), a1.id()).isEmpty());
    }

    @Test
    void testBatchReturnsResultPerCurrentUserAccount() {
        Account a1 = service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        Account a2 = service.createAccount(userA.id(), "bad@example.com", "wrong-code");
        Account other = service.createAccount(userB.id(), "other@example.com", AUTH_CODE);

        List<AccountService.TestResult> results = service.testBatch(userA.id(), List.of(a1.id(), a2.id(), other.id()));

        assertEquals(2, results.size());
        Optional<AccountService.TestResult> r1 =
                results.stream().filter(r -> r.id() == a1.id()).findFirst();
        Optional<AccountService.TestResult> r2 =
                results.stream().filter(r -> r.id() == a2.id()).findFirst();
        assertTrue(r1.isPresent() && r1.get().ok(), "正确凭据应成功");
        assertTrue(r2.isPresent() && !r2.get().ok(), "错误凭据应失败");
    }

    @Test
    void testBatchWithNullTestsOnlyCurrentUsersAccounts() {
        service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        service.createAccount(userA.id(), "bad@example.com", "wrong-code");
        service.createAccount(userB.id(), "other@example.com", AUTH_CODE);

        List<AccountService.TestResult> results = service.testBatch(userA.id(), null);

        assertEquals(2, results.size());
    }

    @Test
    void importFromTextParsesAndCreatesAccountsForCurrentUser() {
        String txt = """
                # 这是注释行
                owner@example.com secret-pass

                another@example.com code-2
                """;

        AccountService.ImportResult result = service.importFromText(userA.id(), txt, false, false);

        assertEquals(2, result.total());
        assertEquals(2, result.success());
        assertEquals(0, result.failed());
        assertEquals(2, accountRepo.listAll(userA.id()).size());
        assertEquals(0, accountRepo.listAll(userB.id()).size());
    }

    @Test
    void importSkipsExistingByDefaultWithinCurrentUserOnly() {
        service.createAccount(userA.id(), EMAIL, AUTH_CODE);
        service.createAccount(userB.id(), "other@example.com", AUTH_CODE);

        AccountService.ImportResult result =
                service.importFromText(userA.id(), EMAIL + " new-code\nother@example.com other-code", false, false);

        assertEquals(2, result.total());
        assertEquals(1, result.success());
        assertEquals(1, result.skipped());
        Account stored = accountRepo.findByEmail(userA.id(), EMAIL).orElseThrow();
        assertEquals(AUTH_CODE, service.decryptAuthCode(stored));
        assertTrue(accountRepo.findByEmail(userA.id(), "other@example.com").isPresent());
    }

    @Test
    void importOverwriteUpdatesExistingAuthCodeWithinCurrentUser() {
        service.createAccount(userA.id(), EMAIL, AUTH_CODE);

        AccountService.ImportResult result = service.importFromText(userA.id(), EMAIL + " new-code", false, true);

        assertEquals(1, result.success());
        Account stored = accountRepo.findByEmail(userA.id(), EMAIL).orElseThrow();
        assertEquals("new-code", service.decryptAuthCode(stored), "授权码应被覆盖");
    }

    @Test
    void importReportsMalformedLines() {
        String txt = "only-email-no-code\ngood@example.com code";

        AccountService.ImportResult result = service.importFromText(userA.id(), txt, false, false);

        assertEquals(2, result.total());
        assertEquals(1, result.success());
        assertEquals(1, result.failed());
    }
}
