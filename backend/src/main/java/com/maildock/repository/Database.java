package com.maildock.repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/**
 * SQLite 数据库封装：持有单个连接、初始化表结构，并通过写锁将所有写操作串行化，
 * 避免 SQLite 并发写产生的 SQLITE_BUSY 锁冲突。
 *
 * <p>设计取舍：首期单租户、低并发，使用单连接 + 进程内写锁足够；读操作不加锁，
 * 依赖 SQLite 自身的读一致性。
 */
public final class Database {

    private final Connection connection;
    private final ReentrantLock writeLock = new ReentrantLock();

    public Database(String jdbcUrl) {
        try {
            // 连接前确保数据库文件的父目录存在（首次启动时 data/ 可能尚未创建）
            ensureParentDir(jdbcUrl);
            this.connection = DriverManager.getConnection(jdbcUrl);
            // 开启外键约束，保证级联与引用完整性
            try (Statement st = connection.createStatement()) {
                st.execute("PRAGMA foreign_keys = ON");
            }
        } catch (SQLException e) {
            throw new RuntimeException("打开 SQLite 连接失败: " + jdbcUrl, e);
        }
    }

    /** 返回底层连接，供 Repository 执行查询。 */
    public Connection connection() {
        return connection;
    }

    /**
     * 在写锁保护下执行写操作，确保同一时刻只有一个写事务，避免锁冲突。
     *
     * @param action 写操作，返回结果
     * @param <T>    结果类型
     */
    public <T> T runWrite(Supplier<T> action) {
        writeLock.lock();
        try {
            return action.get();
        } finally {
            writeLock.unlock();
        }
    }

