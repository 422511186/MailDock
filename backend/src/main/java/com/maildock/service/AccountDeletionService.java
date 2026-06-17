package com.maildock.service;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.storage.AttachmentStorage;

import java.util.List;

/**
 * 账号删除职责：负责级联清理邮件、附件记录与落盘文件，并按用户作用域执行删除。
 */
public final class AccountDeletionService {

    private final AccountRepository accountRepo;
    private final MessageRepository messageRepo;
    private final AttachmentRepository attachmentRepo;
    private final AttachmentStorage attachmentStorage;

    public AccountDeletionService(AccountRepository accountRepo,
                                  MessageRepository messageRepo,
                                  AttachmentRepository attachmentRepo,
                                  AttachmentStorage attachmentStorage) {
        this.accountRepo = accountRepo;
        this.messageRepo = messageRepo;
        this.attachmentRepo = attachmentRepo;
        this.attachmentStorage = attachmentStorage;
    }

    public void deleteAccount(long userId, long accountId) {
        accountRepo.findById(userId, accountId)
                .orElseThrow(() -> new RuntimeException("账号不存在: " + accountId));
        deleteAccountData(accountId);
        accountRepo.delete(userId, accountId);
        attachmentStorage.deleteAccountDirectoryQuietly(userId, accountId);
    }

    public int deleteBatch(long userId, List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        int deleted = 0;
        for (Long id : ids) {
            if (accountRepo.findById(userId, id).isPresent()) {
                deleteAccount(userId, id);
                deleted++;
            }
        }
        return deleted;
    }

    private void deleteAccountData(long accountId) {
        List<Message> messages = messageRepo.listAllByAccount(accountId);
        for (Message message : messages) {
            for (Attachment attachment : attachmentRepo.findByMessage(message.id())) {
                attachmentStorage.deleteStoredFileQuietly(attachment.filePath());
            }
            attachmentRepo.deleteByMessage(message.id());
        }
        messageRepo.deleteByAccount(accountId);
    }
}
