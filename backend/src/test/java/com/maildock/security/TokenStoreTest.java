package com.maildock.security;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class TokenStoreTest {

    @Test
    void issuedTokenIsValid() {
        TokenStore store = new TokenStore();

        String token = store.issue("admin", Duration.ofMinutes(30));

        assertNotNull(token);
        assertFalse(token.isBlank());
        assertTrue(store.isValid(token), "freshly issued token must be valid");
        assertEquals("admin", store.subject(token));
    }

    @Test
    void unknownTokenIsInvalid() {
        TokenStore store = new TokenStore();

        assertFalse(store.isValid("does-not-exist"));
        assertNull(store.subject("does-not-exist"));
    }

    @Test
    void expiredTokenIsInvalid() {
        TokenStore store = new TokenStore();

        String token = store.issue("admin", Duration.ofMillis(-1)); // already expired

        assertFalse(store.isValid(token), "expired token must be rejected");
        assertNull(store.subject(token));
    }

    @Test
    void revokedTokenIsInvalid() {
        TokenStore store = new TokenStore();

        String token = store.issue("admin", Duration.ofMinutes(30));
        store.revoke(token);

        assertFalse(store.isValid(token), "revoked token must be rejected");
    }

    @Test
    void eachIssuedTokenIsUnique() {
        TokenStore store = new TokenStore();

        String t1 = store.issue("admin", Duration.ofMinutes(30));
        String t2 = store.issue("admin", Duration.ofMinutes(30));

        assertNotEquals(t1, t2, "tokens must be unique per issue");
    }
}
