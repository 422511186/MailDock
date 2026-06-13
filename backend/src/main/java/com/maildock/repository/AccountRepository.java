package com.maildock.repository;

import com.maildock.model.Account;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * mail_account 表的数据访问对象，提供账号的增删查与状态更新。
 *
 * <p>所有写操作通过 {@link Database#runWrite} 串行化，读操作直接查询。
 */
public final class AccountRepository {

    private final Database db;
    private Long compatibilityUserId;

    public AccountRepository(Database db) {
        this.db = db;
    }

    public Account insert(String email, String authCodeEnc) {
        return insert(compatibilityUserId(), email, authCodeEnc);
    }

    /**
     * 插入一个新账号，IMAP 主机 / 端口使用默认值，返回带自增主键的完整账号。
     *
     * @param email       邮箱地址
     * @param authCodeEnc 授权码密文
     */
    public Account insert(long userId, String email, String authCodeEnc) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = "INSERT INTO mail_account (user_id, email, auth_code_enc, created_at) VALUES (?, ?, ?, ?)";
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, userId);
                ps.setString(2, email);
                ps.setString(3, authCodeEnc);
                ps.setLong(4, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    long id = keys.getLong(1);
                    return findById(userId, id).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入邮箱账号失败: " + email, e);
            }
        });
    }

    public Optional<Account> findById(long id) {
        String sql = "SELECT * FROM mail_account WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询账号失败: " + id, e);
        }
    }

    /** 按主键查找账号。 */
    public Optional<Account> findById(long userId, long id) {
        String sql = "SELECT * FROM mail_account WHERE user_id = ? AND id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setLong(2, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询账号失败: " + id, e);
        }
    }

    public Optional<Account> findByEmail(String email) {
        String sql = "SELECT * FROM mail_account WHERE email = ? ORDER BY id LIMIT 1";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按邮箱查询账号失败: " + email, e);
        }
    }

    /** 按邮箱地址查找账号。 */
    public Optional<Account> findByEmail(long userId, String email) {
        String sql = "SELECT * FROM mail_account WHERE user_id = ? AND email = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setString(2, email);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按邮箱查询账号失败: " + email, e);
        }
    }

    public List<Account> listAll() {
        String sql = "SELECT * FROM mail_account ORDER BY id";
        List<Account> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                result.add(map(rs));
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("查询账号列表失败", e);
        }
    }

    /** 列出全部账号，按 id 升序。 */
    public List<Account> listAll(long userId) {
        String sql = "SELECT * FROM mail_account WHERE user_id = ? ORDER BY id";
        List<Account> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("查询账号列表失败", e);
        }
    }

    /** 分页查询结果：当前页数据 + 满足过滤条件的总数。 */
    public record PagedAccounts(long total, List<Account> items) {
    }

    /**
     * 分页 + 邮箱搜索 + 状态过滤 + 排序查询账号。
     *
     * <p>状态为派生值，不落库：
     * <ul>
     *   <li>{@code pending}：{@code last_test_at = 0}（从未测活）</li>
     *   <li>{@code ok}：{@code last_test_at > 0 且 last_test_ok = 1}</li>
     *   <li>{@code fail}：{@code last_test_at > 0 且 last_test_ok = 0}</li>
     * </ul>
     *
     * @param email     邮箱子串（忽略大小写），null 或空白表示不过滤
     * @param status    状态过滤 pending/ok/fail，null 或其他值表示不过滤
     * @param sortBy    排序字段，默认 last_sync_at
     * @param sortOrder 排序方向 asc/desc，默认 desc
     * @param page      页码，从 1 开始
     * @param size      每页条数
     */
    public PagedAccounts query(long userId, String email, String status, String sortBy, String sortOrder, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE user_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(userId);
        if (email != null && !email.isBlank()) {
            where.append(" AND LOWER(email) LIKE ?");
            params.add("%" + email.strip().toLowerCase() + "%");
        }
        if ("pending".equals(status)) {
            where.append(" AND (last_test_at IS NULL OR last_test_at = 0)");
        } else if ("ok".equals(status)) {
            where.append(" AND last_test_at > 0 AND last_test_ok = 1");
        } else if ("fail".equals(status)) {
            where.append(" AND last_test_at > 0 AND last_test_ok = 0");
        }

        // 排序：白名单防止 SQL 注入
        String orderField = "last_sync_at";
        if ("lastTestAt".equals(sortBy)) orderField = "last_test_at";
        else if ("lastSyncAt".equals(sortBy)) orderField = "last_sync_at";
        String orderDir = "desc".equalsIgnoreCase(sortOrder) ? "DESC" : "ASC";
        String orderBy = " ORDER BY " + orderField + " " + orderDir;

        long total;
        String countSql = "SELECT COUNT(*) FROM mail_account" + where;
        try (PreparedStatement ps = db.connection().prepareStatement(countSql)) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                total = rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("统计账号总数失败", e);
        }

        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, size);
        int offset = (safePage - 1) * safeSize;
        List<Account> items = new ArrayList<>();
        String pageSql = "SELECT a.*, COALESCE((SELECT COUNT(*) FROM mail_message m WHERE m.account_id = a.id), 0) AS message_count FROM mail_account a" + where + orderBy + " LIMIT ? OFFSET ?";
        try (PreparedStatement ps = db.connection().prepareStatement(pageSql)) {
            int idx = bindParams(ps, params);
            ps.setInt(idx++, safeSize);
            ps.setInt(idx, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    items.add(map(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("分页查询账号失败", e);
        }
        return new PagedAccounts(total, items);
    }

    /** 依次绑定动态参数，返回下一个可用占位符序号。 */
    private int bindParams(PreparedStatement ps, List<Object> params) throws SQLException {
        int idx = 1;
        for (Object p : params) {
            ps.setObject(idx++, p);
        }
        return idx;
    }

    public PagedAccounts query(String email, String status, String sortBy, String sortOrder, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (email != null && !email.isBlank()) {
            where.append(" AND LOWER(email) LIKE ?");
            params.add("%" + email.strip().toLowerCase() + "%");
        }
        if ("pending".equals(status)) {
            where.append(" AND (last_test_at IS NULL OR last_test_at = 0)");
        } else if ("ok".equals(status)) {
            where.append(" AND last_test_at > 0 AND last_test_ok = 1");
        } else if ("fail".equals(status)) {
            where.append(" AND last_test_at > 0 AND last_test_ok = 0");
        }

        String orderField = "last_sync_at";
        if ("lastTestAt".equals(sortBy)) orderField = "last_test_at";
        else if ("lastSyncAt".equals(sortBy)) orderField = "last_sync_at";
        String orderDir = "desc".equalsIgnoreCase(sortOrder) ? "DESC" : "ASC";
        String orderBy = " ORDER BY " + orderField + " " + orderDir;

        long total;
        String countSql = "SELECT COUNT(*) FROM mail_account" + where;
        try (PreparedStatement ps = db.connection().prepareStatement(countSql)) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                total = rs.getLong(1);
            }
        } catch (SQLException e) {
            throw new RuntimeException("统计账号总数失败", e);
        }

        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, size);
        int offset = (safePage - 1) * safeSize;
        List<Account> items = new ArrayList<>();
        String pageSql = "SELECT a.*, COALESCE((SELECT COUNT(*) FROM mail_message m WHERE m.account_id = a.id), 0) AS message_count FROM mail_account a" + where + orderBy + " LIMIT ? OFFSET ?";
        try (PreparedStatement ps = db.connection().prepareStatement(pageSql)) {
            int idx = bindParams(ps, params);
            ps.setInt(idx++, safeSize);
            ps.setInt(idx, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    items.add(map(rs));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("分页查询账号失败", e);
        }
        return new PagedAccounts(total, items);
    }

    /** 删除账号。 */
    public void delete(long userId, long id) {
        db.runWrite(() -> {
            String sql = "DELETE FROM mail_account WHERE user_id = ? AND id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, userId);
                ps.setLong(2, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("删除账号失败: " + id, e);
            }
        });
    }

    public void delete(long id) {
        db.runWrite(() -> {
            String sql = "DELETE FROM mail_account WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("删除账号失败: " + id, e);
            }
        });
    }

    /** 更新账号的授权码密文（批量导入覆盖时使用）。 */
    public void updateAuthCode(long userId, long id, String authCodeEnc) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET auth_code_enc = ? WHERE user_id = ? AND id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setString(1, authCodeEnc);
                ps.setLong(2, userId);
                ps.setLong(3, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新授权码失败: " + id, e);
            }
        });
    }

    public void updateAuthCode(long id, String authCodeEnc) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET auth_code_enc = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setString(1, authCodeEnc);
                ps.setLong(2, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新授权码失败: " + id, e);
            }
        });
    }

    /** 更新增量同步状态：last_uid / uid_validity / last_sync_at。 */
    public void updateSyncState(long userId, long id, long lastUid, long uidValidity, long lastSyncAt) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET last_uid = ?, uid_validity = ?, last_sync_at = ? WHERE user_id = ? AND id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, lastUid);
                ps.setLong(2, uidValidity);
                ps.setLong(3, lastSyncAt);
                ps.setLong(4, userId);
                ps.setLong(5, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新同步状态失败: " + id, e);
            }
        });
    }

    public void updateSyncState(long id, long lastUid, long uidValidity, long lastSyncAt) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET last_uid = ?, uid_validity = ?, last_sync_at = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, lastUid);
                ps.setLong(2, uidValidity);
                ps.setLong(3, lastSyncAt);
                ps.setLong(4, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新同步状态失败: " + id, e);
            }
        });
    }

    /** 更新测活状态：last_test_at / last_test_ok / last_test_msg。 */
    public void updateTestStatus(long userId, long id, long lastTestAt, boolean ok, String msg) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET last_test_at = ?, last_test_ok = ?, last_test_msg = ? WHERE user_id = ? AND id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, lastTestAt);
                ps.setInt(2, ok ? 1 : 0);
                ps.setString(3, msg);
                ps.setLong(4, userId);
                ps.setLong(5, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新测活状态失败: " + id, e);
            }
        });
    }

    public void updateTestStatus(long id, long lastTestAt, boolean ok, String msg) {
        db.runWrite(() -> {
            String sql = "UPDATE mail_account SET last_test_at = ?, last_test_ok = ?, last_test_msg = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, lastTestAt);
                ps.setInt(2, ok ? 1 : 0);
                ps.setString(3, msg);
                ps.setLong(4, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新测活状态失败: " + id, e);
            }
        });
    }

    private long compatibilityUserId() {
        if (compatibilityUserId != null) {
            return compatibilityUserId;
        }
        return db.runWrite(() -> {
            String select = "SELECT id FROM app_user ORDER BY id LIMIT 1";
            try (PreparedStatement ps = db.connection().prepareStatement(select);
                 ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    compatibilityUserId = rs.getLong(1);
                    return compatibilityUserId;
                }
            } catch (SQLException e) {
                throw new RuntimeException("查询兼容用户失败", e);
            }

            long now = System.currentTimeMillis();
            String insert = """
                    INSERT INTO app_user
                        (primary_email, display_name, avatar_url, created_at, updated_at, last_login_at)
                    VALUES (?, ?, NULL, ?, ?, 0)
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(insert, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, "compat@example.com");
                ps.setString(2, "Compatibility User");
                ps.setLong(3, now);
                ps.setLong(4, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    compatibilityUserId = keys.getLong(1);
                    return compatibilityUserId;
                }
            } catch (SQLException e) {
                throw new RuntimeException("创建兼容用户失败", e);
            }
        });
    }

    /** 把结果集当前行映射为 Account。 */
    private Account map(ResultSet rs) throws SQLException {
        int messageCount = 0;
        try {
            messageCount = rs.getInt("message_count");
        } catch (SQLException ignored) {
            // 如果查询没有 message_count 列，默认为 0
        }
        return new Account(
                rs.getLong("id"),
                rs.getLong("user_id"),
                rs.getString("email"),
                rs.getString("auth_code_enc"),
                rs.getString("imap_host"),
                rs.getInt("imap_port"),
                rs.getLong("last_uid"),
                rs.getLong("uid_validity"),
                rs.getLong("last_sync_at"),
                rs.getLong("last_test_at"),
                rs.getInt("last_test_ok") == 1,
                rs.getString("last_test_msg"),
                rs.getLong("created_at"),
                messageCount);
    }
}
