package com.maildock.web.support;

import io.vertx.ext.web.RoutingContext;

/**
 * MailDock Session Cookie 编解码规则。保持 Cookie 属性集中定义，避免登录和登出路径漂移。
 */
public final class SessionCookies {

    public static final String NAME = "maildock_session";

    private SessionCookies() {
    }

    public static String read(RoutingContext ctx) {
        String header = ctx.request().getHeader("Cookie");
        if (header == null || header.isBlank()) {
            return null;
        }
        for (String part : header.split(";")) {
            String cookie = part.strip();
            String prefix = NAME + "=";
            if (cookie.startsWith(prefix)) {
                String value = cookie.substring(prefix.length()).strip();
                return value.isEmpty() ? null : value;
            }
        }
        return null;
    }

    public static String headerValue(String token, long maxAgeSeconds, boolean secure) {
        StringBuilder cookie = new StringBuilder()
                .append(NAME).append("=").append(token == null ? "" : token)
                .append("; Path=/")
                .append("; Max-Age=").append(maxAgeSeconds)
                .append("; HttpOnly")
                .append("; SameSite=Lax");
        if (secure) {
            cookie.append("; Secure");
        }
        return cookie.toString();
    }
}
