package com.maildock.web.handler;

import com.maildock.service.AuthService;
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.web.support.RequestBodies;
import com.maildock.web.support.SessionCookies;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

import java.time.Duration;
import java.util.Optional;

import static com.maildock.web.support.JsonResponses.fail;
import static com.maildock.web.support.JsonResponses.json;
import static com.maildock.web.support.UserJson.of;

public final class AuthApiHandler {

    private final Vertx vertx;
    private final AuthService authService;
    private final LinuxDoOAuthService linuxDoOAuthService;
    private final boolean sessionCookieSecure;
    private final long sessionMaxAgeSeconds;

    public AuthApiHandler(Vertx vertx,
                          AuthService authService,
                          LinuxDoOAuthService linuxDoOAuthService,
                          boolean sessionCookieSecure,
                          Duration sessionTtl) {
        this.vertx = vertx;
        this.authService = authService;
        this.linuxDoOAuthService = linuxDoOAuthService;
        this.sessionCookieSecure = sessionCookieSecure;
        this.sessionMaxAgeSeconds = Math.max(1, sessionTtl.toSeconds());
    }

    public void registerPublicRoutes(Router router, String apiPrefix) {
        router.post(apiPrefix + "/auth/login").handler(this::handleLogin);
        router.get(apiPrefix + "/auth/linuxdo/start").handler(this::handleLinuxdoStart);
        router.get(apiPrefix + "/auth/linuxdo/callback").handler(this::handleLinuxdoCallback);
    }

    private void handleLogin(RoutingContext ctx) {
        JsonObject body = RequestBodies.jsonObject(ctx);
        String email = body.getString("email");
        if (email == null || email.isBlank()) {
            email = body.getString("username");
        }
        String password = body.getString("password");
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            fail(ctx, 400, "邮箱和密码不能为空");
            return;
        }
        String loginEmail = email;
        vertx.executeBlocking(() -> authService.loginWithEmailPassword(loginEmail, password), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    Optional<AuthService.LoginResult> login = ar.result();
                    if (login.isEmpty()) {
                        fail(ctx, 401, "邮箱或密码错误");
                        return;
                    }
                    setSessionCookie(ctx, login.get().sessionToken());
                    json(ctx, 200, of(login.get().user(), true));
                });
    }

    private void handleLinuxdoStart(RoutingContext ctx) {
        if (linuxDoOAuthService == null) {
            fail(ctx, 500, "linux.do OAuth 配置不完整");
            return;
        }
        LinuxDoOAuthService.StartResult start = linuxDoOAuthService.start();
        ctx.response().setStatusCode(302).putHeader("Location", start.redirectUrl()).end();
    }

    private void handleLinuxdoCallback(RoutingContext ctx) {
        if (linuxDoOAuthService == null) {
            fail(ctx, 500, "linux.do OAuth 配置不完整");
            return;
        }
        String code = ctx.request().getParam("code");
        String state = ctx.request().getParam("state");
        vertx.executeBlocking(() -> linuxDoOAuthService.callback(code, state), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    if (ar.result().isEmpty()) {
                        fail(ctx, 400, "linux.do OAuth 登录失败");
                        return;
                    }
                    setSessionCookie(ctx, ar.result().get().sessionToken());
                    ctx.response().setStatusCode(302).putHeader("Location", "/auth/callback").end();
                });
    }

    private void setSessionCookie(RoutingContext ctx, String token) {
        ctx.response().putHeader("Set-Cookie",
                SessionCookies.headerValue(token, sessionMaxAgeSeconds, sessionCookieSecure));
    }

}
