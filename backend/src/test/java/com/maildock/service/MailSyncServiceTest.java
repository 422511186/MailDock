package com.maildock.service;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;
import jakarta.activation.DataHandler;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import jakarta.mail.util.ByteArrayDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Date;
import java.util.List;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;

class MailSyncServiceTest {

    // 内嵌 IMAP 服务器（明文）
    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 字节
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Database db;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository attachmentRepo;
    private MailSyncService service;
    private Path dbFile;
    private Path attachmentsDir;
    private long accountId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-sync", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-sync-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);

        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
            // 已存在则复用
        }

        // 工厂统一指向 GreenMail
        MailSyncService.ImapClientFactory factory =
                (host, port, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", ServerSetupTest.IMAP.getPort(), false, email, authCode);

        service = new MailSyncService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);

        accountId = accountRepo.insert(EMAIL, crypto.encrypt(AUTH_CODE)).id();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 向 INBOX 投递一封纯文本邮件。 */
    private void deliverText(String subject, String body) throws Exception {
        Session session = Session.getInstance(new Properties());
        MimeMessage msg = new MimeMessage(session);
        msg.setFrom(new InternetAddress("sender@example.com"));
        msg.setRecipient(MimeMessage.RecipientType.TO, new InternetAddress(EMAIL));
        msg.setSubject(subject, "UTF-8");
        msg.setSentDate(new Date());
        msg.setText(body, "UTF-8");
        msg.saveChanges();
        greenMail.getManagers().getImapHostManager()
                .getInbox(greenMail.getUserManager().getUserByEmail(EMAIL))
                .store(msg);
    }

    /** 向 INBOX 投递一封带附件的邮件。 */
    private void deliverWithAttachment(String subject, String filename, byte[] data) throws Exception {
        Session session = Session.getInstance(new Properties());
        MimeMessage msg = new MimeMessage(session);
        msg.setFrom(new InternetAddress("sender@example.com"));
        msg.setRecipient(MimeMessage.RecipientType.TO, new InternetAddress(EMAIL));
        msg.setSubject(subject, "UTF-8");
        msg.setSentDate(new Date());

        MimeMultipart multipart = new MimeMultipart();
        MimeBodyPart textPart = new MimeBodyPart();
        textPart.setText("正文", "UTF-8");
        multipart.addBodyPart(textPart);

        MimeBodyPart attachPart = new MimeBodyPart();
        attachPart.setDataHandler(new DataHandler(new ByteArrayDataSource(data, "application/pdf")));
        attachPart.setFileName(filename);
        attachPart.setDisposition(MimeMessage.ATTACHMENT);
        multipart.addBodyPart(attachPart);

        msg.setContent(multipart);
        msg.saveChanges();
        greenMail.getManagers().getImapHostManager()
                .getInbox(greenMail.getUserManager().getUserByEmail(EMAIL))
                .store(msg);
    }

    @Test
    void refreshFetchesAndStoresNewMessages() throws Exception {
        // 首次刷新应拉取并存储 INBOX 全部邮件
        deliverText("第一封", "正文1");
        deliverText("第二封", "正文2");

        int newCount = service.refresh(accountId);

        assertEquals(2, newCount);
        assertEquals(2, messageRepo.countByAccount(accountId));
    }

    @Test
    void refreshIsIncrementalOnSecondCall() throws Exception {
        // 第二次刷新仅拉取新邮件（增量）
        deliverText("旧邮件", "old");
        service.refresh(accountId);

        deliverText("新邮件", "new");
        int secondCount = service.refresh(accountId);

        assertEquals(1, secondCount, "第二次只应拉到 1 封新邮件");
        assertEquals(2, messageRepo.countByAccount(accountId));
    }

    @Test
    void refreshUpdatesLastUid() throws Exception {
        // 刷新后应更新账号的 last_uid 与 last_sync_at
        deliverText("邮件", "body");
        service.refresh(accountId);

        Account account = accountRepo.findById(accountId).orElseThrow();
        assertTrue(account.lastUid() > 0, "last_uid 应被更新");
        assertTrue(account.lastSyncAt() > 0, "last_sync_at 应被更新");
        assertTrue(account.uidValidity() > 0, "uid_validity 应被记录");
    }

    @Test
    void refreshPersistsMessageContent() throws Exception {
        // 邮件主题与正文应正确入库
        deliverText("主题内容", "正文内容");
        service.refresh(accountId);

        Message stored = messageRepo.listByAccount(accountId, 1, 10).get(0);
        assertEquals("主题内容", stored.subject());
        assertEquals("正文内容", stored.bodyText().strip());
        assertTrue(stored.fromAddr().contains("sender@example.com"));
    }

    @Test
    void refreshStoresAttachmentToDiskAndDb() throws Exception {
        // 带附件邮件：附件应落盘且在库中有记录
        byte[] data = "PDF-CONTENT-DATA".getBytes(StandardCharsets.UTF_8);
        deliverWithAttachment("带附件", "report.pdf", data);

        service.refresh(accountId);

        Message stored = messageRepo.listByAccount(accountId, 1, 10).get(0);
        assertTrue(stored.hasAttach(), "应标记含附件");

        List<Attachment> atts = attachmentRepo.findByMessage(stored.id());
        assertEquals(1, atts.size());
        Attachment att = atts.get(0);
        assertEquals("report.pdf", att.filename());

        // 落盘文件应存在且内容一致
        Path filePath = attachmentsDir.getParent().resolve(att.filePath());
        assertTrue(Files.exists(filePath), "附件文件应已落盘: " + filePath);
        assertArrayEquals(data, Files.readAllBytes(filePath));
    }

    @Test
    void refreshOnEmptyInboxReturnsZero() {
        // 空收件箱刷新返回 0
        int newCount = service.refresh(accountId);
        assertEquals(0, newCount);
    }

    @Test
    void refreshDoesNotDuplicateOnRepeatedCallsWithoutNewMail() throws Exception {
        // 无新邮件时重复刷新不产生重复入库
        deliverText("邮件", "body");
        service.refresh(accountId);
        int second = service.refresh(accountId);

        assertEquals(0, second);
        assertEquals(1, messageRepo.countByAccount(accountId));
    }
}
