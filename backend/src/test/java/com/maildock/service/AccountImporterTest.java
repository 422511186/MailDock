package com.maildock.service;

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
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountImporterTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Database db;
    private AccountRepository accountRepo;
    private CryptoUtil crypto;
    private Path dbFile;
    private long userAId;
    private long userBId;
    private List<String> testedEmails;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-account-importer", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        User userA = userRepo.insert("a@example.com", "User A", null);
        User userB = userRepo.insert("b@example.com", "User B", null);
        userAId = userA.id();
        userBId = userB.id();
        accountRepo = new AccountRepository(db);
        crypto = new CryptoUtil(KEY);
        testedEmails = new ArrayList<>();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void importCreatesAccountsWithinCurrentUserScope() {
        AccountImporter importer = newImporter();

        AccountService.ImportResult result = importer.importFromText(
                userAId,
                "first@163.com code-1\nsecond@163.com code-2\n",
                false,
                false);

        assertEquals(2, result.total());
        assertEquals(2, result.success());
        assertEquals(2, accountRepo.listAll(userAId).size());
        assertEquals(0, accountRepo.listAll(userBId).size());
    }

    @Test
    void importOverwriteUpdatesOnlyCurrentUsersExistingAccount() {
        accountRepo.insert(userAId, "shared@163.com", crypto.encrypt("old-a"));
        accountRepo.insert(userBId, "shared@163.com", crypto.encrypt("old-b"));
        AccountImporter importer = newImporter();

        AccountService.ImportResult result = importer.importFromText(
                userAId,
                "shared@163.com new-code",
                false,
                true);

        assertEquals(1, result.success());
        assertEquals("new-code", crypto.decrypt(accountRepo.findByEmail(userAId, "shared@163.com").orElseThrow().authCodeEnc()));
        assertEquals("old-b", crypto.decrypt(accountRepo.findByEmail(userBId, "shared@163.com").orElseThrow().authCodeEnc()));
    }

    @Test
    void importWithTestRunsProbeForCreatedOrOverwrittenAccounts() {
        accountRepo.insert(userAId, "existing@163.com", crypto.encrypt("old"));
        AccountImporter importer = newImporter();

        AccountService.ImportResult result = importer.importFromText(
                userAId,
                "existing@163.com replacement\nnew@163.com new-pass",
                true,
                true);

        assertEquals(2, result.success());
        assertEquals(List.of("existing@163.com", "new@163.com"), testedEmails);
    }

    @Test
    void importNullTextTreatsAsEmptyInput() {
        AccountImporter importer = newImporter();

        AccountService.ImportResult result = importer.importFromText(userAId, null, false, false);

        assertEquals(0, result.total());
        assertEquals(0, result.success());
        assertEquals(0, result.failed());
        assertEquals(0, result.skipped());
        assertTrue(result.results().isEmpty());
    }

    private AccountImporter newImporter() {
        AccountConnectionTester tester = new AccountConnectionTester(
                accountRepo,
                (AccountConnectionTester.AccountProbe) account -> {
                    testedEmails.add(account.email());
                    return new AccountConnectionTester.ProbeResult(true, "连接成功", 1L);
                });
        return new AccountImporter(accountRepo, crypto, tester);
    }
}
