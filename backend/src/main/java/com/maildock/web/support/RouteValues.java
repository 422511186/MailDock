package com.maildock.web.support;

import io.vertx.ext.web.RoutingContext;

/**
 * 从 Vert.x RoutingContext 读取常用路由值，集中处理默认值和认证上下文缺失。
 */
public final class RouteValues {

    private RouteValues() {
    }

    public static long currentUserId(RoutingContext ctx) {
        Long userId = ctx.get("currentUserId");
        if (userId == null) {
            throw new IllegalStateException("当前用户不存在");
        }
        return userId;
    }

    public static long pathLong(RoutingContext ctx, String name) {
        return Long.parseLong(ctx.pathParam(name));
    }

    public static int parseIntOr(String value, int defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.strip());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
