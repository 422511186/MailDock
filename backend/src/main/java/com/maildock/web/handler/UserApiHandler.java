package com.maildock.web.handler;

import com.maildock.model.User;
import com.maildock.service.AuthService;
import com.maildock.web.support.RequestBodies;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

import static com.maildock.web.support.JsonResponses.fail;
import static com.maildock.web.support.JsonResponses.json;
import static com.maildock.web.support.RouteValues.currentUserId;
import static com.maildock.web.support.UserJson.of;

public final class UserApiHandler {

    private final Vertx vertx;
    private final AuthService authService;

    public UserApiHandler(Vertx vertx, AuthService authService) {
        this.vertx = vertx;
        this.authService = authService;
    }

    public void registerRoutes(Router router, String apiPrefix) {
        router.patch(apiPrefix + "/users/me").handler(this::handleUpdateProfile);
        router.post(apiPrefix + "/users/me/password").handler(this::handleChangePassword);
    }

    private void handleUpdateProfile(RoutingContext ctx) {
        long userId = currentUserId(ctx);
        JsonObject body = RequestBodies.jsonObject(ctx);
        String displayName = body.getString("displayName");
        if (displayName == null || displayName.isBlank()) {
            fail(ctx, 400, "显示名不能为空");
            return;
        }
        String trimmed = displayName.strip();
        if (trimmed.length() > 64) {
            fail(ctx, 400, "显示名过长");
            return;
        }
        vertx.executeBlocking(() -> {
            User updated = authService.updateDisplayName(userId, trimmed).orElseThrow();
            boolean hasPassword = authService.hasPassword(userId);
            return of(updated, hasPassword);
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                ctx.fail(ar.cause());
                return;
            }
            json(ctx, 200, ar.result());
        });
    }

    private void handleChangePassword(RoutingContext ctx) {
        long userId = currentUserId(ctx);
        JsonObject body = RequestBodies.jsonObject(ctx);
        String oldPassword = body.getString("oldPassword");
        String newPassword = body.getString("newPassword");
        if (oldPassword == null || oldPassword.isBlank() || newPassword == null || newPassword.isBlank()) {
            fail(ctx, 400, "原密码和新密码不能为空");
            return;
        }
        if (newPassword.length() < 6) {
            fail(ctx, 400, "新密码至少 6 位");
            return;
        }
        vertx.executeBlocking(() -> authService.changePassword(userId, oldPassword, newPassword), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    switch (ar.result()) {
                        case OK -> ctx.response().setStatusCode(204).end();
                        case WRONG_OLD_PASSWORD -> fail(ctx, 400, "原密码错误");
                        case NO_PASSWORD_IDENTITY -> fail(ctx, 403, "当前账号未设置密码，无法修改");
                    }
                });
    }

}
