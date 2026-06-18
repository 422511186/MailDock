package com.maildock.repository;

import com.maildock.model.Account;
import com.maildock.model.Message;
import com.maildock.model.MessageFilter;
import com.maildock.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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

    /** 构造一封可定制 body/has_attach/is_read/received_at 的邮件，用于搜索测试。 */
    private Message rich(long accountId, long uid, String subject, String fromAddr,
                         String bodyText, boolean hasAttach, boolean isRead, long receivedAt) {
        return new Message(
                0, accountId, uid, "<mid-" + uid + "@163.com>", subject,
                fromAddr, "owner@163.com", null,
                1700000000000L, receivedAt,
                bodyText, "<p>" + bodyText + "</p>",
                hasAttach, isRead, 123L, 0L);
    }

    private static final MessageFilter NO_FILTER =
            new MessageFilter(null, null, null, null, null, null, null, null);

    @Test
    void searchForUserNoFilterReturnsOnlyOwnMessages() {
        repo.insert(sampleForAccount(accountId, 1, "own one"));
        repo.insert(sampleForAccount(accountId, 2, "own two"));
        repo.insert(sampleForAccount(otherAccountId, 3, "b one"));

        List<Message> results = repo.searchForUser(userA.id(), NO_FILTER, 1, 20);
        assertEquals(2, results.size());
        assertTrue(results.stream().allMatch(m -> m.accountId() == accountId));
        assertEquals(2, repo.countSearchForUser(userA.id(), NO_FILTER));
    }

    @Test
    void searchForUserFullTextMatchesBody() {
        repo.insert(rich(accountId, 1, "subject one", "alice@163.com",
                "本季度报表数据汇总", false, false, 1000L));
        repo.insert(rich(accountId, 2, "subject two", "bob@163.com",
                "无关内容", false, false, 2000L));

        MessageFilter f = new MessageFilter("季度报表", null, null, null, null, null, null, null);
        List<Message> results = repo.searchForUser(userA.id(), f, 1, 20);
        assertEquals(1, results.size());
        assertEquals(1, results.get(0).uid());
        assertEquals(1, repo.countSearchForUser(userA.id(), f));
    }

    @Test
    void searchForUserShortKeywordFallsBackToSubjectFromLike() {
        // body 含 "hi"，但主题/发件人不含 → 短关键字（<3）不应命中正文
        repo.insert(rich(accountId, 1, "greeting", "x@163.com", "say hi there", false, false, 1000L));
        // 主题含 "hi" → 应命中
        repo.insert(rich(accountId, 2, "ship it", "y@163.com", "unrelated", false, false, 2000L));

        MessageFilter f = new MessageFilter("hi", null, null, null, null, null, null, null);
        List<Message> results = repo.searchForUser(userA.id(), f, 1, 20);
        assertEquals(1, results.size());
        assertEquals(2, results.get(0).uid());
    }

    @Test
    void searchForUserAccountIdFilter() {
        long secondAccount = accountRepo.insert(userA.id(), "second@163.com", "enc").id();
        repo.insert(sampleForAccount(accountId, 1, "first acct"));
        repo.insert(sampleForAccount(secondAccount, 2, "second acct"));

        MessageFilter f = new MessageFilter(null, secondAccount, null, null, null, null, null, null);
        List<Message> results = repo.searchForUser(userA.id(), f, 1, 20);
        assertEquals(1, results.size());
        assertEquals(secondAccount, results.get(0).accountId());
    }

    @Test
    void searchForUserIsReadFilter() {
        repo.insert(rich(accountId, 1, "read msg", "x@163.com", "b", false, true, 1000L));
        repo.insert(rich(accountId, 2, "unread msg", "x@163.com", "b", false, false, 2000L));

        MessageFilter f = new MessageFilter(null, null, false, null, null, null, null, null);
        List<Message> results = repo.searchForUser(userA.id(), f, 1, 20);
        assertEquals(1, results.size());
        assertFalse(results.get(0).isRead());
    }

    @Test
    void searchForUserHasAttachFilter() {
        repo.insert(rich(accountId, 1, "with att", "x@163.com", "b", true, false, 1000L));
        repo.insert(rich(accountId, 2, "no att", "x@163.com", "b", false, false, 2000L));

        MessageFilter f = new MessageFilter(null, null, null, true, null, null, null, null);
        List<Message> results = repo.searchForUser(userA.id(), f, 1, 20);
        assertEquals(1, results.size());
        assertTrue(results.get(0).hasAttach());
    }

    @Test
    void searchForUserDateRange() {
        repo.insert(rich(accountId, 1, "old", "x@163.com", "b", false, false, 1000L));
        repo.insert(rich(accountId, 2, "mid", "x@163.com", "b", false, false, 2000L));
        repo.insert(rich(accountId, 3, "new", "x@163.com", "b", false, false, 3000L));

        // startDate only
        MessageFilter start = new MessageFilter(null, null, null, null, 2000L, null, null, null);
        assertEquals(2, repo.searchForUser(userA.id(), start, 1, 20).size());
        // endDate only
        MessageFilter end = new MessageFilter(null, null, null, null, null, 2000L, null, null);
        assertEquals(2, repo.searchForUser(userA.id(), end, 1, 20).size());
        // both
        MessageFilter both = new MessageFilter(null, null, null, null, 2000L, 2000L, null, null);
        List<Message> mid = repo.searchForUser(userA.id(), both, 1, 20);
        assertEquals(1, mid.size());
        assertEquals(2, mid.get(0).uid());
    }

    @Test
    void searchForUserSortWhitelist() {
        repo.insert(rich(accountId, 1, "a", "x@163.com", "b", false, false, 1000L));
        repo.insert(rich(accountId, 2, "c", "x@163.com", "b", false, false, 3000L));
        repo.insert(rich(accountId, 3, "b", "x@163.com", "b", false, false, 2000L));

        // received_at asc
        MessageFilter asc = new MessageFilter(null, null, null, null, null, null, "received_at", "asc");
        List<Message> ascRes = repo.searchForUser(userA.id(), asc, 1, 20);
        assertEquals(1000L, ascRes.get(0).receivedAt());
        assertEquals(3000L, ascRes.get(2).receivedAt());

        // illegal sortBy → default received_at DESC, no exception
        MessageFilter bad = new MessageFilter(null, null, null, null, null, null, "body_text; DROP", "nonsense");
        List<Message> badRes = assertDoesNotThrow(() -> repo.searchForUser(userA.id(), bad, 1, 20));
        assertEquals(3000L, badRes.get(0).receivedAt());
        assertEquals(1000L, badRes.get(2).receivedAt());
    }

    @Test
    void searchForUserFtsSyntaxCharsDoNotThrow() {
        repo.insert(rich(accountId, 1, "subject", "x@163.com", "some body text", false, false, 1000L));

        MessageFilter f = new MessageFilter("a\"b*", null, null, null, null, null, null, null);
        assertDoesNotThrow(() -> repo.searchForUser(userA.id(), f, 1, 20));
        assertDoesNotThrow(() -> repo.countSearchForUser(userA.id(), f));
    }

    @Test
    void searchForUserPagination() {
        for (int i = 1; i <= 5; i++) {
            repo.insert(rich(accountId, i, "msg" + i, "x@163.com", "b", false, false, 1000L + i));
        }
        List<Message> page1 = repo.searchForUser(userA.id(), NO_FILTER, 1, 2);
        assertEquals(2, page1.size());
        List<Message> page2 = repo.searchForUser(userA.id(), NO_FILTER, 2, 2);
        assertEquals(2, page2.size());
        List<Message> page3 = repo.searchForUser(userA.id(), NO_FILTER, 3, 2);
        assertEquals(1, page3.size());
        // no overlap between pages (default DESC by received_at)
        assertNotEquals(page1.get(0).id(), page2.get(0).id());
    }
}
