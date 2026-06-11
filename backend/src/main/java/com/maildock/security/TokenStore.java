package com.maildock.security;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存会话 Token 存储。
 *
 * <p>登录成功后签发随机 Token，并记录其归属主体与过期时间。
 * 数据仅保存在内存中，服务重启后全部失效（符合不接入 Redis 的约束，
 * 单租户管理员场景下重新登录成本极低）。
 */
public class TokenStore {

    /** 安全随机源，用于生成不可预测的 Token。 */
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Token -> 会话条目（主体 + 过期时间）。 */
    private final ConcurrentHashMap<String, Entry> tokens = new ConcurrentHashMap<>();

    /**
     * 签发一个新的 Token。
     *
     * @param subject 归属主体（如管理员用户名）
     * @param ttl     有效时长
     * @return 新生成的随机 Token
     */
    public String issue(String subject, Duration ttl) {
        String token = generateToken();
        Instant expiresAt = Instant.now().plus(ttl);
        tokens.put(token, new Entry(subject, expiresAt));
        return token;
    }

    /**
     * 校验 Token 是否有效（存在且未过期）。
     * 过期的 Token 会被顺带清除。
     */
    public boolean isValid(String token) {
        Entry entry = tokens.get(token);
        if (entry == null) {
            return false;
        }
        if (entry.isExpired()) {
            tokens.remove(token);
            return false;
        }
        return true;
    }

    /**
     * 返回 Token 归属的主体；无效或过期时返回 null。
     */
    public String subject(String token) {
        if (!isValid(token)) {
            return null;
        }
        Entry entry = tokens.get(token);
        return entry == null ? null : entry.subject;
    }

    /**
     * 主动注销一个 Token（用于登出）。
     */
    public void revoke(String token) {
        tokens.remove(token);
    }

    /** 生成 32 字节随机数并以 URL 安全的 Base64 编码。 */
    private String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 单个会话条目：归属主体与过期时间。 */
    private static final class Entry {
        final String subject;
        final Instant expiresAt;

        Entry(String subject, Instant expiresAt) {
            this.subject = subject;
            this.expiresAt = expiresAt;
        }

        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
