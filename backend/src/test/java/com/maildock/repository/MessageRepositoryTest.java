package com.maildock.repository;

import com.maildock.model.Account;
import com.maildock.model.Message;
import com.maildock.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class MessageRepositoryTest {

    private Database db;
    private AccountRepository accountRepo;
    private UserRepository userRepo;
    private MessageRepository repo;
    private Path dbFile;
    private User userA;
    private User userB;
    private long accountId;
    private long otherAccountId;

    @BeforeEach
    void setUp() throws Exception {
        // 每个测试使用独立的临时 SQLite 文件库
        dbFile = Files.createTempFile("maildock-msg-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        userA = userRepo.insert("a@example.com", "User A", null);
        userB = userRepo.insert("b@example.com", "User B", null);
        accountRepo = new AccountRepository(db);
        repo = new MessageRepository(db);
        accountId = accountRepo.insert(userA.id(), "owner@163.com", "enc").id();
        otherAccountId = accountRepo.insert(userB.id(), "other@163.com", "enc").id();
    }

    private Message sampleForAccount(long accountId, long uid, String subject) {
        return new Message(
                0, accountId, uid, "<mid-" + uid + "@163.com>", subject,
                "alice@163.com", "owner@163.com", null,
                1700000000000L, 1700000001000L,
                "纯文本正文", "<p>HTML 正文</p>",
                false, false, 123L, 0L);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 构造一条用于插入的邮件，仅指定 uid 与主题，其余给默认值。 */
    private Message sample(long uid, String subject) {
        return new Message(
                0, accountId, uid, "<mid-" + uid + "@163.com>", subject,
                "alice@163.com", "owner@163.com", null,
                1700000000000L, 1700000001000L,
                "纯文本正文", "<p>HTML 正文</p>",
                false, false, 123L, 0L);
    }

    @Test
    void insertThenFindById() {
        // 插入邮件后应能按 id 查回完整字段
        Message saved = repo.insert(sample(10, "你好"));

        assertTrue(saved.id() > 0);

        Message found = repo.findById(saved.id()).orElseThrow();
        assertEquals("你好", found.subject());
        assertEquals(10, found.uid());
        assertEquals("纯文本正文", found.bodyText());
        assertEquals("<p>HTML 正文</p>", found.bodyHtml());
        assertEquals("alice@163.com", found.fromAddr());
    }

    @Test
    void duplicateAccountUidThrows() {
        // 同账号 UID 唯一约束：重复插入应抛异常
        repo.insert(sample(20, "first"));
        assertThrows(RuntimeException.class, () -> repo.insert(sample(20, "dup")));
    }

    @Test
    void maxUidReturnsHighestUidForAccount() {
        // maxUid 返回某账号已存邮件的最大 UID，无邮件时为 0
        assertEquals(0L, repo.maxUid(accountId));
        repo.insert(sample(5, "a"));
        repo.insert(sample(99, "b"));
        repo.insert(sample(33, "c"));
        assertEquals(99L, repo.maxUid(accountId));
    }

    @Test
    void listByAccountPaginatedReturnsSummariesNewestFirst() {
        // 分页列表按接收时间倒序返回摘要
        for (int i = 1; i <= 5; i++) {
            Message m = new Message(
                    0, accountId, i, "<mid" + i + ">", "主题" + i,
                    "from@163.com", "owner@163.com", null,
                    1700000000000L, 1700000000000L + i * 1000L,
                    "body", "<p>body</p>", false, false, 10L, 0L);
            repo.insert(m);
        }

        List<Message> page1 = repo.listByAccount(accountId, 1, 2);
        assertEquals(2, page1.size());
        // 最新接收的（i=5）排第一
        assertEquals("主题5", page1.get(0).subject());
        assertEquals("主题4", page1.get(1).subject());

        List<Message> page2 = repo.listByAccount(accountId, 2, 2);
        assertEquals(2, page2.size());
        assertEquals("主题3", page2.get(0).subject());
    }

    @Test
    void countByAccountReturnsTotal() {
        // 统计某账号邮件总数，用于分页
        repo.insert(sample(1, "a"));
        repo.insert(sample(2, "b"));
        assertEquals(2, repo.countByAccount(accountId));
    }

    @Test
    void markReadUpdatesFlag() {
        // 标记已读
        Message saved = repo.insert(sample(7, "unread"));
        assertFalse(saved.isRead());

        repo.markRead(saved.id(), true);
        assertTrue(repo.findById(saved.id()).orElseThrow().isRead());
    }

    @Test
    void findByIdReturnsEmptyWhenAbsent() {
        // 不存在的 id 返回空
        assertTrue(repo.findById(12345).isEmpty());
    }

    @Test
    void findByIdForUserReturnsEmptyForOtherUsersMessage() {
        Message own = repo.insert(sampleForAccount(accountId, 1, "own"));
        Message other = repo.insert(sampleForAccount(otherAccountId, 2, "other"));

        assertTrue(repo.findByIdForUser(userA.id(), own.id()).isPresent());
        assertTrue(repo.findByIdForUser(userA.id(), other.id()).isEmpty());
    }

    @Test
    void listAndCountByAccountForUserRejectOtherUsersAccount() {
        repo.insert(sampleForAccount(accountId, 1, "own"));
        repo.insert(sampleForAccount(otherAccountId, 2, "other"));

        assertEquals(1, repo.countByAccountForUser(userA.id(), accountId));
        assertEquals(0, repo.countByAccountForUser(userA.id(), otherAccountId));
        assertEquals(1, repo.listByAccountForUser(userA.id(), accountId, 1, 20).size());
        assertTrue(repo.listByAccountForUser(userA.id(), otherAccountId, 1, 20).isEmpty());
    }

    @Test
    void markReadForUserRejectsOtherUsersMessage() {
        Message other = repo.insert(sampleForAccount(otherAccountId, 2, "other"));

        assertThrows(RuntimeException.class, () -> repo.markReadForUser(userA.id(), other.id(), true));
        assertFalse(repo.findById(other.id()).orElseThrow().isRead());
    }
}
