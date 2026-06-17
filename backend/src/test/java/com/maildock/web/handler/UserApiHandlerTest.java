package com.maildock.web.handler;

import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
import com.maildock.model.User;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(VertxExtension.class)
class UserApiHandlerTest {

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
        dbFile = Files.createTempFile("maildock-user-handler", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        UserRepository userRepo = new UserRepository(db);
        IdentityRepository identityRepo = new IdentityRepository(db);
        authService = new AuthService(userRepo, identityRepo, new SessionStore(), Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());
        new AuthApiHandler(vertx, authService, null, false, Duration.ofHours(1))
                .registerPublicRoutes(router, ApiRouter.API);
        router.route(ApiRouter.API + "/*").handler(route -> {
            String header = route.request().getHeader("Cookie");
            String token = null;
            if (header != null) {
                for (String part : header.split(";")) {
                    String cookie = part.strip();
                    if (cookie.startsWith("maildock_session=")) {
                        token = cookie.substring("maildock_session=".length()).strip();
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
        new UserApiHandler(vertx, authService).registerRoutes(router, ApiRouter.API);

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
    void updateDisplayNameWorksForLoggedInUser(VertxTestContext ctx) throws Exception {
        loginCookie().compose(cookie -> client.patch(port, "localhost", ApiRouter.API + "/users/me")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject().put("displayName", "新名字")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertEquals("新名字", resp.bodyAsJsonObject().getString("displayName"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void changePasswordReturns204ForEmailUser(VertxTestContext ctx) throws Exception {
        loginCookie().compose(cookie -> client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject()
                                .put("oldPassword", "init-pass")
                                .put("newPassword", "new-pass-1")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(204, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    private io.vertx.core.Future<String> loginCookie() {
        return client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .map(resp -> resp.getHeader("Set-Cookie"));
    }
}
