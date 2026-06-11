package com.maildock.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Properties;

/**
 * 应用启动配置，来源于环境变量映射。
 *
 * <p>必需项：{@code MAILDOCK_SECRET_KEY}（授权码 AES-GCM 加密密钥，必须 32 字节）。
 * 可选项缺省时使用默认值：管理员用户名、HTTP 端口、数据库路径、附件目录。
 * 若未显式提供管理员密码，则自动生成一个随机密码并标记 {@link #passwordGenerated()}，
 * 由启动流程负责将其打印到日志，供首次登录使用。
 *
 * <p>本类不直接读取 {@code System.getenv}，而是接收一个映射，便于测试注入。
 *
 * @param secretKey         加密密钥（32 字节）
 * @param adminUser         管理员用户名
 * @param adminPassword     管理员密码（显式提供或自动生成）
 * @param passwordGenerated 密码是否为自动生成（用于启动时决定是否打印）
 * @param httpPort          HTTP 监听端口
 * @param dbPath            SQLite 数据库文件路径
 * @param attachmentsDir    附件落盘根目录
 */
public record AppConfig(
        String secretKey,
        String adminUser,
        String adminPassword,
        boolean passwordGenerated,
        int httpPort,
        String dbPath,
        String attachmentsDir) {

    private static final int KEY_LENGTH_BYTES = 32;
    private static final int DEFAULT_PORT = 8080;
    private static final String DEFAULT_ADMIN_USER = "admin";
    private static final String DEFAULT_DB_PATH = "data/maildock.db";
    private static final String DEFAULT_ATTACHMENTS_DIR = "data/attachments";

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 从环境变量映射构建配置。若环境变量缺失密钥，则尝试从 maildock.properties 读取。
     *
     * @throws IllegalStateException 密钥缺失或长度非 32 字节
     */
    public static AppConfig from(Map<String, String> env) {
        // 优先环境变量，缺失时尝试从 maildock.properties 读取
        Map<String, String> config = env;
        if (env.get("MAILDOCK_SECRET_KEY") == null || env.get("MAILDOCK_SECRET_KEY").isBlank()) {
            config = loadPropertiesFile("maildock.properties", env);
        }

        String secretKey = config.get("MAILDOCK_SECRET_KEY");
        if (secretKey == null || secretKey.isBlank()) {
            throw new IllegalStateException("缺少必需的环境变量 MAILDOCK_SECRET_KEY");
        }
        if (secretKey.getBytes(java.nio.charset.StandardCharsets.UTF_8).length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException(
                    "MAILDOCK_SECRET_KEY 必须为 " + KEY_LENGTH_BYTES + " 字节（AES-256）");
        }

        String adminUser = orDefault(config.get("MAILDOCK_ADMIN_USER"), DEFAULT_ADMIN_USER);

        String providedPass = config.get("MAILDOCK_ADMIN_PASS");
        boolean generated = (providedPass == null || providedPass.isBlank());
        String adminPassword = generated ? randomPassword() : providedPass;

        int httpPort = parsePort(config.get("MAILDOCK_HTTP_PORT"));
        String dbPath = orDefault(config.get("MAILDOCK_DB_PATH"), DEFAULT_DB_PATH);
        String attachmentsDir = orDefault(config.get("MAILDOCK_ATTACHMENTS_DIR"), DEFAULT_ATTACHMENTS_DIR);

        return new AppConfig(secretKey, adminUser, adminPassword, generated, httpPort, dbPath, attachmentsDir);
    }

    /** 生成 URL-safe 的随机密码（约 18 字符，足够强度且便于复制）。 */
    private static String randomPassword() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 解析端口，非法或缺省时回退到默认端口，避免启动崩溃。 */
    private static int parsePort(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_PORT;
        }
        try {
            return Integer.parseInt(raw.strip());
        } catch (NumberFormatException e) {
            return DEFAULT_PORT;
        }
    }

    private static String orDefault(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value;
    }

    /**
     * 从配置文件加载属性，合并环境变量（环境变量优先级更高）。
     * 配置文件不存在时返回原环境变量映射。
     */
    private static Map<String, String> loadPropertiesFile(String filename, Map<String, String> env) {
        Path path = Path.of(filename);
        if (!Files.exists(path)) {
            return env;
        }
        try {
            Properties props = new Properties();
            props.load(Files.newBufferedReader(path));
            Map<String, String> merged = new java.util.HashMap<>(env);
            props.forEach((k, v) -> merged.putIfAbsent(k.toString(), v.toString()));
            return merged;
        } catch (IOException e) {
            throw new RuntimeException("读取配置文件失败: " + filename, e);
        }
    }
}
