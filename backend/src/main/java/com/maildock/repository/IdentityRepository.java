package com.maildock.repository;

import com.maildock.model.UserIdentity;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Optional;

/**
 * user_identity 表的数据访问对象，提供登录身份的创建、查询和凭据更新。
 */
public final class IdentityRepository {

    private final Database db;

    public IdentityRepository(Database db) {
        this.db = db;
    }

    public UserIdentity insert(long userId, String provider, String providerUid, String secretHash) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = """
                    INSERT INTO user_identity
                        (user_id, provider, provider_uid, secret_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """;
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, userId);
                ps.setString(2, provider);
                ps.setString(3, providerUid);
                ps.setString(4, secretHash);
                ps.setLong(5, now);
                ps.setLong(6, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    return findById(keys.getLong(1)).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入用户身份失败: " + provider + "/" + providerUid, e);
            }
        });
    }

    public Optional<UserIdentity> findById(long id) {
        String sql = "SELECT * FROM user_identity WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询用户身份失败: " + id, e);
        }
    }

    public Optional<UserIdentity> findByProviderUid(String provider, String providerUid) {
        String sql = "SELECT * FROM user_identity WHERE provider = ? AND provider_uid = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setString(1, provider);
            ps.setString(2, providerUid);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 provider 查询用户身份失败: " + provider + "/" + providerUid, e);
        }
    }

    public Optional<UserIdentity> findByUserAndProvider(long userId, String provider) {
        String sql = "SELECT * FROM user_identity WHERE user_id = ? AND provider = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setString(2, provider);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 user/provider 查询用户身份失败: " + userId + "/" + provider, e);
        }
    }

    public void updateSecretHash(long id, String secretHash) {
        db.runWrite(() -> {
            String sql = "UPDATE user_identity SET secret_hash = ?, updated_at = ? WHERE id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setString(1, secretHash);
                ps.setLong(2, System.currentTimeMillis());
                ps.setLong(3, id);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("更新用户身份凭据失败: " + id, e);
            }
        });
    }

    private UserIdentity map(ResultSet rs) throws SQLException {
        return new UserIdentity(
                rs.getLong("id"),
                rs.getLong("user_id"),
                rs.getString("provider"),
                rs.getString("provider_uid"),
                rs.getString("secret_hash"),
                rs.getLong("created_at"),
                rs.getLong("updated_at"));
    }
}
