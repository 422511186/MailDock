package com.maildock.mail;

import jakarta.mail.internet.MimeMessage;

/**
 * 从 IMAP 拉取到的单封邮件，携带其 IMAP UID。
 *
 * @param uid     IMAP UID（在同一 UIDVALIDITY 下稳定唯一）
 * @param message 原始 MimeMessage，供 {@link MailParser} 解析
 */
public record ImapMessage(long uid, MimeMessage message) {
}
