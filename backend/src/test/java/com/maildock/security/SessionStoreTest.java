package com.maildock.security;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class SessionStoreTest {

    @Test
    void issueAndResolveSession() {
        SessionStore store = new SessionStore();

        String token = store.issue(7L, Duration.ofHours(1));

        assertNotNull(token);
        assertFalse(token.isBlank());
        assertEquals(7L, store.userId(token).orElseThrow());
        assertTrue(store.isValid(token));
    }

    @Test
    void expiredSessionIsRemoved() {
        SessionStore store = new SessionStore();
        String token = store.issue(7L, Duration.ofMillis(-1));

        assertTrue(store.userId(token).isEmpty());
        assertFalse(store.isValid(token));
    }

    @Test
    void revokeRemovesSession() {
        SessionStore store = new SessionStore();
        String token = store.issue(7L, Duration.ofHours(1));

        store.revoke(token);

        assertTrue(store.userId(token).isEmpty());
        assertFalse(store.isValid(token));
    }
}
