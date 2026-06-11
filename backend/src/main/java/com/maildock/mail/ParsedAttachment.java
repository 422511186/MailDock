package com.maildock.mail;

/**
 * 解析后的邮件附件。
 *
 * @param filename    附件文件名（来自邮件，尚未做安全清洗）
 * @param contentType 附件 MIME 类型，例如 application/pdf
 * @param content     附件二进制内容
 */
public record ParsedAttachment(
        String filename,
        String contentType,
        byte[] content) {
}
