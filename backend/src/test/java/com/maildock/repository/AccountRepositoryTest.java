package com.maildock.repository;

import com.maildock.model.Account;
import com.maildock.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AccountRepositoryTest {

    private Database db;
    private UserRepository userRepo;
    private AccountRepository repo;
    private Path dbFile;
    private User userA;
    private User userB;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-account-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        repo = new AccountRepository(db);
        userA = userRepo.insert("a@example.com", "User A", null);
        userB = userRepo.insert("b@example.com", "User B", null);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertThenFindByIdWithinUserScope() {
        Account created = repo.insert(userA.id(), "alice@163.com", "enc-auth-code");

        assertTrue(created.id() > 0);
        assertEquals(userA.id(), created.userId());
        assertEquals("alice@163.com", created.email());
        assertEquals("enc-auth-code", created.authCodeEnc());
        assertEquals("imap.163.com", created.imapHost());
        assertEquals(993, created.imapPort());
        assertEquals(0, created.lastUid());

        Optional<Account> found = repo.findById(userA.id(), created.id());
        assertTrue(found.isPresent());
        assertEquals("alice@163.com", found.get().email());
    }

    @Test
    void findByIdReturnsEmptyForAbsentOrOtherUser() {
        Account other = repo.insert(userB.id(), "other@163.com", "enc");

        assertTrue(repo.findById(userA.id(), 999).isEmpty());
        assertTrue(repo.findById(userA.id(), other.id()).isEmpty());
        assertTrue(repo.findById(userB.id(), other.id()).isPresent());
    }

    @Test
    void findByEmailIsScopedToUser() {
        repo.insert(userA.id(), "same@163.com", "enc-a");
        repo.insert(userB.id(), "same@163.com", "enc-b");

        Optional<Account> foundA = repo.findByEmail(userA.id(), "same@163.com");
        Optional<Account> foundB = repo.findByEmail(userB.id(), "same@163.com");

        assertTrue(foundA.isPresent());
        assertTrue(foundB.isPresent());
        assertNotEquals(foundA.get().id(), foundB.get().id());
        assertEquals(userA.id(), foundA.get().userId());
        assertEquals(userB.id(), foundB.get().userId());
    }

    @Test
    void duplicateEmailThrowsOnlyWithinSameUser() {
        repo.insert(userA.id(), "dup@163.com", "enc1");

        assertThrows(RuntimeException.class, () -> repo.insert(userA.id(), "dup@163.com", "enc2"));
        assertDoesNotThrow(() -> repo.insert(userB.id(), "dup@163.com", "enc3"));
    }

    @Test
    void listAllReturnsOnlyUserAccounts() {
        repo.insert(userA.id(), "a@163.com", "e1");
        repo.insert(userB.id(), "b@163.com", "e2");

        List<Account> all = repo.listAll(userA.id());

        assertEquals(1, all.size());
        assertEquals("a@163.com", all.get(0).email());
    }

    @Test
    void deleteRemovesOnlyUserScopedAccount() {
        Account own = repo.insert(userA.id(), "own@163.com", "enc");
        Account other = repo.insert(userB.id(), "other@163.com", "enc");

        repo.delete(userA.id(), other.id());
        assertTrue(repo.findById(userB.id(), other.id()).isPresent());

        repo.delete(userA.id(), own.id());
        assertTrue(repo.findById(userA.id(), own.id()).isEmpty());
    }

    @Test
    void updateSyncStateUpdatesOnlyUserScopedAccount() {
        Account own = repo.insert(userA.id(), "sync@163.com", "enc");
        Account other = repo.insert(userB.id(), "other-sync@163.com", "enc");

        repo.updateSyncState(userA.id(), other.id(), 99L, 99L, 1700000000000L);
        assertEquals(0, repo.findById(userB.id(), other.id()).orElseThrow().lastUid());

        repo.updateSyncState(userA.id(), own.id(), 42L, 1001L, 1700000000000L);
        Account updated = repo.findById(userA.id(), own.id()).orElseThrow();
        assertEquals(42L, updated.lastUid());
        assertEquals(1001L, updated.uidValidity());
        assertEquals(1700000000000L, updated.lastSyncAt());
    }

    @Test
    void updateTestStatusPersistsOnlyUserScopedResult() {
        Account own = repo.insert(userA.id(), "test@163.com", "enc");
        Account other = repo.insert(userB.id(), "other-test@163.com", "enc");

        repo.updateTestStatus(userA.id(), other.id(), 1700000000000L, true, "不应更新");
        assertEquals(0, repo.findById(userB.id(), other.id()).orElseThrow().lastTestAt());

        repo.updateTestStatus(userA.id(), own.id(), 1700000000000L, true, "连接成功");
        Account updated = repo.findById(userA.id(), own.id()).orElseThrow();
        assertEquals(1700000000000L, updated.lastTestAt());
        assertTrue(updated.lastTestOk());
        assertEquals("连接成功", updated.lastTestMsg());
    }

    @Test
    void queryPaginatesAndReturnsUserScopedTotal() {
        for (int i = 1; i <= 5; i++) {
            repo.insert(userA.id(), "u" + i + "@163.com", "enc");
        }
        repo.insert(userB.id(), "other@163.com", "enc");

        AccountRepository.PagedAccounts page1 = repo.query(userA.id(), null, null, null, null, 1, 2);
        assertEquals(5, page1.total());
        assertEquals(2, page1.items().size());

        AccountRepository.PagedAccounts page3 = repo.query(userA.id(), null, null, null, null, 3, 2);
        assertEquals(5, page3.total());
        assertEquals(1, page3.items().size(), "第 3 页只剩 1 条");
    }

    @Test
    void queryFiltersByEmailSubstringWithinUserScope() {
        repo.insert(userA.id(), "alice@163.com", "enc");
        repo.insert(userA.id(), "bob@163.com", "enc");
        repo.insert(userA.id(), "alician@gmail.com", "enc");
        repo.insert(userB.id(), "alice-other@163.com", "enc");

        AccountRepository.PagedAccounts r = repo.query(userA.id(), "alic", null, null, null, 1, 20);

        assertEquals(2, r.total());
        for (Account a : r.items()) {
            assertTrue(a.email().contains("alic"));
            assertEquals(userA.id(), a.userId());
        }
    }

    @Test
    void queryFiltersByStatusWithinUserScope() {
        Account pending = repo.insert(userA.id(), "pending@163.com", "enc");
        Account ok = repo.insert(userA.id(), "ok@163.com", "enc");
        Account fail = repo.insert(userA.id(), "fail@163.com", "enc");
        Account otherOk = repo.insert(userB.id(), "other-ok@163.com", "enc");
        repo.updateTestStatus(userA.id(), ok.id(), 1700000000000L, true, "连接成功");
        repo.updateTestStatus(userA.id(), fail.id(), 1700000000000L, false, "认证失败");
        repo.updateTestStatus(userB.id(), otherOk.id(), 1700000000000L, true, "连接成功");

        AccountRepository.PagedAccounts pendingPage = repo.query(userA.id(), null, "pending", null, null, 1, 20);
        assertEquals(1, pendingPage.total());
        assertEquals(pending.id(), pendingPage.items().get(0).id());

        AccountRepository.PagedAccounts okPage = repo.query(userA.id(), null, "ok", null, null, 1, 20);
        assertEquals(1, okPage.total());
        assertEquals("ok@163.com", okPage.items().get(0).email());

        AccountRepository.PagedAccounts failPage = repo.query(userA.id(), null, "fail", null, null, 1, 20);
        assertEquals(1, failPage.total());
        assertEquals("fail@163.com", failPage.items().get(0).email());
    }

    @Test
    void queryReturnsMessageCountForEachAccount() {
        Account acc1 = repo.insert(userA.id(), "user1@163.com", "enc");
        Account acc2 = repo.insert(userA.id(), "user2@163.com", "enc");
        Account acc3 = repo.insert(userB.id(), "userb@163.com", "enc");

        // 插入邮件：acc1 有 3 封，acc2 有 0 封，acc3 有 1 封
        MessageRepository msgRepo = new MessageRepository(db);
        msgRepo.insert(new com.maildock.model.Message(0, acc1.id(), 1L, "msg1@example.com", "Subject 1", "from1@example.com", "to1@example.com", null, 1700000000000L, 1700000000000L, "body1", null, false, false, 1024, 0));
        msgRepo.insert(new com.maildock.model.Message(0, acc1.id(), 2L, "msg2@example.com", "Subject 2", "from2@example.com", "to2@example.com", null, 1700000001000L, 1700000001000L, "body2", null, false, false, 1024, 0));
        msgRepo.insert(new com.maildock.model.Message(0, acc1.id(), 3L, "msg3@example.com", "Subject 3", "from3@example.com", "to3@example.com", null, 1700000002000L, 1700000002000L, "body3", null, false, false, 1024, 0));
        msgRepo.insert(new com.maildock.model.Message(0, acc3.id(), 1L, "msgb@example.com", "Subject B", "fromb@example.com", "tob@example.com", null, 1700000000000L, 1700000000000L, "bodyb", null, false, false, 1024, 0));

        AccountRepository.PagedAccounts result = repo.query(userA.id(), null, null, null, null, 1, 20);

        assertEquals(2, result.items().size());
        Account foundAcc1 = result.items().stream().filter(a -> a.email().equals("user1@163.com")).findFirst().orElseThrow();
        Account foundAcc2 = result.items().stream().filter(a -> a.email().equals("user2@163.com")).findFirst().orElseThrow();

        assertEquals(3, foundAcc1.messageCount(), "user1@163.com 应该有 3 封邮件");
        assertEquals(0, foundAcc2.messageCount(), "user2@163.com 应该有 0 封邮件");
    }
}
