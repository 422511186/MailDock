package com.maildock.security;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存 Cookie Session 存储。
 *
 * <p>登录成功后签发随机 session token，并记录其归属用户与过期时间。
 * 数据仅保存在内存中，服务重启后全部失效。
 */
public final class SessionStore {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ConcurrentHashMap<String, Entry> sessions = new ConcurrentHashMap<>();

    public String issue(long userId, Duration ttl) {
        String token = generateToken();
        sessions.put(token, new Entry(userId, Instant.now().plus(ttl)));
        return token;
    }

    public Optional<Long> userId(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        Entry entry = sessions.get(token);
        if (entry == null) {
            return Optional.empty();
        }
        if (entry.isExpired()) {
            sessions.remove(token);
            return Optional.empty();
        }
        return Optional.of(entry.userId);
    }

    public boolean isValid(String token) {
        return userId(token).isPresent();
    }

    public void revoke(String token) {
        if (token != null) {
            sessions.remove(token);
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private record Entry(long userId, Instant expiresAt) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
