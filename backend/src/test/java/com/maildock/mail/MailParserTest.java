package com.maildock.mail;

import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.util.ByteArrayDataSource;
import jakarta.activation.DataHandler;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;

class MailParserTest {

    private Session session() {
        return Session.getInstance(new Properties());
    }

    @Test
    void parsesHeadersOfSimpleTextMail() throws Exception {
        // 构造一封仅含纯文本正文的简单邮件，验证邮件头解析
        MimeMessage msg = new MimeMessage(session());
        msg.setFrom(new InternetAddress("alice@163.com", "Alice"));
        msg.setRecipient(Message.RecipientType.TO, new InternetAddress("bob@example.com"));
        msg.setRecipient(Message.RecipientType.CC, new InternetAddress("carol@example.com"));
        msg.setSubject("你好，世界", "UTF-8");
        msg.setSentDate(new Date(1700000000000L));
        msg.setText("这是纯文本正文", "UTF-8");
        msg.saveChanges();
        // saveChanges() 会自动重新生成 Message-ID，因此必须在其之后设置自定义值，
        // 模拟真实 IMAP 邮件已携带 Message-ID 的情况
        msg.setHeader("Message-ID", "<unique-id-123@163.com>");

        ParsedMail parsed = MailParser.parse(msg);

        assertEquals("你好，世界", parsed.subject());
        assertTrue(parsed.from().contains("alice@163.com"), "发件人应包含原始地址");
        assertTrue(parsed.to().contains("bob@example.com"));
        assertTrue(parsed.cc().contains("carol@example.com"));
        assertEquals("<unique-id-123@163.com>", parsed.messageId());
        assertEquals(1700000000000L, parsed.sentAt());
        assertEquals("这是纯文本正文", parsed.bodyText());
        assertNull(parsed.bodyHtml(), "纯文本邮件没有 HTML 正文");
        assertTrue(parsed.attachments().isEmpty());
    }

    @Test
    void parsesMultipartWithTextHtmlAndAttachment() throws Exception {
        // 构造 multipart 邮件：纯文本 + HTML + 一个附件
        MimeMessage msg = new MimeMessage(session());
        msg.setFrom(new InternetAddress("alice@163.com"));
        msg.setRecipient(Message.RecipientType.TO, new InternetAddress("bob@example.com"));
        msg.setSubject("带附件的邮件", "UTF-8");
        msg.setSentDate(new Date(1700000000000L));

        MimeMultipart multipart = new MimeMultipart();

        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText("纯文本部分", "UTF-8");
        multipart.addBodyPart(textPart);

        MimeBodyPart htmlPart = new MimeBodyPart();
        htmlPart.setContent("<p>HTML 部分</p>", "text/html; charset=UTF-8");
        multipart.addBodyPart(htmlPart);

        MimeBodyPart attachPart = new MimeBodyPart();
        byte[] data = "PDF-CONTENT".getBytes(StandardCharsets.UTF_8);
        attachPart.setDataHandler(new DataHandler(
                new ByteArrayDataSource(data, "application/pdf")));
        attachPart.setFileName("report.pdf");
        attachPart.setDisposition(Message.ATTACHMENT);
        multipart.addBodyPart(attachPart);

        msg.setContent(multipart);
        msg.saveChanges();

        ParsedMail parsed = MailParser.parse(msg);

        assertEquals("带附件的邮件", parsed.subject());
        assertEquals("纯文本部分", parsed.bodyText());
        assertTrue(parsed.bodyHtml().contains("HTML 部分"));
        assertEquals(1, parsed.attachments().size());

        ParsedAttachment att = parsed.attachments().get(0);
        assertEquals("report.pdf", att.filename());
        assertTrue(att.contentType().contains("application/pdf"));
        assertArrayEquals(data, att.content());
    }

    @Test
    void decodesEncodedSubject() throws Exception {
        // MIME 编码的主题应被正确解码
        MimeMessage msg = new MimeMessage(session());
        msg.setFrom(new InternetAddress("alice@163.com"));
        msg.setSubject("测试中文主题", "UTF-8");
        msg.setText("body", "UTF-8");
        msg.saveChanges();

        ParsedMail parsed = MailParser.parse(msg);

        assertEquals("测试中文主题", parsed.subject());
    }
}