    /** 初始化全部表结构与索引（幂等，使用 IF NOT EXISTS）。 */
    public void initSchema() {
        String[] ddl = {
                """
                CREATE TABLE IF NOT EXISTS app_user (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    primary_email TEXT,
                    display_name  TEXT,
                    avatar_url    TEXT,
                    created_at    INTEGER NOT NULL,
                    updated_at    INTEGER NOT NULL,
                    last_login_at INTEGER DEFAULT 0
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS user_identity (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id      INTEGER NOT NULL,
                    provider     TEXT NOT NULL,
                    provider_uid TEXT NOT NULL,
                    secret_hash  TEXT,
                    created_at   INTEGER NOT NULL,
                    updated_at   INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES app_user(id),
                    UNIQUE (provider, provider_uid)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS mail_account (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id          INTEGER NOT NULL,
                    email           TEXT NOT NULL,
                    auth_code_enc   TEXT NOT NULL,
                    imap_host       TEXT NOT NULL DEFAULT 'imap.163.com',
                    imap_port       INTEGER NOT NULL DEFAULT 993,
                    last_uid        INTEGER DEFAULT 0,
                    uid_validity    INTEGER DEFAULT 0,
                    last_sync_at    INTEGER,
                    last_test_at    INTEGER,
                    last_test_ok    INTEGER,
                    last_test_msg   TEXT,
                    created_at      INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES app_user(id),
                    UNIQUE (user_id, email)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS mail_message (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id   INTEGER NOT NULL,
                    uid          INTEGER NOT NULL,
                    message_id   TEXT,
                    subject      TEXT,
                    from_addr    TEXT,
                    to_addr      TEXT,
                    cc_addr      TEXT,
                    sent_at      INTEGER,
                    received_at  INTEGER,
                    body_text    TEXT,
                    body_html    TEXT,
                    has_attach   INTEGER DEFAULT 0,
                    is_read      INTEGER DEFAULT 0,
                    raw_size     INTEGER,
                    created_at   INTEGER NOT NULL,
                    FOREIGN KEY (account_id) REFERENCES mail_account(id),
                    UNIQUE (account_id, uid)
                )
                """,
                """
                CREATE TABLE IF NOT EXISTS mail_attachment (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id    INTEGER NOT NULL,
                    filename      TEXT,
                    content_type  TEXT,
                    size          INTEGER,
                    file_path     TEXT NOT NULL,
                    created_at    INTEGER NOT NULL,
                    FOREIGN KEY (message_id) REFERENCES mail_message(id)
                )
                """,
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS mail_message_fts USING fts5(
                    subject, from_addr, body_text,
                    content='mail_message', content_rowid='id',
                    tokenize='trigram'
                )
                """,
                """
                CREATE TRIGGER IF NOT EXISTS mail_message_ai AFTER INSERT ON mail_message BEGIN
                    INSERT INTO mail_message_fts(rowid, subject, from_addr, body_text)
                    VALUES (new.id, new.subject, new.from_addr, new.body_text);
                END
                """,
                """
                CREATE TRIGGER IF NOT EXISTS mail_message_ad AFTER DELETE ON mail_message BEGIN
                    INSERT INTO mail_message_fts(mail_message_fts, rowid, subject, from_addr, body_text)
                    VALUES ('delete', old.id, old.subject, old.from_addr, old.body_text);
                END
                """,
                """
                CREATE TRIGGER IF NOT EXISTS mail_message_au AFTER UPDATE ON mail_message BEGIN
                    INSERT INTO mail_message_fts(mail_message_fts, rowid, subject, from_addr, body_text)
                    VALUES ('delete', old.id, old.subject, old.from_addr, old.body_text);
                    INSERT INTO mail_message_fts(rowid, subject, from_addr, body_text)
                    VALUES (new.id, new.subject, new.from_addr, new.body_text);
                END
                """,
                "CREATE INDEX IF NOT EXISTS idx_identity_user ON user_identity(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_account_user ON mail_account(user_id, id)",
                "CREATE INDEX IF NOT EXISTS idx_msg_account_received ON mail_message(account_id, received_at DESC)",
                "CREATE INDEX IF NOT EXISTS idx_attach_message ON mail_attachment(message_id)"
        };
        try (Statement st = connection.createStatement()) {
            for (String sql : ddl) {
                st.execute(sql);
            }
        } catch (SQLException e) {
            throw new RuntimeException("初始化数据库表结构失败", e);
        }
    }

    /**
     * 启动时按需回填 FTS 索引：当邮件表已有数据但全文索引为空（例如从无 FTS 的旧版本升级而来）时，
     * 一次性重建 mail_message_fts。正常情况下两者计数一致，直接跳过，避免每次启动都重建。
     *
     * <p>注意 mail_message_fts 是外部内容（external-content）表，{@code count(*)} 会回落到内容表
     * mail_message，无法反映索引是否真的已建立；因此用 FTS5 影子表 mail_message_fts_docsize 的行数
     * 来表示“真正已索引的文档数”。
     */
    public void backfillFtsIfNeeded() {
        long mailCount = countRows("mail_message");
        long indexedCount = countRows("mail_message_fts_docsize");
        if (mailCount == indexedCount) {
            return;
        }
        runWrite(() -> {
            try (Statement st = connection.createStatement()) {
                st.execute("INSERT INTO mail_message_fts(mail_message_fts) VALUES('rebuild')");
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("回填 FTS 索引失败", e);
            }
        });
    }

    /** 统计指定表的行数。 */
    private long countRows(String table) {
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM " + table)) {
            rs.next();
            return rs.getLong(1);
        } catch (SQLException e) {
            throw new RuntimeException("统计行数失败: " + table, e);
        }
    }

    /** 关闭数据库连接。 */
    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("关闭数据库连接失败", e);
        }
    }

    /**
     * 从 jdbc:sqlite: URL 解析出数据库文件路径，并确保其父目录存在。
     *
     * <p>内存库（{@code :memory:}）与无父目录的相对路径无需创建，直接跳过。
     */
    private static void ensureParentDir(String jdbcUrl) {
        String prefix = "jdbc:sqlite:";
        if (jdbcUrl == null || !jdbcUrl.startsWith(prefix)) {
            return;
        }
        String filePart = jdbcUrl.substring(prefix.length());
        // 内存库无需建目录
        if (filePart.isBlank() || filePart.startsWith(":memory:") || filePart.contains("mode=memory")) {
            return;
        }
        Path parent = Path.of(filePart).getParent();
        if (parent == null) {
            return;
        }
        try {
            Files.createDirectories(parent);
        } catch (IOException e) {
            throw new RuntimeException("创建数据库目录失败: " + parent, e);
        }
    }
}
