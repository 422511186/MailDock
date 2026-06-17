package com.maildock.service;

import com.maildock.model.Account;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.Database;
import com.maildock.repository.UserRepository;
import com.maildock.security.CryptoUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountConnectionTesterTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Database db;
    private AccountRepository accountRepo;
    private CryptoUtil crypto;
    private Path dbFile;
    private long userAId;
    private long userBId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-account-connection", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        User userA = userRepo.insert("a@example.com", "User A", null);
        User userB = userRepo.insert("b@example.com", "User B", null);
        userAId = userA.id();
        userBId = userB.id();
        accountRepo = new AccountRepository(db);
        crypto = new CryptoUtil(KEY);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void testConnectionUpdatesCurrentUsersStatus() {
        Account account = accountRepo.insert(userAId, "ok@163.com", crypto.encrypt("code"));
        AccountConnectionTester tester = new AccountConnectionTester(
                accountRepo,
                (AccountConnectionTester.AccountProbe) a ->
                        new AccountConnectionTester.ProbeResult(true, "连接成功", 12L));

        boolean ok = tester.testConnection(userAId, account.id());

        assertTrue(ok);
        Account stored = accountRepo.findById(userAId, account.id()).orElseThrow();
        assertTrue(stored.lastTestOk());
        assertEquals("连接成功", stored.lastTestMsg());
    }

    @Test
    void testConnectionRejectsOtherUsersAccount() {
        Account other = accountRepo.insert(userBId, "other@163.com", crypto.encrypt("code"));
        AccountConnectionTester tester = new AccountConnectionTester(
                accountRepo,
                (AccountConnectionTester.AccountProbe) a ->
                        new AccountConnectionTester.ProbeResult(true, "连接成功", 1L));

        assertThrows(RuntimeException.class, () -> tester.testConnection(userAId, other.id()));
    }

    @Test
    void testBatchOnlyReturnsCurrentUsersAccounts() {
        Account a1 = accountRepo.insert(userAId, "a1@163.com", crypto.encrypt("code-1"));
        Account a2 = accountRepo.insert(userAId, "a2@163.com", crypto.encrypt("code-2"));
        Account other = accountRepo.insert(userBId, "b1@163.com", crypto.encrypt("code-3"));
        AccountConnectionTester tester = new AccountConnectionTester(
                accountRepo,
                (AccountConnectionTester.AccountProbe) a ->
                        new AccountConnectionTester.ProbeResult(!a.email().startsWith("a2"), a.email(), 5L));

        List<AccountService.TestResult> results = tester.testBatch(userAId, List.of(a1.id(), a2.id(), other.id()));

        assertEquals(2, results.size());
        assertEquals(List.of("a1@163.com", "a2@163.com"),
                results.stream().map(AccountService.TestResult::email).toList());
        assertTrue(results.get(0).ok());
        assertFalse(results.get(1).ok());
    }
}
