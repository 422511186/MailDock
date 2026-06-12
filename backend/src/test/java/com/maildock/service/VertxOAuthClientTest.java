package com.maildock.service;

import com.maildock.config.AppConfig;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class VertxOAuthClientTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Vertx vertx;
    private HttpServer server;
    private int port;
    private AtomicReference<String> postedCode;
    private AtomicReference<String> postedVerifier;
    private AtomicReference<String> authHeader;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        postedCode = new AtomicReference<>();
        postedVerifier = new AtomicReference<>();
        authHeader = new AtomicReference<>();

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        router.post("/token").handler(rc -> {
            postedCode.set(rc.request().getFormAttribute("code"));
            postedVerifier.set(rc.request().getFormAttribute("code_verifier"));
            rc.json(new JsonObject().put("access_token", "access-1"));
        });
        router.get("/userinfo").handler(rc -> {
            authHeader.set(rc.request().getHeader("Authorization"));
            rc.json(new JsonObject()
                    .put("uid", 42)
                    .put("mail", "linux@example.com")
                    .put("name", "Linux User")
                    .put("avatar", "https://example.com/avatar.png"));
        });

        server = vertx.createHttpServer().requestHandler(router);
        server.listen(0).onComplete(ctx.succeeding(s -> {
            port = s.actualPort();
            ctx.completeNow();
        }));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) {
            server.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
        if (vertx != null) {
            vertx.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
    }

    @Test
    void exchangeCodePostsFormAndReturnsAccessToken() {
        VertxOAuthClient client = new VertxOAuthClient(vertx, config());

        OAuthClient.TokenResponse token = client.exchangeCode(
                baseUrl() + "/token",
                "client-id",
                "client-secret",
                "code-1",
                "https://maildock.example/api/v1/auth/linuxdo/callback",
                "verifier-1");

        assertEquals("access-1", token.accessToken());
        assertEquals("code-1", postedCode.get());
        assertEquals("verifier-1", postedVerifier.get());
    }

    @Test
    void exchangeCodeRoutesThroughConfiguredProxy() throws Exception {
        // 起一个充当 HTTP 代理的服务器：拦截出站请求并直接应答，
        // 证明配置代理后流量经代理转发，而非直连目标地址
        AtomicReference<String> proxiedUri = new AtomicReference<>();
        Router proxyRouter = Router.router(vertx);
        proxyRouter.route().handler(BodyHandler.create());
        proxyRouter.route().handler(rc -> {
            proxiedUri.set(rc.request().absoluteURI());
            rc.json(new JsonObject().put("access_token", "via-proxy"));
        });
        HttpServer proxy = vertx.createHttpServer().requestHandler(proxyRouter);
        int proxyPort = proxy.listen(0).toCompletionStage().toCompletableFuture()
                .get(10, TimeUnit.SECONDS).actualPort();

        // tokenUrl 指向本地无人监听端口：若直连必然连接失败，唯有走代理才能成功
        VertxOAuthClient client = new VertxOAuthClient(vertx, proxyConfig("127.0.0.1", proxyPort));

        OAuthClient.TokenResponse token = client.exchangeCode(
                "http://127.0.0.1:1/token",
                "client-id",
                "client-secret",
                "code-1",
                "https://maildock.example/api/v1/auth/linuxdo/callback",
                "verifier-1");

        assertEquals("via-proxy", token.accessToken());
        assertTrue(proxiedUri.get().endsWith("/token"), "代理应收到指向 /token 的出站请求");

        proxy.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
    }

    @Test
    void fetchUserSendsBearerTokenAndMapsConfiguredFields() {
        VertxOAuthClient client = new VertxOAuthClient(vertx, config());

        OAuthClient.OAuthUser user = client.fetchUser(baseUrl() + "/userinfo", "access-1");

        assertEquals("Bearer access-1", authHeader.get());
        assertEquals("42", user.providerUid());
        assertEquals("linux@example.com", user.email());
        assertEquals("Linux User", user.displayName());
        assertEquals("https://example.com/avatar.png", user.avatarUrl());
    }

    private String baseUrl() {
        return "http://localhost:" + port;
    }

    private AppConfig config() {
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", KEY);
        env.put("MAILDOCK_LINUXDO_USER_ID_FIELD", "uid");
        env.put("MAILDOCK_LINUXDO_EMAIL_FIELD", "mail");
        env.put("MAILDOCK_LINUXDO_NAME_FIELD", "name");
        env.put("MAILDOCK_LINUXDO_AVATAR_FIELD", "avatar");
        return AppConfig.from(env);
    }

    private AppConfig proxyConfig(String proxyHost, int proxyPort) {
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", KEY);
        env.put("MAILDOCK_HTTP_PROXY_HOST", proxyHost);
        env.put("MAILDOCK_HTTP_PROXY_PORT", String.valueOf(proxyPort));
        return AppConfig.from(env);
    }
}
