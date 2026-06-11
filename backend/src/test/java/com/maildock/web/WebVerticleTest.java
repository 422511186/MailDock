package com.maildock.web;

import com.maildock.config.AppConfig;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class WebVerticleTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 字节

    private Vertx vertx;
    private WebClient client;
    private Path dbFile;
    private Path attachmentsDir;
    private int port;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-web-verticle", ".db");
        attachmentsDir = Files.createTempDirectory("maildock-web-verticle-attach");

        // 端口 0 让系统分配空闲端口，避免测试端口冲突
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", KEY);
        env.put("MAILDOCK_ADMIN_USER", "admin");
        env.put("MAILDOCK_ADMIN_PASS", "init-pass");
        env.put("MAILDOCK_HTTP_PORT", "0");
        env.put("MAILDOCK_DB_PATH", dbFile.toAbsolutePath().toString());
        env.put("MAILDOCK_ATTACHMENTS_DIR", attachmentsDir.toAbsolutePath().toString());
        AppConfig config = AppConfig.from(env);

        WebVerticle verticle = new WebVerticle(config);
        vertx.deployVerticle(verticle).onComplete(ctx.succeeding(id -> {
            port = verticle.actualPort();
            client = WebClient.create(vertx);
            ctx.completeNow();
        }));
        assertTrue(ctx.awaitCompletion(15, TimeUnit.SECONDS));
    }

    @AfterEach
    void tearDown() throws Exception {
        if (vertx != null) vertx.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void verticleStartsAndInitializesAdmin(VertxTestContext ctx) throws Exception {
        // 部署后应已初始化默认管理员，可用其凭据登录拿到 token
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
    void protectedRouteWorksEndToEnd(VertxTestContext ctx) throws Exception {
        // 端到端：登录后用 token 访问受保护的账号列表，返回 200
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("username", "admin").put("password", "init-pass"))
                .compose(loginResp -> {
                    String token = loginResp.bodyAsJsonObject().getString("token");
                    return client.get(port, "localhost", ApiRouter.API + "/accounts")
                            .putHeader("Authorization", "Bearer " + token)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
