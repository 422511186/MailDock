package com.maildock.service;

import com.maildock.model.Account;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.model.MessageFilter;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class MailQueryServiceTest {

    private Database db;
    private UserRepository userRepo;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository attachmentRepo;
    private MailQueryService service;
    private Path dbFile;
    private Path attachmentsDir;
    private User userA;
    private User userB;
    private long accountId;
    private long otherAccountId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-query", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-query-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        userA = userRepo.insert("a@example.com", "User A", null);
        userB = userRepo.insert("b@example.com", "User B", null);
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        attachmentRepo = new AttachmentRepository(db);
        service = new MailQueryService(messageRepo, attachmentRepo, attachmentsDir);
        accountId = accountRepo.insert(userA.id(), "owner@163.com", "enc").id();
        otherAccountId = accountRepo.insert(userB.id(), "other@163.com", "enc").id();
    }

    private Message insertMessageFor(long accountId, long uid, String subject, long receivedAt) {
        return messageRepo.insert(new Message(
                0, accountId, uid, "<mid-" + uid + ">", subject,
                "alice@163.com", "owner@163.com", null,
                1700000000000L, receivedAt,
                "纯文本正文", "<p>HTML 正文</p>",
                false, false, 100L, 0L));
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 构造并插入一封邮件，返回入库后的实体。 */
    private Message insertMessage(long uid, String subject, long receivedAt) {
        return messageRepo.insert(new Message(
                0, accountId, uid, "<mid-" + uid + ">", subject,
                "alice@163.com", "owner@163.com", null,
                1700000000000L, receivedAt,
                "纯文本正文", "<p>HTML 正文</p>",
                false, false, 100L, 0L));
    }

    @Test
    void listReturnsPagedResultWithTotal() {
        // 分页列表应返回当前页邮件与总数
        for (int i = 1; i <= 5; i++) {
            insertMessage(i, "主题" + i, 1700000000000L + i * 1000L);
        }

        MailQueryService.PagedMessages page = service.list(userA.id(), accountId, 1, 2);

        assertEquals(5, page.total());
        assertEquals(2, page.items().size());
        // 最新的（i=5）在最前
        assertEquals("主题5", page.items().get(0).subject());
    }

    @Test
    void getDetailReturnsMessageWithAttachments() {
        // 详情应返回邮件与其附件列表
        Message m = insertMessage(1, "带附件", 1700000001000L);
        attachmentRepo.insert(m.id(), "a.pdf", "application/pdf", 10L, "attachments/" + accountId + "/" + m.id() + "/a.pdf");

        MailQueryService.MessageDetail detail = service.getDetail(userA.id(), m.id()).orElseThrow();

        assertEquals("带附件", detail.message().subject());
        assertEquals(1, detail.attachments().size());
        assertEquals("a.pdf", detail.attachments().get(0).filename());
    }

    @Test
    void getDetailReturnsEmptyWhenAbsent() {
        // 不存在的邮件返回空
        assertTrue(service.getDetail(userA.id(), 99999).isEmpty());
    }

    @Test
    void markReadUpdatesFlag() {
        // 标记已读
        Message m = insertMessage(1, "未读", 1700000001000L);
        assertFalse(m.isRead());

        service.markRead(userA.id(), m.id(), true);

        assertTrue(messageRepo.findById(m.id()).orElseThrow().isRead());
    }

    @Test
    void loadAttachmentReturnsBytesWhenBelongsToMessage() throws Exception {
        // 读取附件：附件确实属于该邮件时返回文件内容
        Message m = insertMessage(1, "带附件", 1700000001000L);
        byte[] data = "FILE-DATA".getBytes();
        // 落盘文件 - 注意：路径格式是 userId/accountId/messageId/filename
        Path dir = attachmentsDir.resolve(String.valueOf(userA.id())).resolve(String.valueOf(accountId)).resolve(String.valueOf(m.id()));
        Files.createDirectories(dir);
        Files.write(dir.resolve("a.pdf"), data);
        // 新格式: userId/accountId/messageId/safeName（不再包含 attachmentsDir 文件名）
        String relPath = userA.id() + "/" + accountId + "/" + m.id() + "/a.pdf";
        Attachment att = attachmentRepo.insert(m.id(), "a.pdf", "application/pdf", (long) data.length, relPath);

        byte[] loaded = service.loadAttachment(userA.id(), m.id(), att.id());

        assertArrayEquals(data, loaded);
    }

    @Test
    void loadAttachmentRejectsMismatchedMessage() {
        // 越权防护：附件不属于指定邮件时抛异常
        Message m1 = insertMessage(1, "邮件1", 1700000001000L);
        Message m2 = insertMessage(2, "邮件2", 1700000002000L);
        Attachment att = attachmentRepo.insert(m1.id(), "a.pdf", "application/pdf", 10L, "p/a.pdf");

        // 用 m2 的 id 去取 m1 的附件，应被拒绝
        assertThrows(RuntimeException.class, () -> service.loadAttachment(userA.id(), m2.id(), att.id()));
    }

    @Test
    void getDetailReturnsEmptyForOtherUsersMessage() {
        Message otherMessage = insertMessageFor(otherAccountId, 10, "other", 1700000003000L);

        assertTrue(service.getDetail(userA.id(), otherMessage.id()).isEmpty());
    }

    @Test
    void listRejectsOtherUsersAccountByReturningEmptyPage() {
        insertMessageFor(otherAccountId, 10, "other", 1700000003000L);

        MailQueryService.PagedMessages page = service.list(userA.id(), otherAccountId, 1, 20);

        assertEquals(0, page.total());
        assertTrue(page.items().isEmpty());
    }

    @Test
    void markReadRejectsOtherUsersMessage() {
        Message otherMessage = insertMessageFor(otherAccountId, 10, "other", 1700000003000L);

        assertThrows(RuntimeException.class, () -> service.markRead(userA.id(), otherMessage.id(), true));
    }

    @Test
    void loadAttachmentRejectsOtherUsersAttachment() {
        Message otherMessage = insertMessageFor(otherAccountId, 10, "other", 1700000003000L);
        Attachment att = attachmentRepo.insert(otherMessage.id(), "a.pdf", "application/pdf", 10L,
                "attachments/" + userB.id() + "/" + otherAccountId + "/" + otherMessage.id() + "/a.pdf");

        assertThrows(RuntimeException.class, () -> service.loadAttachment(userA.id(), otherMessage.id(), att.id()));
    }

    @Test
    void searchWithoutFilterReturnsAllUsersMessagesAcrossAccounts() {
        // 无过滤条件：返回该用户全部账号的邮件，total 与 items 一致
        long secondAccountId = accountRepo.insert(userA.id(), "owner2@163.com", "enc").id();
        insertMessage(1, "项目周报", 1700000001000L);
        insertMessage(2, "会议纪要", 1700000002000L);
        insertMessageFor(secondAccountId, 3, "发票通知", 1700000003000L);
        // 另一个用户的邮件不应出现
        insertMessageFor(otherAccountId, 99, "别人的邮件", 1700000004000L);

        MessageFilter filter = new MessageFilter(null, null, null, null, null, null, null, null);
        MailQueryService.PagedMessages page = service.search(userA.id(), filter, 1, 20);

        assertEquals(3, page.total());
        assertEquals(3, page.items().size());
        assertTrue(page.items().stream().noneMatch(m -> m.subject().equals("别人的邮件")));
    }

    @Test
    void searchByKeywordReturnsNarrowedSubset() {
        // 关键字过滤（长度 >= 3 走全文检索）：仅返回命中的子集
        insertMessage(1, "项目周报最终版", 1700000001000L);
        insertMessage(2, "会议纪要", 1700000002000L);
        insertMessageFor(otherAccountId, 99, "项目周报别人的", 1700000003000L);

        MessageFilter filter = new MessageFilter("项目周报", null, null, null, null, null, null, null);
        MailQueryService.PagedMessages page = service.search(userA.id(), filter, 1, 20);

        assertEquals(1, page.total());
        assertEquals(1, page.items().size());
        assertEquals("项目周报最终版", page.items().get(0).subject());
    }

    @Test
    void searchByAccountIdReturnsOnlyThatAccount() {
        // 账号过滤：只返回指定账号的邮件，total 与 items 一致
        long secondAccountId = accountRepo.insert(userA.id(), "owner2@163.com", "enc").id();
        insertMessage(1, "账号一", 1700000001000L);
        insertMessageFor(secondAccountId, 2, "账号二甲", 1700000002000L);
        insertMessageFor(secondAccountId, 3, "账号二乙", 1700000003000L);

        MessageFilter filter = new MessageFilter(null, secondAccountId, null, null, null, null, null, null);
        MailQueryService.PagedMessages page = service.search(userA.id(), filter, 1, 20);

        assertEquals(2, page.total());
        assertEquals(2, page.items().size());
        assertTrue(page.items().stream().allMatch(m -> m.accountId() == secondAccountId));
    }
}
