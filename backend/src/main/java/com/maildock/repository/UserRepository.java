package com.maildock.repository;

import com.maildock.model.User;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Optional;

/**
 * app_user 表的数据访问对象，提供普通用户的创建、查询和资料更新。
 */
public final class UserRepository {

    private final Database db;

    public UserRepository(Database db) {
        this.db = db;
    }

    public User insert(String primaryEmail, String displayName, String avatarUrl) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = """
                    INSERT INTO app_user
                        (primary_email, display_name, avatar_url, created_at, updated_at, last_login_at)
                    VALUES (?, ?, ?, ?, ?, 0)
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, primaryEmail);
                ps.setString(2, displayName);
                ps.setString(3, avatarUrl);
                ps.setLong(4, now);
                ps.setLong(5, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    return findById(keys.getLong(1)).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入用户失败: " + primaryEmail, e);
            }
        });
    }

    public Optional<User> findById(long id) {
        String sql = "SELECT * FROM app_user WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询用户失败: " + id, e);
        }
    }

    public void updateProfile(long id, String primaryEmail, String displayName, String avatarUrl) {
        db.runWrite(() -> {
            String sql = """
                    UPDATE app_user
                    SET primary_email = ?, display_name = ?, avatar_url = ?, updated_at = ?
                    WHERE id = ?
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setString(1, primaryEmail);
                ps.setString(2, displayName);
                ps.setString(3, avatarUrl);
                ps.setLong(4, System.currentTimeMillis());
                ps.setLong(5, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新用户资料失败: " + id, e);
            }
        });
    }

    public void updateLastLogin(long id, long lastLoginAt) {
        db.runWrite(() -> {
            String sql = "UPDATE app_user SET last_login_at = ?, updated_at = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, lastLoginAt);
                ps.setLong(2, System.currentTimeMillis());
                ps.setLong(3, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新用户最后登录时间失败: " + id, e);
            }
        });
    }

    private User map(ResultSet rs) throws SQLException {
        return new User(
                rs.getLong("id"),
                rs.getString("primary_email"),
                rs.getString("display_name"),
                rs.getString("avatar_url"),
                rs.getLong("created_at"),
                rs.getLong("updated_at"),
                rs.getLong("last_login_at"));
    }
}
