package com.maildock.web.handler;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import com.maildock.web.ApiRouter;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.handler.BodyHandler;
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
import java.time.Duration;
import java.util.Date;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class MailApiHandlerTest {

    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef";
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private AccountRepository accountRepo;
    private MessageRepository messageRepo;
    private Path dbFile;
    private Path attachmentsDir;
    private int port;
    private String cookie;
    private long userAId;
    private long accountId;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-mail-handler", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-mail-handler");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        accountRepo = new AccountRepository(db);
        messageRepo = new MessageRepository(db);
        AttachmentRepository attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);
        SessionStore sessionStore = new SessionStore();
        AuthService authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");
        AuthService.LoginResult login = authService.loginWithEmailPassword("alice@example.com", "init-pass").orElseThrow();
        userAId = login.user().id();
        cookie = "maildock_session=" + login.sessionToken();

        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
        }

        MailSyncService.ImapClientFactory factory =
                (host, p, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", ServerSetupTest.IMAP.getPort(), false, email, authCode);
        MailSyncService mailSyncService =
                new MailSyncService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);
        MailQueryService mailQueryService =
                new MailQueryService(messageRepo, attachmentRepo, attachmentsDir);

        accountId = accountRepo.insert(userAId, EMAIL, crypto.encrypt(AUTH_CODE)).id();

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.route(ApiRouter.API + "/*").handler(route -> {
            String header = route.request().getHeader("Cookie");
            String token = header != null && header.startsWith("maildock_session=")
                    ? header.substring("maildock_session=".length())
                    : null;
            User user = authService.currentUser(token).orElse(null);
            if (user == null) {
                route.response().setStatusCode(401).end();
                return;
            }
            route.put("currentUserId", user.id());
            route.put("currentUser", user);
            route.next();
        });
        new MailApiHandler(vertx, mailSyncService, mailQueryService)
                .registerRoutes(router, ApiRouter.API);

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

    @Test
    void refreshAndListMessagesWorkForCurrentUser(VertxTestContext ctx) throws Exception {
        deliver("Subject 1", "Body 1");
        deliver("Subject 2", "Body 2");

        client.post(port, "localhost", ApiRouter.API + "/accounts/" + accountId + "/refresh")
                .putHeader("Cookie", cookie)
                .send()
                .compose(refreshResp -> {
                    ctx.verify(() -> {
                        assertEquals(200, refreshResp.statusCode());
                        assertEquals(2, refreshResp.bodyAsJsonObject().getInteger("newCount"));
                    });
                    return client.get(port, "localhost", ApiRouter.API + "/accounts/" + accountId + "/messages")
                            .putHeader("Cookie", cookie)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(2, body.getLong("total"));
                    JsonArray items = body.getJsonArray("items");
                    assertEquals(2, items.size());
                    assertNotNull(items.getJsonObject(0).getString("subject"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void messageDetailReturnsBody(VertxTestContext ctx) throws Exception {
        Message message = messageRepo.insert(new Message(
                0, accountId, 1L, "<mid-1>", "Detail Subject",
                "from@example.com", EMAIL, null,
                1700000000000L, 1700000000000L,
                "Text Body", "<p>Text Body</p>",
                false, false, 100L, 0L));

        client.get(port, "localhost", ApiRouter.API + "/messages/" + message.id())
                .putHeader("Cookie", cookie)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals("Detail Subject", resp.bodyAsJsonObject().getString("subject"));
                    assertEquals("Text Body", resp.bodyAsJsonObject().getString("bodyText"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void downloadAttachmentReturnsBytes(VertxTestContext ctx) throws Exception {
        Message message = messageRepo.insert(new Message(
                0, accountId, 2L, "<mid-2>", "Attachment Subject",
                "from@example.com", EMAIL, null,
                1700000000000L, 1700000000000L,
                "Body", null,
                true, false, 128L, 0L));
        byte[] data = "FILE-CONTENT".getBytes();
        Path dir = attachmentsDir.resolve(String.valueOf(userAId))
                .resolve(String.valueOf(accountId))
                .resolve(String.valueOf(message.id()));
        Files.createDirectories(dir);
        Files.write(dir.resolve("a.pdf"), data);
        String filePath = attachmentsDir.getFileName() + "/" + userAId + "/" + accountId + "/" + message.id() + "/a.pdf";
        Attachment attachment = new AttachmentRepository(db)
                .insert(message.id(), "a.pdf", "application/pdf", data.length, filePath);

        client.get(port, "localhost", ApiRouter.API + "/messages/" + message.id() + "/attachments/" + attachment.id())
                .putHeader("Cookie", cookie)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertArrayEquals(data, resp.bodyAsBuffer().getBytes());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void markReadUpdatesMessageState(VertxTestContext ctx) throws Exception {
        Message message = messageRepo.insert(new Message(
                0, accountId, 3L, "<mid-3>", "Unread Subject",
                "from@example.com", EMAIL, null,
                1700000000000L, 1700000000000L,
                "Body", null,
                false, false, 64L, 0L));

        client.patch(port, "localhost", ApiRouter.API + "/messages/" + message.id() + "/read")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("read", true))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertTrue(messageRepo.findById(message.id()).orElseThrow().isRead());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

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
}
