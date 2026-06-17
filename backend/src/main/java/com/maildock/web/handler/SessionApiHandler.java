package com.maildock.web.handler;

import com.maildock.model.User;
import com.maildock.service.AuthService;
import com.maildock.web.support.SessionCookies;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

import static com.maildock.web.support.JsonResponses.fail;
import static com.maildock.web.support.JsonResponses.json;
import static com.maildock.web.support.UserJson.of;

public final class SessionApiHandler {

    private final Vertx vertx;
    private final AuthService authService;
    private final boolean sessionCookieSecure;

    public SessionApiHandler(Vertx vertx, AuthService authService, boolean sessionCookieSecure) {
        this.vertx = vertx;
        this.authService = authService;
        this.sessionCookieSecure = sessionCookieSecure;
    }

    public void registerRoutes(Router router, String apiPrefix) {
        router.route(apiPrefix + "/*").handler(this::authMiddleware);
        router.post(apiPrefix + "/auth/logout").handler(this::handleLogout);
        router.get(apiPrefix + "/auth/me").handler(this::handleMe);
    }

    private void handleMe(RoutingContext ctx) {
        User user = ctx.get("currentUser");
        if (user == null) {
            fail(ctx, 401, "未认证或 Session 无效");
            return;
        }
        vertx.executeBlocking(() -> authService.hasPassword(user.id()), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 200, of(user, ar.result()));
                });
    }

    private void handleLogout(RoutingContext ctx) {
        String token = SessionCookies.read(ctx);
        if (token != null) {
            authService.logout(token);
        }
        clearSessionCookie(ctx);
        ctx.response().setStatusCode(204).end();
    }

    private void authMiddleware(RoutingContext ctx) {
        String path = ctx.request().path();
        if (path.endsWith("/auth/login")
                || path.endsWith("/auth/linuxdo/start")
                || path.endsWith("/auth/linuxdo/callback")) {
            ctx.next();
            return;
        }
        String token = SessionCookies.read(ctx);
        vertx.executeBlocking(() -> authService.currentUser(token), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    var user = ar.result();
                    if (user.isEmpty()) {
                        fail(ctx, 401, "未认证或 Session 无效");
                        return;
                    }
                    ctx.put("currentUserId", user.get().id());
                    ctx.put("currentUser", user.get());
                    ctx.next();
                });
    }

    private void clearSessionCookie(RoutingContext ctx) {
        ctx.response().putHeader("Set-Cookie", SessionCookies.headerValue("", 0, sessionCookieSecure));
    }

}
