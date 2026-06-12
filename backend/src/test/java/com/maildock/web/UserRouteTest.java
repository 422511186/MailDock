package com.maildock.web;

import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
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
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class UserRouteTest {

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private int port;
    private UserRepository userRepo;
    private IdentityRepository identityRepo;
    private AuthService authService;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-user-route", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        userRepo = new UserRepository(db);
        identityRepo = new IdentityRepository(db);
        SessionStore sessionStore = new SessionStore();
        authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

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

    /** 登录后拿到 Cookie，供后续受保护请求使用。 */
    private io.vertx.core.Future<String> loginCookie() {
        return client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .map(resp -> resp.getHeader("Set-Cookie"));
    }

    @Test
    void meContainsHasPasswordTrueForEmailUser(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.get(port, "localhost", ApiRouter.API + "/auth/me")
                        .putHeader("Cookie", cookie).send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getBoolean("hasPassword"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
