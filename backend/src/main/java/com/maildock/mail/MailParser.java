package com.maildock.mail;

import jakarta.mail.Message;
import jakarta.mail.Part;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeUtility;
import jakarta.mail.Multipart;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 将 Jakarta Mail 的 {@link MimeMessage} 解析为结构化的 {@link ParsedMail}。
 *
 * <p>解析过程会递归遍历 multipart 结构，提取纯文本正文（text/plain）、
 * HTML 正文（text/html）以及附件（disposition 为 attachment 或带文件名的部分）。
 * 主题、文件名等会通过 {@link MimeUtility#decodeText(String)} 解码，
 * 以正确处理 163 邮件常见的 MIME 编码头。
 */
public final class MailParser {

    private MailParser() {
    }

    /**
     * 解析一封邮件。
     *
     * @param msg 待解析的 MIME 邮件
     * @return 结构化的解析结果
     */
    public static ParsedMail parse(MimeMessage msg) {
        try {
            String subject = decode(msg.getSubject());
            String from = formatAddresses(msg.getFrom());
            String to = formatAddresses(msg.getRecipients(Message.RecipientType.TO));
            String cc = formatAddresses(msg.getRecipients(Message.RecipientType.CC));

            Date sent = msg.getSentDate();
            long sentAt = sent != null ? sent.getTime() : 0L;

            String messageId = firstHeader(msg, "Message-ID");

            // 用可变容器收集递归解析结果
            BodyAccumulator acc = new BodyAccumulator();
            walk(msg, acc);

            return new ParsedMail(
                    subject,
                    from,
                    to,
                    cc,
                    sentAt,
                    messageId,
                    acc.text,
                    acc.html,
                    acc.attachments);
        } catch (Exception e) {
            throw new RuntimeException("邮件解析失败", e);
        }
    }

    /**
     * 递归遍历邮件的各个部分，将正文与附件累积到 {@link BodyAccumulator}。
     */
    private static void walk(Part part, BodyAccumulator acc) throws Exception {
        if (isAttachment(part)) {
            acc.attachments.add(readAttachment(part));
            return;
        }

        Object content = part.getContent();
        if (content instanceof Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                walk(multipart.getBodyPart(i), acc);
            }
        } else if (part.isMimeType("text/plain")) {
            // 取第一个纯文本部分作为正文
            if (acc.text == null) {
                acc.text = asString(content);
            }
        } else if (part.isMimeType("text/html")) {
            if (acc.html == null) {
                acc.html = asString(content);
            }
        }
    }

    /**
     * 判断某个部分是否为附件：disposition 为 attachment，或带有文件名。
     */
    private static boolean isAttachment(Part part) throws Exception {
        String disposition = part.getDisposition();
        if (Part.ATTACHMENT.equalsIgnoreCase(disposition)) {
            return true;
        }
        // 部分邮件未显式标记 disposition，但带文件名的非文本部分也视为附件
        String filename = part.getFileName();
        if (filename != null && !filename.isBlank()
                && !part.isMimeType("text/plain")
                && !part.isMimeType("text/html")
                && !part.isMimeType("multipart/*")) {
            return true;
        }
        return false;
    }

    /**
     * 读取附件的文件名、类型与二进制内容。
     */
    private static ParsedAttachment readAttachment(Part part) throws Exception {
        String filename = decode(part.getFileName());
        String contentType = part.getContentType();
        byte[] bytes;
        try (InputStream in = part.getInputStream()) {
            bytes = in.readAllBytes();
        }
        return new ParsedAttachment(filename, contentType, bytes);
    }

    /**
     * 将正文内容转换为字符串。
     */
    private static String asString(Object content) throws Exception {
        if (content instanceof String s) {
            return s;
        }
        if (content instanceof InputStream in) {
            try (in) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                in.transferTo(out);
                return out.toString();
            }
        }
        return content != null ? content.toString() : null;
    }

    /**
     * 将地址数组格式化为分号拼接的字符串。
     */
    private static String formatAddresses(jakarta.mail.Address[] addresses) {
        if (addresses == null || addresses.length == 0) {
            return null;
        }
        List<String> parts = new ArrayList<>();
        for (jakarta.mail.Address address : addresses) {
            if (address instanceof InternetAddress ia) {
                parts.add(ia.toUnicodeString());
            } else {
                parts.add(address.toString());
            }
        }
        return String.join("; ", parts);
    }

    /**
     * 解码可能经过 MIME 编码的文本（主题、文件名等）。
     */
    private static String decode(String value) {
        if (value == null) {
            return null;
        }
        try {
            return MimeUtility.decodeText(value);
        } catch (Exception e) {
            return value;
        }
    }

    /**
     * 读取邮件头的第一个值。
     */
    private static String firstHeader(MimeMessage msg, String name) throws Exception {
        String[] values = msg.getHeader(name);
        return (values != null && values.length > 0) ? values[0] : null;
    }

    /**
     * 递归解析时用于累积正文与附件的可变容器。
     */
    private static final class BodyAccumulator {
        String text;
        String html;
        final List<ParsedAttachment> attachments = new ArrayList<>();
    }
}
