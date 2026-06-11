package com.maildock.web;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.model.Account;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AdminRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.security.TokenStore;
import com.maildock.service.AuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Date;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class MailRouteTest {

    // 内嵌 IMAP 服务器（明文），用于 refresh 拉取邮件
    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 字节
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private AttachmentRepository attachmentRepo;
    private Path dbFile;
    private Path attachmentsDir;
    private int port;
    private String token;
    private long accountId;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-mail-route", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-mail-route-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        AdminRepository adminRepo = new AdminRepository(db);
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);
        TokenStore tokenStore = new TokenStore();

        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
            // 已存在则复用
        }

        // 工厂统一指向 GreenMail
        MailSyncService.ImapClientFactory factory =
                (host, p, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", ServerSetupTest.IMAP.getPort(), false, email, authCode);
        MailSyncService mailSyncService =
                new MailSyncService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);
        MailQueryService mailQueryService =
                new MailQueryService(messageRepo, attachmentRepo, attachmentsDir);

        AuthService authService = new AuthService(adminRepo, tokenStore);
        authService.ensureDefaultAdmin("admin", "init-pass");
        token = authService.login("admin", "init-pass").orElseThrow();

        accountId = accountRepo.insert(EMAIL, crypto.encrypt(AUTH_CODE)).id();

        Router router = new ApiRouter(vertx, authService, null, mailSyncService, mailQueryService).build();
        server = vertx.createHttpServer().requestHandler(router);
        server.listen(0).onComplete(ctx.succeeding(s -> {
            port = s.actualPort();
            client = WebClient.create(vertx);
            ctx.completeNow();
        }));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) server.close();
        if (vertx != null) vertx.close();
        if (db != null) db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 向 INBOX 投递一封纯文本邮件。 */
    private void deliver(String subject, String body) throws Exception {
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

    /** 直接入库一封邮件，便于查询类测试。 */
    private Message insertMessage(long uid, String subject) {
        return messageRepo.insert(new Message(
                0, accountId, uid, "<mid-" + uid + ">", subject,
                "alice@163.com", EMAIL, null,
                1700000000000L, 1700000000000L + uid * 1000L,
                "纯文本正文", "<p>HTML 正文</p>",
                false, false, 100L, 0L));
    }

    @Test
    void refreshReturnsNewCount(VertxTestContext ctx) throws Exception {
        // 刷新触发增量同步，返回新邮件数
        deliver("新邮件1", "正文1");
        deliver("新邮件2", "正文2");

        client.post(port, "localhost", ApiRouter.API + "/accounts/" + accountId + "/refresh")
                .putHeader("Authorization", "Bearer " + token)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(2, body.getInteger("newCount"));
                    assertTrue(body.getLong("syncedAt") > 0);
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void listMessagesReturnsPagedSummaries(VertxTestContext ctx) throws Exception {
        // 邮件列表分页返回摘要与总数
        for (int i = 1; i <= 3; i++) {
            insertMessage(i, "主题" + i);
        }

        client.get(port, "localhost", ApiRouter.API + "/accounts/" + accountId + "/messages?page=1&size=2")
                .putHeader("Authorization", "Bearer " + token)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(3, body.getInteger("total"));
                    JsonArray items = body.getJsonArray("items");
                    assertEquals(2, items.size());
                    // 摘要不含正文
                    JsonObject first = items.getJsonObject(0);
                    assertNotNull(first.getString("subject"));
                    assertNull(first.getString("bodyText"), "列表摘要不应包含正文");
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void getMessageDetailReturnsBodyAndAttachments(VertxTestContext ctx) throws Exception {
        // 邮件详情返回正文与附件列表
        Message m = insertMessage(1, "详情邮件");
        attachmentRepo.insert(m.id(), "a.pdf", "application/pdf", 10L,
                "attachments/" + accountId + "/" + m.id() + "/a.pdf");

        client.get(port, "localhost", ApiRouter.API + "/messages/" + m.id())
                .putHeader("Authorization", "Bearer " + token)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals("详情邮件", body.getString("subject"));
                    assertEquals("纯文本正文", body.getString("bodyText"));
                    JsonArray atts = body.getJsonArray("attachments");
                    assertEquals(1, atts.size());
                    assertEquals("a.pdf", atts.getJsonObject(0).getString("filename"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void getMessageDetailReturns404WhenAbsent(VertxTestContext ctx) throws Exception {
        // 不存在的邮件返回 404
        client.get(port, "localhost", ApiRouter.API + "/messages/99999")
                .putHeader("Authorization", "Bearer " + token)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(404, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void downloadAttachmentReturnsBytes(VertxTestContext ctx) throws Exception {
        // 下载附件返回文件内容
        Message m = insertMessage(1, "带附件");
        byte[] data = "FILE-CONTENT".getBytes();
        Path dir = attachmentsDir.resolve(String.valueOf(accountId)).resolve(String.valueOf(m.id()));
        Files.createDirectories(dir);
        Files.write(dir.resolve("a.pdf"), data);
        String relPath = attachmentsDir.getFileName() + "/" + accountId + "/" + m.id() + "/a.pdf";
        Attachment att = attachmentRepo.insert(m.id(), "a.pdf", "application/pdf", (long) data.length, relPath);

        client.get(port, "localhost", ApiRouter.API + "/messages/" + m.id() + "/attachments/" + att.id())
                .putHeader("Authorization", "Bearer " + token)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertArrayEquals(data, resp.bodyAsBuffer().getBytes());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void markReadReturns200(VertxTestContext ctx) throws Exception {
        // 标记已读返回 200，库中标记更新
        Message m = insertMessage(1, "未读");

        client.patch(port, "localhost", ApiRouter.API + "/messages/" + m.id() + "/read")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("read", true))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertTrue(messageRepo.findById(m.id()).orElseThrow().isRead());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
