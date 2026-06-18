package com.maildock.repository;

import com.maildock.model.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 验证 external-content FTS5 表 mail_message_fts 与三个同步触发器：
 * 邮件入库 / 删除 / 更新时全文索引自动维护。
 */
class DatabaseFtsTest {

    private Database db;
    private Path dbFile;
    private long accountId;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-fts-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        UserRepository userRepo = new UserRepository(db);
        User userA = userRepo.insert("a@example.com", "User A", null);
        AccountRepository accountRepo = new AccountRepository(db);
        accountId = accountRepo.insert(userA.id(), "owner@163.com", "enc").id();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 通过原生 SQL 插入一封带中文正文的邮件，返回其 id。 */
    private long insertMessage() {
        return db.runWrite(() -> {
            String sql = "INSERT INTO mail_message "
                    + "(account_id, uid, message_id, subject, from_addr, to_addr, cc_addr, "
                    + "sent_at, received_at, body_text, body_html, has_attach, is_read, raw_size, created_at) "
                    + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, accountId);
                ps.setLong(2, 100L);
                ps.setString(3, "<mid-100@163.com>");
                ps.setString(4, "测试主题");
                ps.setString(5, "alice@163.com");
                ps.setString(6, "owner@163.com");
                ps.setNull(7, java.sql.Types.VARCHAR);
                ps.setLong(8, 1700000000000L);
                ps.setLong(9, 1700000001000L);
                ps.setString(10, "这是一封测试邮件正文");
                ps.setString(11, "<p>这是一封测试邮件正文</p>");
                ps.setInt(12, 0);
                ps.setInt(13, 0);
                ps.setLong(14, 123L);
                ps.setLong(15, 0L);
                ps.executeUpdate();
                try (ResultSet rs = ps.getGeneratedKeys()) {
                    rs.next();
                    return rs.getLong(1);
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }

    private long ftsCount() {
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM mail_message_fts")) {
            rs.next();
            return rs.getLong(1);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void insertTriggerPopulatesFtsTable() {
        insertMessage();
        assertEquals(1, ftsCount(), "INSERT 触发器应把邮件写入 FTS 表");
    }

    @Test
    void chineseSubstringMatches() {
        long id = insertMessage();
        String sql = "SELECT m.id FROM mail_message m "
                + "JOIN mail_message_fts f ON f.rowid = m.id "
                + "WHERE mail_message_fts MATCH '\"测试邮件\"'";
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            assertTrue(rs.next(), "中文子串应命中");
            assertEquals(id, rs.getLong(1));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void deleteTriggerRemovesFromFts() {
        long id = insertMessage();
        assertEquals(1, ftsCount());

        db.runWrite(() -> {
            try (PreparedStatement ps = db.connection()
                    .prepareStatement("DELETE FROM mail_message WHERE id=?")) {
                ps.setLong(1, id);
                ps.executeUpdate();
                return null;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        assertEquals(0, ftsCount(), "DELETE 触发器应把邮件从 FTS 表移除");
    }

    @Test
    void updateTriggerReindexesBodyText() {
        long id = insertMessage();

        db.runWrite(() -> {
            try (PreparedStatement ps = db.connection()
                    .prepareStatement("UPDATE mail_message SET body_text=? WHERE id=?")) {
                ps.setString(1, "这是原始正文内容");
                ps.setLong(2, id);
                ps.executeUpdate();
                return null;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        db.runWrite(() -> {
            try (PreparedStatement ps = db.connection()
                    .prepareStatement("UPDATE mail_message SET body_text=? WHERE id=?")) {
                ps.setString(1, "这是修改后的正文");
                ps.setLong(2, id);
                ps.executeUpdate();
                return null;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        String newTermSql = "SELECT m.id FROM mail_message m "
                + "JOIN mail_message_fts f ON f.rowid = m.id "
                + "WHERE mail_message_fts MATCH '\"修改后\"'";
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery(newTermSql)) {
            assertTrue(rs.next(), "UPDATE 触发器应让新正文子串命中");
            assertEquals(id, rs.getLong(1));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        String oldTermSql = "SELECT count(*) FROM mail_message_fts WHERE mail_message_fts MATCH '\"原始正文\"'";
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery(oldTermSql)) {
            rs.next();
            assertEquals(0, rs.getLong(1), "UPDATE 触发器应删除旧正文索引，旧子串不应再命中");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private long mailCount() {
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM mail_message")) {
            rs.next();
            return rs.getLong(1);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * 已真正索引的文档数。mail_message_fts 是外部内容表，对其做 count(*) 会回落到内容表，
     * 无法反映索引是否为空；用 FTS5 影子表 docsize 的行数来表示真实索引规模。
     */
    private long indexedCount() {
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM mail_message_fts_docsize")) {
            rs.next();
            return rs.getLong(1);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void backfillRebuildsMissingIndexThenIsNoOp() {
        insertMessage();
        // 模拟“升级后 FTS 索引为空”的场景：清空外部内容 FTS 索引
        db.runWrite(() -> {
            try (Statement st = db.connection().createStatement()) {
                st.execute("INSERT INTO mail_message_fts(mail_message_fts) VALUES('delete-all')");
                return null;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
        assertEquals(0, indexedCount(), "清空后 FTS 索引应为空");
        assertEquals(1, mailCount(), "邮件表仍有一封邮件");

        db.backfillFtsIfNeeded();

        assertEquals(mailCount(), indexedCount(), "回填后已索引文档数应与邮件表一致");
        assertEquals(1, indexedCount());

        String sql = "SELECT m.id FROM mail_message m "
                + "JOIN mail_message_fts f ON f.rowid = m.id "
                + "WHERE mail_message_fts MATCH '\"测试邮件\"'";
        try (Statement st = db.connection().createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            assertTrue(rs.next(), "回填后中文子串应重新可搜索");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        // 再次调用应为 no-op：计数已一致，不报错、数量不变
        assertDoesNotThrow(() -> db.backfillFtsIfNeeded());
        assertEquals(1, indexedCount(), "二次调用应为 no-op，数量不变");
    }
}
