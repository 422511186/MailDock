package com.maildock.web.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionCookiesTest {

    @Test
    void headerValueUsesHttpOnlyLaxCookieAndOptionalSecureFlag() {
        String plain = SessionCookies.headerValue("token-1", 3600, false);

        assertTrue(plain.startsWith("maildock_session=token-1; Path=/; Max-Age=3600"));
        assertTrue(plain.contains("HttpOnly"));
        assertTrue(plain.contains("SameSite=Lax"));
        assertFalse(plain.contains("Secure"));

        String secure = SessionCookies.headerValue("token-1", 3600, true);
        assertTrue(secure.contains("Secure"));
    }
}
