package com.maildock.repository;

import com.maildock.model.Account;
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
    private AccountRepository repo;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        // 每个测试使用独立的临时 SQLite 文件库
        dbFile = Files.createTempFile("maildock-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        repo = new AccountRepository(db);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertThenFindById() {
        // 插入账号后应能按 id 查回，且字段一致
        Account created = repo.insert("alice@163.com", "enc-auth-code");

        assertTrue(created.id() > 0);
        assertEquals("alice@163.com", created.email());
        assertEquals("enc-auth-code", created.authCodeEnc());
        assertEquals("imap.163.com", created.imapHost());
        assertEquals(993, created.imapPort());
        assertEquals(0, created.lastUid());

        Optional<Account> found = repo.findById(created.id());
        assertTrue(found.isPresent());
        assertEquals("alice@163.com", found.get().email());
    }

    @Test
    void findByIdReturnsEmptyWhenAbsent() {
        // 不存在的 id 返回空
        assertTrue(repo.findById(999).isEmpty());
    }

    @Test
    void findByEmailReturnsAccount() {
        // 按邮箱地址查找
        repo.insert("bob@163.com", "enc");
        Optional<Account> found = repo.findByEmail("bob@163.com");
        assertTrue(found.isPresent());
        assertEquals("bob@163.com", found.get().email());
    }

    @Test
    void duplicateEmailThrows() {
        // 邮箱唯一约束：重复插入应抛异常
        repo.insert("dup@163.com", "enc1");
        assertThrows(RuntimeException.class, () -> repo.insert("dup@163.com", "enc2"));
    }

    @Test
    void listAllReturnsAllAccounts() {
        // 列出全部账号
        repo.insert("a@163.com", "e1");
        repo.insert("b@163.com", "e2");
        List<Account> all = repo.listAll();
        assertEquals(2, all.size());
    }

    @Test
    void deleteRemovesAccount() {
        // 删除账号后查不到
        Account a = repo.insert("del@163.com", "enc");
        repo.delete(a.id());
        assertTrue(repo.findById(a.id()).isEmpty());
    }

    @Test
    void updateSyncStateUpdatesUidAndTimestamp() {
        // 更新增量同步状态：last_uid / uid_validity / last_sync_at
        Account a = repo.insert("sync@163.com", "enc");
        repo.updateSyncState(a.id(), 42L, 1001L, 1700000000000L);

        Account updated = repo.findById(a.id()).orElseThrow();
        assertEquals(42L, updated.lastUid());
        assertEquals(1001L, updated.uidValidity());
        assertEquals(1700000000000L, updated.lastSyncAt());
    }

    @Test
    void updateTestStatusPersistsResult() {
        // 更新测活状态：last_test_at / last_test_ok / last_test_msg
        Account a = repo.insert("test@163.com", "enc");
        repo.updateTestStatus(a.id(), 1700000000000L, true, "连接成功");

        Account updated = repo.findById(a.id()).orElseThrow();
        assertEquals(1700000000000L, updated.lastTestAt());
        assertTrue(updated.lastTestOk());
        assertEquals("连接成功", updated.lastTestMsg());
    }

    @Test
    void queryPaginatesAndReturnsTotal() {
        // 分页：每页 2 条，共 5 条，第 1 页返回 2 条但 total=5
        for (int i = 1; i <= 5; i++) {
            repo.insert("u" + i + "@163.com", "enc");
        }
        AccountRepository.PagedAccounts page1 = repo.query(null, null, null, null, 1, 2);
        assertEquals(5, page1.total());
        assertEquals(2, page1.items().size());

        AccountRepository.PagedAccounts page3 = repo.query(null, null, null, null, 3, 2);
        assertEquals(5, page3.total());
        assertEquals(1, page3.items().size(), "第 3 页只剩 1 条");
    }

    @Test
    void queryFiltersByEmailSubstring() {
        // 邮箱模糊搜索（子串，忽略大小写）
        repo.insert("alice@163.com", "enc");
        repo.insert("bob@163.com", "enc");
        repo.insert("alician@gmail.com", "enc");

        AccountRepository.PagedAccounts r = repo.query("alic", null, null, null, 1, 20);
        assertEquals(2, r.total());
        for (Account a : r.items()) {
            assertTrue(a.email().contains("alic"));
        }
    }

    @Test
    void queryFiltersByStatus() {
        // 三态过滤：pending（未测）/ ok（测活成功）/ fail（测活失败）
        Account pending = repo.insert("pending@163.com", "enc");
        Account ok = repo.insert("ok@163.com", "enc");
        Account fail = repo.insert("fail@163.com", "enc");
        repo.updateTestStatus(ok.id(), 1700000000000L, true, "连接成功");
        repo.updateTestStatus(fail.id(), 1700000000000L, false, "认证失败");

        AccountRepository.PagedAccounts pendingPage = repo.query(null, "pending", null, null, 1, 20);
        assertEquals(1, pendingPage.total());
        assertEquals("pending@163.com", pendingPage.items().get(0).email());

        AccountRepository.PagedAccounts okPage = repo.query(null, "ok", null, null, 1, 20);
        assertEquals(1, okPage.total());
        assertEquals("ok@163.com", okPage.items().get(0).email());

        AccountRepository.PagedAccounts failPage = repo.query(null, "fail", null, null, 1, 20);
        assertEquals(1, failPage.total());
        assertEquals("fail@163.com", failPage.items().get(0).email());
    }
}
