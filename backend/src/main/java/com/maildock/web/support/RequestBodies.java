package com.maildock.web.support;

import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

/**
 * 请求体解析辅助：无 body 或非 JSON body 都按空对象处理，由业务校验返回 400。
 */
public final class RequestBodies {

    private RequestBodies() {
    }

    public static JsonObject jsonObject(RoutingContext ctx) {
        try {
            JsonObject body = ctx.body().asJsonObject();
            return body != null ? body : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }
}
