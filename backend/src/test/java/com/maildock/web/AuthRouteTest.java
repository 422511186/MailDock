package com.maildock.web;

import com.maildock.config.AppConfig;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.service.OAuthClient;
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
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
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

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        SessionStore sessionStore = new SessionStore();
        AuthService authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

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
    void emailLoginSetsHttpOnlyCookieAndMeReturnsUser(VertxTestContext ctx) throws Exception {
        // 正确凭据登录设置 HttpOnly Cookie，随后 /auth/me 可恢复当前用户
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .compose(loginResp -> {
                    String cookie = loginResp.getHeader("Set-Cookie");
                    ctx.verify(() -> {
                        assertEquals(200, loginResp.statusCode());
                        assertNotNull(cookie);
                        assertTrue(cookie.contains("maildock_session="));
                        assertTrue(cookie.contains("HttpOnly"));
                        assertTrue(cookie.contains("SameSite=Lax"));
                    });
                    return client.get(port, "localhost", ApiRouter.API + "/auth/me")
                            .putHeader("Cookie", cookie)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals("alice@example.com", body.getString("primaryEmail"));
                    assertEquals("alice@example.com", body.getString("displayName"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void loginWithWrongPasswordReturns401(VertxTestContext ctx) throws Exception {
        // 错误密码返回 401
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "wrong"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void meWithoutCookieReturns401(VertxTestContext ctx) throws Exception {
        // 未带 Cookie 访问 /auth/me 返回 401
        client.get(port, "localhost", ApiRouter.API + "/auth/me")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWithoutCookieReturns401(VertxTestContext ctx) throws Exception {
        // 未带 Cookie 访问受保护路由返回 401
        client.get(port, "localhost", ApiRouter.API + "/accounts")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWithInvalidCookieReturns401(VertxTestContext ctx) throws Exception {
        // 无效 Cookie 访问受保护路由返回 401
        client.get(port, "localhost", ApiRouter.API + "/accounts")
                .putHeader("Cookie", "maildock_session=bogus-token")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void logoutClearsCookieAndInvalidatesSession(VertxTestContext ctx) throws Exception {
        // 登录拿到 cookie，登出后该 session 失效并清理 Cookie
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .compose(loginResp -> {
                    String cookie = loginResp.getHeader("Set-Cookie");
                    return client.post(port, "localhost", ApiRouter.API + "/auth/logout")
                            .putHeader("Cookie", cookie)
                            .send()
                            .map(logoutResp -> {
                                ctx.verify(() -> {
                                    assertEquals(204, logoutResp.statusCode());
                                    String clearCookie = logoutResp.getHeader("Set-Cookie");
                                    assertNotNull(clearCookie);
                                    assertTrue(clearCookie.contains("maildock_session="));
                                    assertTrue(clearCookie.contains("Max-Age=0"));
                                });
                                return cookie;
                            });
                })
                .compose(cookie -> client.get(port, "localhost", ApiRouter.API + "/auth/me")
                        .putHeader("Cookie", cookie)
                        .send())
                .onComplete(ctx.succeeding(meResp -> ctx.verify(() -> {
                    assertEquals(401, meResp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void loginWithMissingFieldsReturns400(VertxTestContext ctx) throws Exception {
        // 缺少字段返回 400
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void linuxdoStartWithoutOauthConfigReturns500(VertxTestContext ctx) throws Exception {
        // OAuth 配置缺失时，start 路由返回配置错误
        client.get(port, "localhost", ApiRouter.API + "/auth/linuxdo/start")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(500, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void linuxdoCallbackRedirectsToFrontendCallbackRoute(VertxTestContext ctx) throws Exception {
        // OAuth 回调成功后应回到前端 /auth/callback，由 React Router 展示登录中页面并恢复会话
        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        SessionStore sessionStore = new SessionStore();
        AuthService authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        LinuxDoOAuthService oauth = new LinuxDoOAuthService(oauthConfig(), authService, new FakeOAuthClient());
        LinuxDoOAuthService.StartResult start = oauth.start();

        Router router = new ApiRouter(vertx, authService, oauth, null, null, null,
                false, Duration.ofHours(1), "http://localhost:5173/", "http://localhost:5173").build();
        HttpServer oauthServer = vertx.createHttpServer().requestHandler(router);
        int oauthPort = oauthServer.listen(0).toCompletionStage().toCompletableFuture()
                .get(10, TimeUnit.SECONDS).actualPort();

        client.get(oauthPort, "localhost",
                        ApiRouter.API + "/auth/linuxdo/callback?code=code-1&state=" + start.state())
                .followRedirects(false)
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(302, resp.statusCode());
                    assertEquals("/auth/callback", resp.getHeader("Location"));
                    oauthServer.close();
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    private AppConfig oauthConfig() {
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", "0123456789abcdef0123456789abcdef");
        env.put("MAILDOCK_LINUXDO_CLIENT_ID", "client-id");
        env.put("MAILDOCK_LINUXDO_CLIENT_SECRET", "client-secret");
        env.put("MAILDOCK_LINUXDO_AUTH_URL", "https://connect.linux.do/oauth2/authorize");
        env.put("MAILDOCK_LINUXDO_TOKEN_URL", "https://connect.linux.do/oauth2/token");
        env.put("MAILDOCK_LINUXDO_USERINFO_URL", "https://connect.linux.do/api/user");
        env.put("MAILDOCK_PUBLIC_BASE_URL", "https://maildock.example");
        return AppConfig.from(env);
    }

    private static final class FakeOAuthClient implements OAuthClient {
        @Override
        public TokenResponse exchangeCode(String tokenUrl, String clientId, String clientSecret,
                                          String code, String redirectUri, String codeVerifier) {
            return new TokenResponse("access-token");
        }

        @Override
        public OAuthUser fetchUser(String userinfoUrl, String accessToken) {
            return new OAuthUser("linux-42", "linux@example.com", "linux name", "avatar");
        }
    }
}
