package com.maildock.storage;

import com.maildock.mail.ParsedAttachment;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
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

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AttachmentStorageTest {

    private Database db;
    private UserRepository userRepo;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository attachmentRepo;
    private AttachmentStorage storage;
    private Path dbFile;
    private Path attachmentsDir;
    private long userId;
    private long accountId;
    private long messageId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-attachment-storage", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-attachment-storage");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        attachmentRepo = new AttachmentRepository(db);
        storage = new AttachmentStorage(attachmentRepo, attachmentsDir);

        User user = userRepo.insert("owner@example.com", "Owner", null);
        userId = user.id();
        accountId = accountRepo.insert(userId, "owner@163.com", "enc").id();
        messageId = messageRepo.insert(new Message(
                0, accountId, 1L, "<mid-1>", "subject",
                "from@example.com", "owner@163.com", null,
                1700000000000L, 1700000000000L,
                "body", null, true, false, 64L, 0L)).id();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void storePersistsAttachmentMetadataAndFileUnderUserScopedPath() throws Exception {
        ParsedAttachment parsed = new ParsedAttachment("report.pdf", "application/pdf", "PDF".getBytes());

        Attachment saved = storage.store(userId, accountId, messageId, parsed);

        assertEquals("report.pdf", saved.filename());
        assertTrue(saved.filePath().startsWith(attachmentsDir.getFileName() + "/" + userId + "/" + accountId + "/" + messageId + "/"));
        Path absolutePath = storage.resolve(saved.filePath());
        assertTrue(Files.exists(absolutePath));
        assertArrayEquals(parsed.content(), Files.readAllBytes(absolutePath));
    }

    @Test
    void resolveLoadsRelativeAttachmentPathFromRootParent() throws Exception {
        Path dir = attachmentsDir.resolve(String.valueOf(userId))
                .resolve(String.valueOf(accountId))
                .resolve(String.valueOf(messageId));
        Files.createDirectories(dir);
        Path file = dir.resolve("invoice.pdf");
        Files.writeString(file, "invoice");

        Path resolved = storage.resolve(
                attachmentsDir.getFileName() + "/" + userId + "/" + accountId + "/" + messageId + "/invoice.pdf");

        assertEquals(file, resolved);
    }

    @Test
    void deleteQuietlyRemovesStoredFileAndAccountDirectory() throws Exception {
        Attachment saved = storage.store(
                userId,
                accountId,
                messageId,
                new ParsedAttachment("to-delete.pdf", "application/pdf", "delete".getBytes()));

        Path storedFile = storage.resolve(saved.filePath());
        assertTrue(Files.exists(storedFile));

        storage.deleteStoredFileQuietly(saved.filePath());
        assertFalse(Files.exists(storedFile));

        storage.deleteAccountDirectoryQuietly(userId, accountId);
        assertFalse(Files.exists(attachmentsDir.resolve(String.valueOf(userId)).resolve(String.valueOf(accountId))));
    }
}
