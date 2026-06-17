package com.maildock.web.handler;

import com.maildock.config.AppConfig;
import com.maildock.model.User;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.service.OAuthClient;
import com.maildock.web.ApiRouter;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
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
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class AuthApiHandlerTest {

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private int port;
    private AuthService authService;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-auth-handler", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        authService = new AuthService(userRepo, identityRepo, new SessionStore(), Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        new AuthApiHandler(
                vertx,
                authService,
                oauthService(),
                false,
                Duration.ofHours(1))
                .registerPublicRoutes(router, ApiRouter.API);

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
        if (server != null) {
            server.close();
        }
        if (vertx != null) {
            vertx.close();
        }
        if (db != null) {
            db.close();
        }
        Files.deleteIfExists(dbFile);
    }

    @Test
    void publicLoginSetsHttpOnlyCookieAndReturnsCurrentUser(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    String cookie = resp.getHeader("Set-Cookie");
                    assertNotNull(cookie);
                    assertTrue(cookie.contains("maildock_session="));
                    assertTrue(cookie.contains("HttpOnly"));
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals("alice@example.com", body.getString("primaryEmail"));
                    assertEquals("alice@example.com", body.getString("displayName"));
                    assertTrue(body.getBoolean("hasPassword"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void publicLoginWithMissingJsonFieldsReturns400(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .putHeader("Content-Type", "text/plain")
                .sendBuffer(io.vertx.core.buffer.Buffer.buffer("not-json"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    assertEquals("邮箱和密码不能为空", resp.bodyAsJsonObject().getString("message"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void oauthCallbackRedirectsToFrontendCallbackRoute(VertxTestContext ctx) throws Exception {
        client.get(port, "localhost", ApiRouter.API + "/auth/linuxdo/start")
                .followRedirects(false)
                .send()
                .compose(startResp -> {
                    String location = startResp.getHeader("Location");
                    String state = location.replaceFirst(".*[?&]state=([^&]+).*$", "$1");
                    return client.get(port, "localhost",
                                    ApiRouter.API + "/auth/linuxdo/callback?code=code-1&state=" + state)
                            .followRedirects(false)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(302, resp.statusCode());
                    assertEquals("/auth/callback", resp.getHeader("Location"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    private LinuxDoOAuthService oauthService() {
        return new LinuxDoOAuthService(oauthConfig(), authService, new FakeOAuthClient());
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
