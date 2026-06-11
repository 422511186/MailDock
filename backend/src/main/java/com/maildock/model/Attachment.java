package com.maildock.model;

/**
 * 邮件附件模型，对应数据库表 mail_attachment。
 *
 * @param id          主键
 * @param messageId   所属邮件 id（关联 mail_message.id）
 * @param filename    附件文件名（已安全清洗）
 * @param contentType 附件 MIME 类型，例如 application/pdf
 * @param size        附件字节大小
 * @param filePath    附件落盘相对路径
 * @param createdAt   创建时间（毫秒时间戳）
 */
public record Attachment(
        long id,
        long messageId,
        String filename,
        String contentType,
        long size,
        String filePath,
        long createdAt) {
}
