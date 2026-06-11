package com.maildock.config;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AppConfigTest {

    private static final String VALID_KEY = "0123456789abcdef0123456789abcdef"; // 32 字节

    /** 构造一个含合法密钥的环境变量映射，便于各用例复用。 */
    private Map<String, String> baseEnv() {
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", VALID_KEY);
        return env;
    }

    @Test
    void readsSecretKeyFromEnv() {
        // 从环境变量读取加密密钥
        AppConfig config = AppConfig.from(baseEnv());
        assertEquals(VALID_KEY, config.secretKey());
    }

    @Test
    void missingSecretKeyThrows() {
        // 缺少密钥时启动应失败
        assertThrows(IllegalStateException.class, () -> AppConfig.from(new HashMap<>()));
    }

    @Test
    void secretKeyWithWrongLengthThrows() {
        // 密钥长度不是 32 字节时启动应失败
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", "too-short");
        assertThrows(IllegalStateException.class, () -> AppConfig.from(env));
    }

    @Test
    void usesDefaultsWhenOptionalValuesAbsent() {
        // 可选配置缺省时使用默认值
        AppConfig config = AppConfig.from(baseEnv());

        assertEquals(8080, config.httpPort());
        assertTrue(config.dbPath().endsWith("maildock.db"), "默认数据库路径应指向 maildock.db");
        assertTrue(config.attachmentsDir().endsWith("attachments"), "默认附件目录应为 attachments");
        assertNull(config.defaultEmail());
        assertNull(config.defaultPassword());
        assertFalse(config.sessionCookieSecure());
        assertEquals(24, config.sessionTtlHours());
    }

    @Test
    void parsesDefaultUserOauthAndSessionConfig() {
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_DEFAULT_EMAIL", "Admin@Example.COM ");
        env.put("MAILDOCK_DEFAULT_PASSWORD", "secret");
        env.put("MAILDOCK_LINUXDO_CLIENT_ID", "cid");
        env.put("MAILDOCK_LINUXDO_CLIENT_SECRET", "csecret");
        env.put("MAILDOCK_LINUXDO_AUTH_URL", "https://connect.linux.do/oauth2/authorize");
        env.put("MAILDOCK_LINUXDO_TOKEN_URL", "https://connect.linux.do/oauth2/token");
        env.put("MAILDOCK_LINUXDO_USERINFO_URL", "https://connect.linux.do/api/user");
        env.put("MAILDOCK_LINUXDO_SCOPE", "read");
        env.put("MAILDOCK_LINUXDO_USER_ID_FIELD", "id");
        env.put("MAILDOCK_LINUXDO_EMAIL_FIELD", "email");
        env.put("MAILDOCK_LINUXDO_NAME_FIELD", "username");
        env.put("MAILDOCK_LINUXDO_AVATAR_FIELD", "avatar_url");
        env.put("MAILDOCK_PUBLIC_BASE_URL", "https://maildock.example");
        env.put("MAILDOCK_SESSION_COOKIE_SECURE", "true");
        env.put("MAILDOCK_SESSION_TTL_HOURS", "12");

        AppConfig config = AppConfig.from(env);

        assertEquals("Admin@Example.COM", config.defaultEmail());
        assertEquals("secret", config.defaultPassword());
        assertEquals("cid", config.linuxdoClientId());
        assertEquals("csecret", config.linuxdoClientSecret());
        assertEquals("https://connect.linux.do/oauth2/authorize", config.linuxdoAuthUrl());
        assertEquals("https://connect.linux.do/oauth2/token", config.linuxdoTokenUrl());
        assertEquals("https://connect.linux.do/api/user", config.linuxdoUserinfoUrl());
        assertEquals("read", config.linuxdoScope());
        assertEquals("id", config.linuxdoUserIdField());
        assertEquals("email", config.linuxdoEmailField());
        assertEquals("username", config.linuxdoNameField());
        assertEquals("avatar_url", config.linuxdoAvatarField());
        assertEquals("https://maildock.example", config.publicBaseUrl());
        assertTrue(config.sessionCookieSecure());
        assertEquals(12, config.sessionTtlHours());
    }

    @Test
    void missingDefaultUserDoesNotGeneratePassword() {
        AppConfig config = AppConfig.from(baseEnv());

        assertNull(config.defaultEmail());
        assertNull(config.defaultPassword());
    }

    @Test
    void blankDefaultUserDoesNotGeneratePassword() {
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_DEFAULT_EMAIL", " ");
        env.put("MAILDOCK_DEFAULT_PASSWORD", " ");

        AppConfig config = AppConfig.from(env);

        assertNull(config.defaultEmail());
        assertNull(config.defaultPassword());
    }

    @Test
    void overridesOptionalValuesFromEnv() {
        // 环境变量覆盖可选配置
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_DEFAULT_EMAIL", "root@example.com");
        env.put("MAILDOCK_DEFAULT_PASSWORD", "s3cret");
        env.put("MAILDOCK_HTTP_PORT", "9090");
        env.put("MAILDOCK_DB_PATH", "/tmp/custom.db");
        env.put("MAILDOCK_ATTACHMENTS_DIR", "/tmp/att");

        AppConfig config = AppConfig.from(env);

        assertEquals("root@example.com", config.defaultEmail());
        assertEquals("s3cret", config.defaultPassword());
        assertEquals(9090, config.httpPort());
        assertEquals("/tmp/custom.db", config.dbPath());
        assertEquals("/tmp/att", config.attachmentsDir());
    }

    @Test
    void invalidSessionTtlFallsBackToDefault() {
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_SESSION_TTL_HOURS", "0");

        AppConfig config = AppConfig.from(env);

        assertEquals(24, config.sessionTtlHours());
    }

    @Test
    void invalidPortFallsBackToDefault() {
        // 端口非法时回退到默认值，不致启动崩溃
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_HTTP_PORT", "not-a-number");

        AppConfig config = AppConfig.from(env);

        assertEquals(8080, config.httpPort());
    }
}
