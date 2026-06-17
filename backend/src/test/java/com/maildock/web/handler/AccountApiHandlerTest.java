package com.maildock.web.handler;

import com.maildock.mail.ImapClient;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.MessageRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.security.SessionStore;
import com.maildock.service.AccountService;
import com.maildock.service.AuthService;
import com.maildock.model.User;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class AccountApiHandlerTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private Path attachmentsDir;
    private int port;
    private String cookie;
    private String otherCookie;
    private AuthService authService;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-account-handler", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-account-handler");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        AccountRepository accountRepo = new AccountRepository(db);
        MessageRepository messageRepo = new MessageRepository(db);
        AttachmentRepository attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);
        SessionStore sessionStore = new SessionStore();
        authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");
        authService.ensureDefaultEmailUser("bob@example.com", "bob-pass");
        cookie = sessionCookie(authService.loginWithEmailPassword("alice@example.com", "init-pass")
                .orElseThrow().sessionToken());
        otherCookie = sessionCookie(authService.loginWithEmailPassword("bob@example.com", "bob-pass")
                .orElseThrow().sessionToken());

        AccountService.ImapClientFactory factory =
                (host, p, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", 1143, false, email, authCode);
        AccountService accountService =
                new AccountService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.route(ApiRouter.API + "/*").handler(route -> {
            String header = route.request().getHeader("Cookie");
            String token = null;
            if (header != null) {
                for (String part : header.split(";")) {
                    String cookiePart = part.strip();
                    if (cookiePart.startsWith("maildock_session=")) {
                        token = cookiePart.substring("maildock_session=".length()).strip();
                        break;
                    }
                }
            }
            User user = authService.currentUser(token).orElse(null);
            if (user == null) {
                route.response().setStatusCode(401).end();
                return;
            }
            route.put("currentUserId", user.id());
            route.put("currentUser", user);
            route.next();
        });
        new AccountApiHandler(vertx, accountService)
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
    void createAccountAndListReturnsCurrentUserAccounts(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("email", "alice@163.com").put("authCode", "code-1"))
                .compose(created -> client.get(port, "localhost", ApiRouter.API + "/accounts")
                        .putHeader("Cookie", cookie)
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(1L, body.getLong("total"));
                    JsonArray items = body.getJsonArray("items");
                    assertEquals(1, items.size());
                    JsonObject first = items.getJsonObject(0);
                    assertEquals("alice@163.com", first.getString("email"));
                    assertNull(first.getString("authCodeEnc"));
                    assertNotNull(first.getLong("id"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void listDoesNotExposeOtherUsersAccount(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", otherCookie)
                .sendJsonObject(new JsonObject().put("email", "bob@163.com").put("authCode", "code-2"))
                .compose(created -> client.get(port, "localhost", ApiRouter.API + "/accounts")
                        .putHeader("Cookie", cookie)
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals(0L, resp.bodyAsJsonObject().getLong("total"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void importCreatesAccountsForCurrentUser(VertxTestContext ctx) throws Exception {
        String text = "first@163.com code-1\nsecond@163.com code-2\n";

        client.post(port, "localhost", ApiRouter.API + "/accounts/import")
                .putHeader("Cookie", cookie)
                .putHeader("Content-Type", "text/plain")
                .sendBuffer(io.vertx.core.buffer.Buffer.buffer(text))
                .compose(resp -> {
                    ctx.verify(() -> {
                        assertEquals(200, resp.statusCode());
                        assertEquals(2, resp.bodyAsJsonObject().getInteger("success"));
                    });
                    return client.get(port, "localhost", ApiRouter.API + "/accounts")
                            .putHeader("Cookie", cookie)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals(2L, resp.bodyAsJsonObject().getLong("total"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void testConnectionReturnsOwnedAccountStatus(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("email", "alice@163.com").put("authCode", "code-1"))
                .compose(created -> client.post(
                                port,
                                "localhost",
                                ApiRouter.API + "/accounts/" + created.bodyAsJsonObject().getLong("id") + "/test")
                        .putHeader("Cookie", cookie)
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertFalse(resp.bodyAsJsonObject().getBoolean("ok"));
                    assertNotNull(resp.bodyAsJsonObject().getString("message"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void testBatchOnlyReturnsCurrentUsersAccounts(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("email", "alice@163.com").put("authCode", "code-1"))
                .compose(first -> client.post(port, "localhost", ApiRouter.API + "/accounts")
                        .putHeader("Cookie", otherCookie)
                        .sendJsonObject(new JsonObject().put("email", "bob@163.com").put("authCode", "code-2"))
                        .map(second -> new JsonObject()
                                .put("ownedId", first.bodyAsJsonObject().getLong("id"))
                                .put("otherId", second.bodyAsJsonObject().getLong("id"))))
                .compose(ids -> client.post(port, "localhost", ApiRouter.API + "/accounts/test-batch")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject()
                                .put("ids", new JsonArray().add(ids.getLong("ownedId")).add(ids.getLong("otherId")))))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonArray results = resp.bodyAsJsonObject().getJsonArray("results");
                    assertEquals(1, results.size());
                    assertEquals("alice@163.com", results.getJsonObject(0).getString("email"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void deleteRemovesOwnedAccount(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("email", "alice@163.com").put("authCode", "code-1"))
                .compose(created -> client.delete(
                                port,
                                "localhost",
                                ApiRouter.API + "/accounts/" + created.bodyAsJsonObject().getLong("id"))
                        .putHeader("Cookie", cookie)
                        .send())
                .compose(resp -> {
                    ctx.verify(() -> assertEquals(204, resp.statusCode()));
                    return client.get(port, "localhost", ApiRouter.API + "/accounts")
                            .putHeader("Cookie", cookie)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(0L, resp.bodyAsJsonObject().getLong("total"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void deleteBatchRequiresIds(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/accounts/delete-batch")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject().put("ids", new JsonArray()))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertEquals("ids 不能为空", resp.bodyAsJsonObject().getString("message"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    private String sessionCookie(String token) {
        return "maildock_session=" + token;
    }
}
