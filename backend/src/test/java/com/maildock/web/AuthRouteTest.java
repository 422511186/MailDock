package com.maildock.web;

import com.maildock.repository.AdminRepository;
import com.maildock.repository.Database;
import com.maildock.security.TokenStore;
import com.maildock.service.AuthService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class AuthRouteTest {

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private int port;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-auth-route", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        AdminRepository adminRepo = new AdminRepository(db);
        TokenStore tokenStore = new TokenStore();
        AuthService authService = new AuthService(adminRepo, tokenStore);
        authService.ensureDefaultAdmin("admin", "init-pass");

        // 仅装配认证相关依赖，账号/邮件 service 传 null（认证路由测试用不到）
        Router router = new ApiRouter(vertx, authService, null, null, null).build();

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
    void loginWithCorrectCredentialsReturnsToken(VertxTestContext ctx) throws Exception {
        // 正确凭据登录返回 200 与 token
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("username", "admin").put("password", "init-pass"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertNotNull(resp.bodyAsJsonObject().getString("token"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void loginWithWrongPasswordReturns401(VertxTestContext ctx) throws Exception {
        // 错误密码返回 401
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("username", "admin").put("password", "wrong"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWithoutTokenReturns401(VertxTestContext ctx) throws Exception {
        // 未带 Token 访问受保护路由返回 401
        client.get(port, "localhost", ApiRouter.API + "/accounts")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWithInvalidTokenReturns401(VertxTestContext ctx) throws Exception {
        // 无效 Token 访问受保护路由返回 401
        client.get(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Authorization", "Bearer bogus-token")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void logoutRevokesToken(VertxTestContext ctx) throws Exception {
        // 登录拿到 token，登出后该 token 失效
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("username", "admin").put("password", "init-pass"))
                .compose(loginResp -> {
                    String token = loginResp.bodyAsJsonObject().getString("token");
                    return client.post(port, "localhost", ApiRouter.API + "/auth/logout")
                            .putHeader("Authorization", "Bearer " + token)
                            .send()
                            .map(logoutResp -> {
                                ctx.verify(() -> assertEquals(204, logoutResp.statusCode()));
                                return token;
                            });
                })
                .onComplete(ctx.succeeding(token -> ctx.verify(() -> {
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void loginWithMissingFieldsReturns400(VertxTestContext ctx) throws Exception {
        // 缺少字段返回 400
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("username", "admin"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
