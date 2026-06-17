package com.maildock.web.support;

import com.maildock.model.User;
import io.vertx.core.json.JsonObject;

/**
 * 用户响应 JSON 投影。所有认证/个人中心接口复用同一字段集合，避免前端契约漂移。
 */
public final class UserJson {

    private UserJson() {
    }

    public static JsonObject of(User user, boolean hasPassword) {
        return new JsonObject()
                .put("id", user.id())
                .put("primaryEmail", user.primaryEmail())
                .put("displayName", user.displayName())
                .put("avatarUrl", user.avatarUrl())
                .put("lastLoginAt", user.lastLoginAt())
                .put("hasPassword", hasPassword);
    }
}
