package com.maildock.repository;

import com.maildock.model.Message;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * mail_message 表的数据访问对象，提供邮件的入库、查询、分页与标记已读。
 *
 * <p>所有写操作通过 {@link Database#runWrite} 串行化，读操作直接查询。
 * 列表查询按接收时间倒序返回，UNIQUE(account_id, uid) 约束防止重复入库。
 */
public final class MessageRepository {

    private final Database db;

    public MessageRepository(Database db) {
        this.db = db;
    }

    /**
     * 插入一封邮件，返回带自增主键的完整邮件。
     * 若 (account_id, uid) 已存在，唯一约束会导致抛出异常。
     */
    public Message insert(Message m) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = """
                    INSERT INTO mail_message
                        (account_id, uid, message_id, subject, from_addr, to_addr, cc_addr,
                         sent_at, received_at, body_text, body_html, has_attach, is_read, raw_size, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, m.accountId());
                ps.setLong(2, m.uid());
                ps.setString(3, m.messageId());
                ps.setString(4, m.subject());
                ps.setString(5, m.fromAddr());
                ps.setString(6, m.toAddr());
                ps.setString(7, m.ccAddr());
                ps.setLong(8, m.sentAt());
                ps.setLong(9, m.receivedAt());
                ps.setString(10, m.bodyText());
                ps.setString(11, m.bodyHtml());
                ps.setInt(12, m.hasAttach() ? 1 : 0);
                ps.setInt(13, m.isRead() ? 1 : 0);
                ps.setLong(14, m.rawSize());
                ps.setLong(15, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    return findById(keys.getLong(1)).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入邮件失败: account=" + m.accountId() + " uid=" + m.uid(), e);
            }
        });
    }

    /** 按主键查找邮件。 */
    public Optional<Message> findById(long id) {
        String sql = "SELECT * FROM mail_message WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询邮件失败: " + id, e);
        }
    }

    /** 返回某账号已存邮件的最大 UID，无邮件时返回 0（增量同步依据）。 */
    public long maxUid(long accountId) {
        String sql = "SELECT COALESCE(MAX(uid), 0) FROM mail_message WHERE account_id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询最大 UID 失败: account=" + accountId, e);
        }
    }

    /**
     * 分页列出某账号的邮件，按接收时间倒序（最新在前）。
     *
     * @param accountId 账号 id
     * @param page      页码，从 1 开始
     * @param size      每页数量
     */
    public List<Message> listByAccount(long accountId, int page, int size) {
        int offset = (page - 1) * size;
        String sql = "SELECT * FROM mail_message WHERE account_id = ? ORDER BY received_at DESC LIMIT ? OFFSET ?";
        List<Message> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            ps.setInt(2, size);
            ps.setInt(3, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("分页查询邮件失败: account=" + accountId, e);
        }
    }

    /** 统计某账号邮件总数，用于分页。 */
    public long countByAccount(long accountId) {
        String sql = "SELECT COUNT(*) FROM mail_message WHERE account_id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("统计邮件数量失败: account=" + accountId, e);
        }
    }

    /** 列出某账号的全部邮件（不分页），用于删除账号时的级联清理。 */
    public List<Message> listAllByAccount(long accountId) {
        String sql = "SELECT * FROM mail_message WHERE account_id = ?";
        List<Message> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("查询账号全部邮件失败: account=" + accountId, e);
        }
    }

    /** 删除某账号的全部邮件，用于级联清理。 */
    public void deleteByAccount(long accountId) {
        db.runWrite(() -> {
            String sql = "DELETE FROM mail_message WHERE account_id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, accountId);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("删除账号邮件失败: account=" + accountId, e);
            }
        });
    }

    /** 标记邮件已读 / 未读。 */
    public void markRead(long id, boolean read) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_message SET is_read = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setInt(1, read ? 1 : 0);
                ps.setLong(2, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("标记已读失败: " + id, e);
            }
        });
    }

    /** 把结果集当前行映射为 Message。 */
    private Message map(ResultSet rs) throws SQLException {
        return new Message(
                rs.getLong("id"),
                rs.getLong("account_id"),
                rs.getLong("uid"),
                rs.getString("message_id"),
                rs.getString("subject"),
                rs.getString("from_addr"),
                rs.getString("to_addr"),
                rs.getString("cc_addr"),
                rs.getLong("sent_at"),
                rs.getLong("received_at"),
                rs.getString("body_text"),
                rs.getString("body_html"),
                rs.getInt("has_attach") == 1,
                rs.getInt("is_read") == 1,
                rs.getLong("raw_size"),
                rs.getLong("created_at"));
    }
}
