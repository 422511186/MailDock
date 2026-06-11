package com.maildock.web;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.maildock.mail.ImapClient;
import com.maildock.repository.AccountRepository;
import com.maildock.repository.AdminRepository;
import com.maildock.repository.AttachmentRepository;
import com.maildock.repository.Database;
import com.maildock.repository.MessageRepository;
import com.maildock.security.CryptoUtil;
import com.maildock.security.TokenStore;
import com.maildock.service.AccountService;
import com.maildock.service.AuthService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class AccountRouteTest {

    // 内嵌 IMAP 服务器，用于创建账号时的自动测活（明文）
    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 字节
    private static final String EMAIL = "owner@example.com";
    private static final String AUTH_CODE = "secret-pass";

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private Path attachmentsDir;
    private int port;
    private String token;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-acct-route", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-acct-route-attach");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        AdminRepository adminRepo = new AdminRepository(db);
        AccountRepository accountRepo = new AccountRepository(db);
        MessageRepository messageRepo = new MessageRepository(db);
        AttachmentRepository attachmentRepo = new AttachmentRepository(db);
        CryptoUtil crypto = new CryptoUtil(KEY);
        TokenStore tokenStore = new TokenStore();

        try {
            greenMail.getUserManager().createUser(EMAIL, EMAIL, AUTH_CODE);
        } catch (Exception ignore) {
            // 已存在则复用
        }

        // 工厂统一指向 GreenMail，便于测活逻辑可测
        AccountService.ImapClientFactory factory =
                (host, p, ssl, email, authCode) ->
                        new ImapClient("127.0.0.1", ServerSetupTest.IMAP.getPort(), false, email, authCode);
        AccountService accountService =
                new AccountService(accountRepo, messageRepo, attachmentRepo, crypto, factory, attachmentsDir);

        AuthService authService = new AuthService(adminRepo, tokenStore);
        authService.ensureDefaultAdmin("admin", "init-pass");
        token = authService.login("admin", "init-pass").orElseThrow();

        Router router = new ApiRouter(vertx, authService, accountService, null, null).build();
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
    void createAccountReturns201WithId(VertxTestContext ctx) throws Exception {
        // 创建账号返回 201 与账号信息（不含授权码）
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(201, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertTrue(body.getLong("id") > 0);
                    assertEquals(EMAIL, body.getString("email"));
                    assertNull(body.getString("authCodeEnc"), "响应不应包含授权码");
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void createAccountMissingEmailReturns400(VertxTestContext ctx) throws Exception {
        // 缺少邮箱返回 400
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("authCode", AUTH_CODE))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void listAccountsReturnsPagedResult(VertxTestContext ctx) throws Exception {
        // 列表返回分页结构 { total, items }，items 中不含授权码字段
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .compose(created -> client.get(port, "localhost", ApiRouter.API + "/accounts")
                        .putHeader("Authorization", "Bearer " + token)
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(1, body.getLong("total"));
                    JsonArray items = body.getJsonArray("items");
                    assertEquals(1, items.size());
                    JsonObject first = items.getJsonObject(0);
                    assertEquals(EMAIL, first.getString("email"));
                    assertNull(first.getString("authCodeEnc"), "列表不应包含授权码");
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void listAccountsSupportsEmailSearchAndStatusFilter(VertxTestContext ctx) throws Exception {
        // 邮箱搜索 + 状态过滤：导入两个账号都未测活（pending），按邮箱子串搜索只命中一个
        String txt = "alice@example.com code-1\nbob@example.com code-2\n";
        client.post(port, "localhost", ApiRouter.API + "/accounts/import")
                .putHeader("Authorization", "Bearer " + token)
                .putHeader("Content-Type", "text/plain")
                .sendBuffer(io.vertx.core.buffer.Buffer.buffer(txt))
                .compose(imp -> client.get(port, "localhost", ApiRouter.API + "/accounts")
                        .addQueryParam("email", "alice")
                        .addQueryParam("status", "pending")
                        .putHeader("Authorization", "Bearer " + token)
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(1, body.getLong("total"));
                    assertEquals("alice@example.com",
                            body.getJsonArray("items").getJsonObject(0).getString("email"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void deleteAccountReturns204(VertxTestContext ctx) throws Exception {
        // 删除账号返回 204
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .compose(created -> {
                    long id = created.bodyAsJsonObject().getLong("id");
                    return client.delete(port, "localhost", ApiRouter.API + "/accounts/" + id)
                            .putHeader("Authorization", "Bearer " + token)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(204, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void testConnectionReturnsResult(VertxTestContext ctx) throws Exception {
        // 单个测活返回 { ok, message }
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .compose(created -> {
                    long id = created.bodyAsJsonObject().getLong("id");
                    return client.post(port, "localhost", ApiRouter.API + "/accounts/" + id + "/test")
                            .putHeader("Authorization", "Bearer " + token)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getBoolean("ok"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void testBatchReturnsResults(VertxTestContext ctx) throws Exception {
        // 批量测活返回 results 数组
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .compose(created -> {
                    long id = created.bodyAsJsonObject().getLong("id");
                    return client.post(port, "localhost", ApiRouter.API + "/accounts/test-batch")
                            .putHeader("Authorization", "Bearer " + token)
                            .sendJsonObject(new JsonObject().put("ids", new JsonArray().add(id)));
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonArray results = resp.bodyAsJsonObject().getJsonArray("results");
                    assertEquals(1, results.size());
                    assertTrue(results.getJsonObject(0).getBoolean("ok"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void importFromTextCreatesAccounts(VertxTestContext ctx) throws Exception {
        // 批量导入 txt 文本，返回汇总
        String txt = "# 注释\n" + EMAIL + " " + AUTH_CODE + "\nanother@example.com code-2\n";
        client.post(port, "localhost", ApiRouter.API + "/accounts/import")
                .putHeader("Authorization", "Bearer " + token)
                .putHeader("Content-Type", "text/plain")
                .sendBuffer(io.vertx.core.buffer.Buffer.buffer(txt))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals(2, body.getInteger("total"));
                    assertEquals(2, body.getInteger("success"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void deleteBatchReturnsDeletedCount(VertxTestContext ctx) throws Exception {
        // 批量删除：创建两个账号后批量删除，返回 { deleted: 2 }
        client.post(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("email", EMAIL).put("authCode", AUTH_CODE))
                .compose(r1 -> {
                    long id1 = r1.bodyAsJsonObject().getLong("id");
                    return client.post(port, "localhost", ApiRouter.API + "/accounts")
                            .putHeader("Authorization", "Bearer " + token)
                            .sendJsonObject(new JsonObject().put("email", "second@example.com").put("authCode", AUTH_CODE))
                            .map(r2 -> new JsonArray().add(id1).add(r2.bodyAsJsonObject().getLong("id")));
                })
                .compose(ids -> client.post(port, "localhost", ApiRouter.API + "/accounts/delete-batch")
                        .putHeader("Authorization", "Bearer " + token)
                        .sendJsonObject(new JsonObject().put("ids", ids)))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals(2, resp.bodyAsJsonObject().getInteger("deleted"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @Test
    void deleteBatchEmptyIdsReturns400(VertxTestContext ctx) throws Exception {
        // 批量删除：ids 为空数组应返回 400
        client.post(port, "localhost", ApiRouter.API + "/accounts/delete-batch")
                .putHeader("Authorization", "Bearer " + token)
                .sendJsonObject(new JsonObject().put("ids", new JsonArray()))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }
}
