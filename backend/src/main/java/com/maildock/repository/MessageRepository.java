package com.maildock.repository;

import com.maildock.model.Message;
import com.maildock.model.MessageFilter;

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

    /** 按用户归属查找邮件，其他用户的邮件视为不存在。 */
    public Optional<Message> findByIdForUser(long userId, long messageId) {
        String sql = """
                SELECT m.* FROM mail_message m
                JOIN mail_account a ON a.id = m.account_id
                WHERE m.id = ? AND a.user_id = ?
                """;
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, messageId);
            ps.setLong(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按用户查询邮件失败: " + messageId, e);
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

    /** 按用户归属分页列出某账号邮件；账号不属于用户时返回空列表。 */
    public List<Message> listByAccountForUser(long userId, long accountId, int page, int size) {
        int offset = (page - 1) * size;
        String sql = """
                SELECT m.* FROM mail_message m
                JOIN mail_account a ON a.id = m.account_id
                WHERE m.account_id = ? AND a.user_id = ?
                ORDER BY m.received_at DESC LIMIT ? OFFSET ?
                """;
        List<Message> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            ps.setLong(2, userId);
            ps.setInt(3, size);
            ps.setInt(4, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("按用户分页查询邮件失败: account=" + accountId, e);
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

    /** 按用户归属统计某账号邮件总数；账号不属于用户时返回 0。 */
    public long countByAccountForUser(long userId, long accountId) {
        String sql = """
                SELECT COUNT(*) FROM mail_message m
                JOIN mail_account a ON a.id = m.account_id
                WHERE m.account_id = ? AND a.user_id = ?
                """;
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, accountId);
            ps.setLong(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("按用户统计邮件数量失败: account=" + accountId, e);
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

    /** 按主键删除单封邮件，用于 storeMessage 回滚。 */
    public void deleteById(long id) {
        db.runWrite(() -> {
            String sql = "DELETE FROM mail_message WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("删除邮件失败: id=" + id, e);
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

    /** 按用户归属标记邮件已读 / 未读；不属于用户时抛异常。 */
    public void markReadForUser(long userId, long messageId, boolean read) {
        db.runWrite(() -> {
            String sql = """
                    UPDATE mail_message
                    SET is_read = ?
                    WHERE id = ?
                      AND account_id IN (SELECT id FROM mail_account WHERE user_id = ?)
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setInt(1, read ? 1 : 0);
                ps.setLong(2, messageId);
                ps.setLong(3, userId);
                int updated = ps.executeUpdate();
                if (updated == 0) {
                    throw new RuntimeException("邮件不存在: " + messageId);
                }
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("按用户标记已读失败: " + messageId, e);
            }
        });
    }

    /**
     * 跨账号搜索当前用户的邮件，支持关键字 / 账号 / 已读 / 附件 / 时间范围过滤与排序分页。
     *
     * <p>关键字长度 >= 3 走 FTS5 全文索引（含正文），< 3 回退主题 / 发件人 LIKE。
     * 用户隔离强制 {@code a.user_id = ?}，跨用户邮件不会出现。
     */
    public List<Message> searchForUser(long userId, MessageFilter f, int page, int size) {
        List<Object> params = new ArrayList<>();
        String join = ftsJoin(f);
        String where = buildWhere(userId, f, params);
        String orderBy = orderBy(f);
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, size);
        String sql = "SELECT m.* FROM mail_message m JOIN mail_account a ON a.id = m.account_id"
                + join + where + orderBy + " LIMIT ? OFFSET ?";
        params.add(safeSize);
        params.add((long) (safePage - 1) * safeSize);
        List<Message> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("跨账号搜索邮件失败: user=" + userId, e);
        }
    }

    /** 统计当前用户满足过滤条件的邮件总数，用于分页。 */
    public long countSearchForUser(long userId, MessageFilter f) {
        List<Object> params = new ArrayList<>();
        String join = ftsJoin(f);
        String where = buildWhere(userId, f, params);
        String sql = "SELECT COUNT(*) FROM mail_message m JOIN mail_account a ON a.id = m.account_id"
                + join + where;
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("统计搜索邮件总数失败: user=" + userId, e);
        }
    }

    /** 关键字非空白且去空格后长度 >= 3 时走 FTS5 全文索引。 */
    private boolean usesFts(MessageFilter f) {
        return f.keyword() != null && !f.keyword().isBlank() && f.keyword().strip().length() >= 3;
    }

    /** 仅在使用 FTS 时拼接 FTS 表 JOIN。 */
    private String ftsJoin(MessageFilter f) {
        return usesFts(f) ? " JOIN mail_message_fts fts ON fts.rowid = m.id" : "";
    }

    /** 把关键字包成 FTS5 短语并转义内部双引号，防止 FTS5 语法注入。 */
    private String ftsPhrase(String keyword) {
        return "\"" + keyword.strip().replace("\"", "\"\"") + "\"";
    }

    /** 构造 WHERE 子句并按顺序填充动态参数，强制用户隔离。 */
    private String buildWhere(long userId, MessageFilter f, List<Object> params) {
        StringBuilder where = new StringBuilder(" WHERE a.user_id = ?");
        params.add(userId);
        if (f.keyword() != null && !f.keyword().isBlank()) {
            if (usesFts(f)) {
                where.append(" AND fts.mail_message_fts MATCH ?");
                params.add(ftsPhrase(f.keyword()));
            } else {
                where.append(" AND (m.subject LIKE ? OR m.from_addr LIKE ?)");
                String like = "%" + f.keyword().strip() + "%";
                params.add(like);
                params.add(like);
            }
        }
        if (f.accountId() != null) {
            where.append(" AND m.account_id = ?");
            params.add(f.accountId());
        }
        if (f.isRead() != null) {
            where.append(" AND m.is_read = ?");
            params.add(f.isRead() ? 1 : 0);
        }
        if (f.hasAttach() != null) {
            where.append(" AND m.has_attach = ?");
            params.add(f.hasAttach() ? 1 : 0);
        }
        if (f.startDate() != null) {
            where.append(" AND m.received_at >= ?");
            params.add(f.startDate());
        }
        if (f.endDate() != null) {
            where.append(" AND m.received_at <= ?");
            params.add(f.endDate());
        }
        return where.toString();
    }

    /** 排序字段 / 方向白名单校验，默认 received_at DESC。 */
    private String orderBy(MessageFilter f) {
        String field = "sent_at".equals(f.sortBy()) ? "sent_at" : "received_at";
        String dir = "asc".equalsIgnoreCase(f.sortOrder()) ? "ASC" : "DESC";
        return " ORDER BY m." + field + " " + dir;
    }

    /** 依次绑定动态参数（mirror AccountRepository）。 */
    private void bindParams(PreparedStatement ps, List<Object> params) throws SQLException {
        int idx = 1;
        for (Object p : params) {
            ps.setObject(idx++, p);
        }
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
