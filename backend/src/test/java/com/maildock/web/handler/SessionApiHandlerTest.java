package com.maildock.web.handler;

import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
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
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class SessionApiHandlerTest {

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private int port;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-session-handler", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        AuthService authService = new AuthService(userRepo, identityRepo, new SessionStore(), Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        new AuthApiHandler(vertx, authService, null, false, Duration.ofHours(1))
                .registerPublicRoutes(router, ApiRouter.API);
        new SessionApiHandler(vertx, authService, false)
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
    void meAndLogoutWorkWithCookieSession(VertxTestContext ctx) throws Exception {
        client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .compose(loginResp -> {
                    String cookie = loginResp.getHeader("Set-Cookie");
                    return client.get(port, "localhost", ApiRouter.API + "/auth/me")
                            .putHeader("Cookie", cookie)
                            .send()
                            .compose(meResp -> {
                                ctx.verify(() -> {
                                    assertEquals(200, meResp.statusCode());
                                    assertEquals("alice@example.com", meResp.bodyAsJsonObject().getString("primaryEmail"));
                                });
                                return client.post(port, "localhost", ApiRouter.API + "/auth/logout")
                                        .putHeader("Cookie", cookie)
                                        .send();
                            })
                            .map(logoutResp -> new String[]{cookie, logoutResp.getHeader("Set-Cookie")});
                })
                .compose(values -> client.get(port, "localhost", ApiRouter.API + "/auth/me")
                        .putHeader("Cookie", values[0])
                        .send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void protectedRouteWithoutCookieReturns401(VertxTestContext ctx) throws Exception {
        client.get(port, "localhost", ApiRouter.API + "/accounts")
                .send()
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
