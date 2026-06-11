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

        assertEquals("admin", config.adminUser());
        assertEquals(8080, config.httpPort());
        assertTrue(config.dbPath().endsWith("maildock.db"), "默认数据库路径应指向 maildock.db");
        assertTrue(config.attachmentsDir().endsWith("attachments"), "默认附件目录应为 attachments");
        assertNotNull(config.adminPassword());
        assertFalse(config.adminPassword().isBlank(), "默认管理员密码不应为空");
    }

    @Test
    void generatesRandomPasswordWhenAbsent() {
        // 未提供管理员密码时，自动生成一个随机密码并标记为已生成
        AppConfig config = AppConfig.from(baseEnv());

        assertTrue(config.passwordGenerated(), "缺省密码应标记为自动生成");
        assertTrue(config.adminPassword().length() >= 12, "随机密码应有足够长度");
    }

    @Test
    void randomPasswordDiffersBetweenRuns() {
        // 每次生成的随机密码应不同
        String p1 = AppConfig.from(baseEnv()).adminPassword();
        String p2 = AppConfig.from(baseEnv()).adminPassword();

        assertNotEquals(p1, p2, "两次自动生成的密码应不同");
    }

    @Test
    void providedPasswordIsNotMarkedGenerated() {
        // 显式提供密码时不标记为自动生成
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_ADMIN_PASS", "s3cret");

        AppConfig config = AppConfig.from(env);

        assertFalse(config.passwordGenerated(), "显式密码不应标记为自动生成");
        assertEquals("s3cret", config.adminPassword());
    }

    @Test
    void overridesOptionalValuesFromEnv() {
        // 环境变量覆盖可选配置
        Map<String, String> env = baseEnv();
        env.put("MAILDOCK_ADMIN_USER", "root");
        env.put("MAILDOCK_ADMIN_PASS", "s3cret");
        env.put("MAILDOCK_HTTP_PORT", "9090");
        env.put("MAILDOCK_DB_PATH", "/tmp/custom.db");
        env.put("MAILDOCK_ATTACHMENTS_DIR", "/tmp/att");

        AppConfig config = AppConfig.from(env);

        assertEquals("root", config.adminUser());
        assertEquals("s3cret", config.adminPassword());
        assertEquals(9090, config.httpPort());
        assertEquals("/tmp/custom.db", config.dbPath());
        assertEquals("/tmp/att", config.attachmentsDir());
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
