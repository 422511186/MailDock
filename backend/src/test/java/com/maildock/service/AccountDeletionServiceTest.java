package com.maildock.service;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
import com.maildock.storage.AttachmentStorage;
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

class AccountDeletionServiceTest {

    private Database db;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository attachmentRepo;
    private AttachmentStorage attachmentStorage;
    private Path dbFile;
    private Path attachmentsDir;
    private long userAId;
    private long userBId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-account-deletion", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-account-deletion");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        User userA = userRepo.insert("a@example.com", "User A", null);
        User userB = userRepo.insert("b@example.com", "User B", null);
        userAId = userA.id();
        userBId = userB.id();
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        attachmentRepo = new AttachmentRepository(db);
        attachmentStorage = new AttachmentStorage(attachmentRepo, attachmentsDir);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void deleteAccountRemovesMessagesAttachmentsAndUserScopedDirectory() throws Exception {
        long accountId = accountRepo.insert(userAId, "owner@163.com", "enc").id();
        Message message = messageRepo.insert(new Message(
                0, accountId, 1L, "<mid-1>", "subject",
                "from@example.com", "owner@163.com", null,
                1700000000000L, 1700000000000L,
                "body", null, true, false, 64L, 0L));
        Path dir = attachmentsDir.resolve(String.valueOf(userAId))
                .resolve(String.valueOf(accountId))
                .resolve(String.valueOf(message.id()));
        Files.createDirectories(dir);
        Path file = dir.resolve("a.pdf");
        Files.writeString(file, "data");
        String relativePath = attachmentsDir.getFileName() + "/" + userAId + "/" + accountId + "/" + message.id() + "/a.pdf";
        attachmentRepo.insert(message.id(), "a.pdf", "application/pdf", 4L, relativePath);

        AccountDeletionService deletionService =
                new AccountDeletionService(accountRepo, messageRepo, attachmentRepo, attachmentStorage);

        deletionService.deleteAccount(userAId, accountId);

        assertTrue(accountRepo.findById(userAId, accountId).isEmpty());
        assertTrue(messageRepo.findById(message.id()).isEmpty());
        assertTrue(attachmentRepo.findByMessage(message.id()).isEmpty());
        assertFalse(Files.exists(attachmentsDir.resolve(String.valueOf(userAId)).resolve(String.valueOf(accountId))));
    }

    @Test
    void deleteBatchIgnoresOtherUsersAccounts() {
        long ownId = accountRepo.insert(userAId, "a@163.com", "enc").id();
        long otherId = accountRepo.insert(userBId, "b@163.com", "enc").id();
        AccountDeletionService deletionService =
                new AccountDeletionService(accountRepo, messageRepo, attachmentRepo, attachmentStorage);

        int deleted = deletionService.deleteBatch(userAId, List.of(ownId, otherId));

        assertEquals(1, deleted);
        assertTrue(accountRepo.findById(userAId, ownId).isEmpty());
        assertTrue(accountRepo.findById(userBId, otherId).isPresent());
    }

    @Test
    void deleteAccountRejectsOtherUsersOwnership() {
        long otherId = accountRepo.insert(userBId, "b@163.com", "enc").id();
        AccountDeletionService deletionService =
                new AccountDeletionService(accountRepo, messageRepo, attachmentRepo, attachmentStorage);

        assertThrows(RuntimeException.class, () -> deletionService.deleteAccount(userAId, otherId));
    }
}
