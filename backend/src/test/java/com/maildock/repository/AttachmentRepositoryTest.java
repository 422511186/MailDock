package com.maildock.repository;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AttachmentRepositoryTest {

    private Database db;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository repo;
    private Path dbFile;
    private long messageId;

    @BeforeEach
    void setUp() throws Exception {
        // 每个测试使用独立的临时 SQLite 文件库
        dbFile = Files.createTempFile("maildock-attach-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        repo = new AttachmentRepository(db);
        long accountId = accountRepo.insert("owner@163.com", "enc").id();
        messageId = messageRepo.insert(new Message(
                0, accountId, 1, "<mid@163.com>", "带附件",
                "alice@163.com", "owner@163.com", null,
                1700000000000L, 1700000001000L,
                "body", null, true, false, 100L, 0L)).id();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void insertThenFindByMessage() {
        // 插入附件后应能按邮件 id 查回
        repo.insert(messageId, "report.pdf", "application/pdf", 2048L, "attachments/1/1/report.pdf");

        List<Attachment> list = repo.findByMessage(messageId);
        assertEquals(1, list.size());
        Attachment a = list.get(0);
        assertTrue(a.id() > 0);
        assertEquals("report.pdf", a.filename());
        assertEquals("application/pdf", a.contentType());
        assertEquals(2048L, a.size());
        assertEquals("attachments/1/1/report.pdf", a.filePath());
    }

    @Test
    void findByIdReturnsAttachment() {
        // 按附件主键查找
        Attachment saved = repo.insert(messageId, "a.txt", "text/plain", 10L, "attachments/1/1/a.txt");
        Attachment found = repo.findById(saved.id()).orElseThrow();
        assertEquals("a.txt", found.filename());
    }

    @Test
    void findByIdReturnsEmptyWhenAbsent() {
        // 不存在的 id 返回空
        assertTrue(repo.findById(999).isEmpty());
    }

    @Test
    void findByMessageReturnsAllAttachments() {
        // 一封邮件可有多个附件
        repo.insert(messageId, "a.pdf", "application/pdf", 1L, "p/a.pdf");
        repo.insert(messageId, "b.png", "image/png", 2L, "p/b.png");
        assertEquals(2, repo.findByMessage(messageId).size());
    }

    @Test
    void deleteByMessageRemovesAll() {
        // 按邮件删除其全部附件（用于级联清理）
        repo.insert(messageId, "a.pdf", "application/pdf", 1L, "p/a.pdf");
        repo.insert(messageId, "b.png", "image/png", 2L, "p/b.png");
        repo.deleteByMessage(messageId);
        assertTrue(repo.findByMessage(messageId).isEmpty());
    }
}
