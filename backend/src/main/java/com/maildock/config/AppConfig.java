package com.maildock.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;

/**
 * 应用启动配置，来源于环境变量映射。
 *
 * <p>必需项：{@code MAILDOCK_SECRET_KEY}（授权码 AES-GCM 加密密钥，必须 32 字节）。
 * 可选项缺省时使用默认值或 null：默认邮箱用户、linux.do OAuth、Session、HTTP 端口、
 * 数据库路径、附件目录。
 *
 * <p>本类不直接读取 {@code System.getenv}，而是接收一个映射，便于测试注入。
 *
 * @param secretKey             加密密钥（32 字节）
 * @param defaultEmail          预制邮箱登录用户，缺省时为 null
 * @param defaultPassword       预制邮箱登录密码，缺省时为 null
 * @param linuxdoClientId       linux.do OAuth client id
 * @param linuxdoClientSecret   linux.do OAuth client secret
 * @param linuxdoAuthUrl        linux.do OAuth 授权地址
 * @param linuxdoTokenUrl       linux.do OAuth token 地址
 * @param linuxdoUserinfoUrl    linux.do OAuth 用户信息地址
 * @param linuxdoScope          linux.do OAuth scope
 * @param linuxdoUserIdField    用户信息中的用户 id 字段名
 * @param linuxdoEmailField     用户信息中的邮箱字段名
 * @param linuxdoNameField      用户信息中的显示名字段名
 * @param linuxdoAvatarField    用户信息中的头像字段名
 * @param publicBaseUrl         外部访问基础 URL，用于 OAuth callback
 * @param sessionCookieSecure   是否给 session cookie 添加 Secure
 * @param sessionTtlHours       session 有效小时数
 * @param httpProxyHost         OAuth 出站请求的 HTTP 代理主机，缺省时为 null（直连）
 * @param httpProxyPort         OAuth 出站请求的 HTTP 代理端口，缺省时为 0
 * @param httpPort              HTTP 监听端口
 * @param dbPath                SQLite 数据库文件路径
 * @param attachmentsDir        附件落盘根目录
 * @param corsOrigins           CORS 允许的来源（逗号分隔），默认 http://localhost:5173
 */
