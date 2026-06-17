package com.maildock.web.support;

import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

/**
 * JSON 响应辅助：统一 Content-Type 与错误响应结构，避免各 Handler 重复拼接字符串。
 */
public final class JsonResponses {

    private JsonResponses() {
    }

    public static void json(RoutingContext ctx, int status, JsonObject body) {
        ctx.response()
                .setStatusCode(status)
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(body.encode());
    }

    public static void fail(RoutingContext ctx, int status, String message) {
        json(ctx, status, new JsonObject().put("error", status).put("message", message));
    }

    public static void failFromThrowable(RoutingContext ctx, Throwable cause) {
        if (isNotFound(cause)) {
            fail(ctx, 404, cause.getMessage());
            return;
        }
        ctx.fail(cause);
    }

    private static boolean isNotFound(Throwable t) {
        String message = t != null ? t.getMessage() : null;
        return message != null && (message.contains("不存在") || message.contains("不属于"));
    }
}
