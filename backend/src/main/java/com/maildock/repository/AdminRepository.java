package com.maildock.repository;

import com.maildock.model.Admin;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Optional;

/**
 * admin_user 表的数据访问对象，提供管理员的插入、查询与计数。
 *
 * <p>所有写操作通过 {@link Database#runWrite} 串行化，读操作直接查询。
 */
public final class AdminRepository {

    private final Database db;

    public AdminRepository(Database db) {
        this.db = db;
    }

    /**
     * 插入一个管理员，返回带自增主键的完整记录。
     *
     * @param username     用户名
     * @param passwordHash 密码的 BCrypt 哈希
     */
    public Admin insert(String username, String passwordHash) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = "INSERT INTO admin_user (username, password_hash, created_at) VALUES (?, ?, ?)";
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, username);
                ps.setString(2, passwordHash);
                ps.setLong(3, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    long id = keys.getLong(1);
                    return findById(id).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入管理员失败: " + username, e);
            }
        });
    }

    /** 按主键查找管理员。 */
    public Optional<Admin> findById(long id) {
        String sql = "SELECT * FROM admin_user WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询管理员失败: " + id, e);
        }
    }

    /** 按用户名查找管理员。 */
    public Optional<Admin> findByUsername(String username) {
        String sql = "SELECT * FROM admin_user WHERE username = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按用户名查询管理员失败: " + username, e);
        }
    }

    /** 返回管理员数量，用于判断是否需要初始化默认管理员。 */
    public long count() {
        String sql = "SELECT COUNT(*) FROM admin_user";
        try (PreparedStatement ps = db.connection().prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getLong(1);
        } catch (SQLException e) {
            throw new RuntimeException("统计管理员数量失败", e);
        }
    }

    /** 把结果集当前行映射为 Admin。 */
    private Admin map(ResultSet rs) throws SQLException {
        return new Admin(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getLong("created_at"));
    }
}