public record AppConfig(
        String secretKey,
        String defaultEmail,
        String defaultPassword,
        String linuxdoClientId,
        String linuxdoClientSecret,
        String linuxdoAuthUrl,
        String linuxdoTokenUrl,
        String linuxdoUserinfoUrl,
        String linuxdoScope,
        String linuxdoUserIdField,
        String linuxdoEmailField,
        String linuxdoNameField,
        String linuxdoAvatarField,
        String publicBaseUrl,
        String frontendUrl,
        boolean sessionCookieSecure,
        int sessionTtlHours,
        String httpProxyHost,
        int httpProxyPort,
        int httpPort,
        String dbPath,
        String attachmentsDir,
        String corsOrigins) {

    private static final int KEY_LENGTH_BYTES = 32;
    private static final int DEFAULT_PORT = 8080;
    private static final int DEFAULT_SESSION_TTL_HOURS = 24;
    private static final String DEFAULT_DB_PATH = "data/maildock.db";
    private static final String DEFAULT_ATTACHMENTS_DIR = "data/attachments";

    /**
     * 从环境变量映射构建配置。若环境变量缺失密钥，则尝试从 maildock.properties 读取。
     *
     * @throws IllegalStateException 密钥缺失或长度非 32 字节
     */
    public static AppConfig from(Map<String, String> env) {
        // Always load properties file first, then overlay env vars (env takes priority)
        Map<String, String> config = loadPropertiesFile("maildock.properties", env);

        String secretKey = config.get("MAILDOCK_SECRET_KEY");
        if (secretKey == null || secretKey.isBlank()) {
            throw new IllegalStateException("缺少必需的环境变量 MAILDOCK_SECRET_KEY");
        }
        if (secretKey.getBytes(java.nio.charset.StandardCharsets.UTF_8).length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException(
                    "MAILDOCK_SECRET_KEY 必须为 " + KEY_LENGTH_BYTES + " 字节（AES-256）");
        }

        String defaultEmail = nullableStrip(config.get("MAILDOCK_DEFAULT_EMAIL"));
        String defaultPassword = nullableStrip(config.get("MAILDOCK_DEFAULT_PASSWORD"));
        String linuxdoClientId = nullableStrip(config.get("MAILDOCK_LINUXDO_CLIENT_ID"));
        String linuxdoClientSecret = nullableStrip(config.get("MAILDOCK_LINUXDO_CLIENT_SECRET"));
        String linuxdoAuthUrl = nullableStrip(config.get("MAILDOCK_LINUXDO_AUTH_URL"));
        String linuxdoTokenUrl = nullableStrip(config.get("MAILDOCK_LINUXDO_TOKEN_URL"));
        String linuxdoUserinfoUrl = nullableStrip(config.get("MAILDOCK_LINUXDO_USERINFO_URL"));
        String linuxdoScope = nullableStrip(config.get("MAILDOCK_LINUXDO_SCOPE"));
        String linuxdoUserIdField = nullableStrip(config.get("MAILDOCK_LINUXDO_USER_ID_FIELD"));
        String linuxdoEmailField = nullableStrip(config.get("MAILDOCK_LINUXDO_EMAIL_FIELD"));
        String linuxdoNameField = nullableStrip(config.get("MAILDOCK_LINUXDO_NAME_FIELD"));
        String linuxdoAvatarField = nullableStrip(config.get("MAILDOCK_LINUXDO_AVATAR_FIELD"));
        String publicBaseUrl = nullableStrip(config.get("MAILDOCK_PUBLIC_BASE_URL"));
        String frontendUrl = orDefault(config.get("MAILDOCK_FRONTEND_URL"), "/");
        String httpProxyHost = nullableStrip(config.get("MAILDOCK_HTTP_PROXY_HOST"));
        int httpProxyPort = parsePositiveInt(config.get("MAILDOCK_HTTP_PROXY_PORT"), 0);
        boolean sessionCookieSecure = "true".equalsIgnoreCase(nullableStrip(config.get("MAILDOCK_SESSION_COOKIE_SECURE")));
        int sessionTtlHours = parsePositiveInt(config.get("MAILDOCK_SESSION_TTL_HOURS"), DEFAULT_SESSION_TTL_HOURS);
        int httpPort = parsePort(config.get("MAILDOCK_HTTP_PORT"));
        String dbPath = orDefault(config.get("MAILDOCK_DB_PATH"), DEFAULT_DB_PATH);
        String attachmentsDir = orDefault(config.get("MAILDOCK_ATTACHMENTS_DIR"), DEFAULT_ATTACHMENTS_DIR);
        String corsOrigins = orDefault(config.get("MAILDOCK_CORS_ORIGINS"), "http://localhost:5173");

        return new AppConfig(
                secretKey,
                defaultEmail,
                defaultPassword,
                linuxdoClientId,
                linuxdoClientSecret,
                linuxdoAuthUrl,
                linuxdoTokenUrl,
                linuxdoUserinfoUrl,
                linuxdoScope,
                linuxdoUserIdField,
                linuxdoEmailField,
                linuxdoNameField,
                linuxdoAvatarField,
                publicBaseUrl,
                frontendUrl,
                sessionCookieSecure,
                sessionTtlHours,
                httpProxyHost,
                httpProxyPort,
                httpPort,
                dbPath,
                attachmentsDir,
                corsOrigins);
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

    private static String nullableStrip(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
    }

    private static int parsePositiveInt(String raw, int fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.strip());
            return value >= 1 ? value : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
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
            try (var reader = Files.newBufferedReader(path)) {
                props.load(reader);
            }
            Map<String, String> merged = new java.util.HashMap<>(env);
            props.forEach((k, v) -> merged.putIfAbsent(k.toString(), v.toString()));
            return merged;
        } catch (IOException e) {
            throw new RuntimeException("读取配置文件失败: " + filename, e);
        }
    }
}
