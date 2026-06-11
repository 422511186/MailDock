package com.maildock.service;

import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.MessageRepository;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * 邮件查询服务：分页列出某账号的邮件、获取邮件详情（含附件列表）、读取附件二进制内容、
 * 标记已读。
 *
 * <p>附件读取会校验附件确实归属于指定邮件，防止越权访问他人附件。落盘路径以库中
 * 存储的相对路径为准（形如 {@code attachments/{accountId}/{messageId}/{filename}}），
 * 相对附件根目录的上一级解析为绝对路径。
 */
public final class MailQueryService {

    /** 分页邮件结果：当前页邮件与总数。 */
    public record PagedMessages(List<Message> items, long total) {
    }

    /** 邮件详情：邮件本体与其附件列表。 */
    public record MessageDetail(Message message, List<Attachment> attachments) {
    }

    private final MessageRepository messageRepo;
    private final AttachmentRepository attachmentRepo;
    private final Path attachmentsDir;

    public MailQueryService(MessageRepository messageRepo,
                            AttachmentRepository attachmentRepo,
                            Path attachmentsDir) {
        this.messageRepo = messageRepo;
        this.attachmentRepo = attachmentRepo;
        this.attachmentsDir = attachmentsDir;
    }

    /**
     * 分页列出某账号的邮件，按接收时间倒序，并返回总数用于前端分页。
     *
     * @param accountId 账号 id
     * @param page      页码，从 1 开始
     * @param size      每页数量
     */
    public PagedMessages list(long accountId, int page, int size) {
        List<Message> items = messageRepo.listByAccount(accountId, page, size);
        long total = messageRepo.countByAccount(accountId);
        return new PagedMessages(items, total);
    }

    /** 获取邮件详情（含附件列表），邮件不存在时返回空。 */
    public Optional<MessageDetail> getDetail(long messageId) {
        return messageRepo.findById(messageId)
                .map(m -> new MessageDetail(m, attachmentRepo.findByMessage(messageId)));
    }

    /** 标记邮件已读 / 未读。 */
    public void markRead(long messageId, boolean read) {
        messageRepo.markRead(messageId, read);
    }

    /**
     * 读取附件二进制内容，校验附件归属于指定邮件，防止越权。
     *
     * @param messageId    邮件 id
     * @param attachmentId 附件 id
     * @return 附件文件字节内容
     */
    public byte[] loadAttachment(long messageId, long attachmentId) {
        Attachment att = attachmentRepo.findById(attachmentId)
                .orElseThrow(() -> new RuntimeException("附件不存在: " + attachmentId));
        if (att.messageId() != messageId) {
            throw new RuntimeException("附件不属于该邮件，拒绝访问");
        }
        try {
            return Files.readAllBytes(resolvePath(att.filePath()));
        } catch (Exception e) {
            throw new RuntimeException("读取附件文件失败: " + att.filePath(), e);
        }
    }

    /** 把库中相对路径解析为绝对路径（相对附件根目录的上一级，即包含 attachments 段）。 */
    private Path resolvePath(String storedPath) {
        Path p = Path.of(storedPath);
        if (p.isAbsolute()) {
            return p;
        }
        Path base = attachmentsDir.getParent() != null ? attachmentsDir.getParent() : attachmentsDir;
        return base.resolve(storedPath);
    }
}
