package com.maildock.mail;

import java.util.List;

/**
 * 解析后的邮件结构化结果。
 *
 * @param subject     主题（已解码）
 * @param from        发件人（地址，可能含显示名）
 * @param to          收件人，多个用分号拼接
 * @param cc          抄送，多个用分号拼接
 * @param sentAt      发送时间（毫秒时间戳），无则为 0
 * @param messageId   邮件头 Message-ID
 * @param bodyText    纯文本正文，无则为 null
 * @param bodyHtml    HTML 正文，无则为 null
 * @param attachments 附件列表
 */
public record ParsedMail(
        String subject,
        String from,
        String to,
        String cc,
        long sentAt,
        String messageId,
        String bodyText,
        String bodyHtml,
        List<ParsedAttachment> attachments) {
}
