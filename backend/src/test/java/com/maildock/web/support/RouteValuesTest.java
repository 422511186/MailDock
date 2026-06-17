package com.maildock.web.support;

import io.vertx.ext.web.RoutingContext;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RouteValuesTest {

    @Test
    void currentUserIdReadsAuthenticatedUserScope() {
        RoutingContext ctx = context(Map.of("currentUserId", 42L), Map.of());

        assertEquals(42L, RouteValues.currentUserId(ctx));
    }

    @Test
    void currentUserIdFailsWhenAuthMiddlewareDidNotPopulateScope() {
        RoutingContext ctx = context(Map.of(), Map.of());

        assertThrows(IllegalStateException.class, () -> RouteValues.currentUserId(ctx));
    }

    @Test
    void pathLongParsesNamedPathParameter() {
        RoutingContext ctx = context(Map.of(), Map.of("id", "123"));

        assertEquals(123L, RouteValues.pathLong(ctx, "id"));
    }

    @Test
    void parseIntOrUsesDefaultForMissingBlankOrInvalidValues() {
        assertEquals(20, RouteValues.parseIntOr(null, 20));
        assertEquals(20, RouteValues.parseIntOr(" ", 20));
        assertEquals(20, RouteValues.parseIntOr("bad", 20));
        assertEquals(5, RouteValues.parseIntOr("5", 20));
    }

    private RoutingContext context(Map<String, Object> values, Map<String, String> pathParams) {
        return (RoutingContext) Proxy.newProxyInstance(
                RoutingContext.class.getClassLoader(),
                new Class<?>[]{RoutingContext.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "get" -> values.get((String) args[0]);
                    case "pathParam" -> pathParams.get((String) args[0]);
                    default -> throw new UnsupportedOperationException(method.getName());
                });
    }
}
