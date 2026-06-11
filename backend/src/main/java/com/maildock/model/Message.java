package com.maildock.model;

/**
 * 邮件模型，对应数据库表 mail_message。
 *
 * @param id         主键
 * @param accountId  所属账号 id
 * @param uid        IMAP UID
 * @param messageId  邮件头 Message-ID
 * @param subject    主题
 * @param fromAddr   发件人
 * @param toAddr     收件人，多个用分号拼接
 * @param ccAddr     抄送，多个用分号拼接，无则为 null
 * @param sentAt     发送时间（毫秒时间戳），无则为 0
 * @param receivedAt 接收时间（毫秒时间戳），无则为 0
 * @param bodyText   纯文本正文，无则为 null
 * @param bodyHtml   HTML 正文，无则为 null
 * @param hasAttach  是否含附件
 * @param isRead     是否已读
 * @param rawSize    原始邮件大小（字节）
 * @param createdAt  入库时间（毫秒时间戳）
 */
public record Message(
        long id,
        long accountId,
        long uid,
        String messageId,
        String subject,
        String fromAddr,
        String toAddr,
        String ccAddr,
        long sentAt,
        long receivedAt,
        String bodyText,
        String bodyHtml,
        boolean hasAttach,
        boolean isRead,
        long rawSize,
        long createdAt) {
}
