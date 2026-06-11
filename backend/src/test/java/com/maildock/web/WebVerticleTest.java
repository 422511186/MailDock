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
        env.put("MAILDOCK_DEFAULT_EMAIL", "alice@example.com");
        env.put("MAILDOCK_DEFAULT_PASSWORD", "init-pass");
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
        // 必须等待 vertx 关闭完成（含 SQLite 连接释放）再删库文件，
        // 否则 Windows 上文件句柄仍被占用，deleteIfExists 抛 FileSystemException。
        if (vertx != null) {
            vertx.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
        }
        Files.deleteIfExists(dbFile);
    }

    @Test
    void verticleStartsAndInitializesDefaultEmailUser(VertxTestContext ctx) throws Exception {
        // 部署后应已初始化默认邮箱用户，可用其凭据登录并拿到 session cookie
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertNotNull(resp.getHeader("Set-Cookie"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWorksEndToEnd(VertxTestContext ctx) throws Exception {
        // 端到端：登录后用 cookie 访问受保护的账号列表，返回 200
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .compose(loginResp -> {
                    String cookie = loginResp.getHeader("Set-Cookie");
                    return client.get(port, "localhost", ApiRouter.API + "/accounts")
                            .putHeader("Cookie", cookie)
                            .send();
                })
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
