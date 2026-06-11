package com.maildock.repository;

import com.maildock.model.Attachment;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * mail_attachment 表的数据访问对象，提供附件的入库、查询与级联删除。
 *
 * <p>所有写操作通过 {@link Database#runWrite} 串行化，读操作直接查询。
 */
public final class AttachmentRepository {

    private final Database db;

    public AttachmentRepository(Database db) {
        this.db = db;
    }

    /**
     * 插入一条附件元数据记录，返回带自增主键的完整附件。
     *
     * @param messageId   所属邮件 id
     * @param filename    附件文件名（已清洗）
     * @param contentType MIME 类型
     * @param size        字节大小
     * @param filePath    落盘相对路径
     */
    public Attachment insert(long messageId, String filename, String contentType, long size, String filePath) {
        return db.runWrite(() -> {
            long now = System.currentTimeMillis();
            String sql = "INSERT INTO mail_attachment (message_id, filename, content_type, size, file_path, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?)";
            try (PreparedStatement ps = db.connection().prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setLong(1, messageId);
                ps.setString(2, filename);
                ps.setString(3, contentType);
                ps.setLong(4, size);
                ps.setString(5, filePath);
                ps.setLong(6, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    return findById(keys.getLong(1)).orElseThrow();
                }
            } catch (SQLException e) {
                throw new RuntimeException("插入附件失败: " + filename, e);
            }
        });
    }

    /** 按主键查找附件。 */
    public Optional<Attachment> findById(long id) {
        String sql = "SELECT * FROM mail_attachment WHERE id = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 id 查询附件失败: " + id, e);
        }
    }

    /** 查询某封邮件的全部附件，按 id 升序。 */
    public List<Attachment> findByMessage(long messageId) {
        String sql = "SELECT * FROM mail_attachment WHERE message_id = ? ORDER BY id";
        List<Attachment> result = new ArrayList<>();
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, messageId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
            return result;
        } catch (SQLException e) {
            throw new RuntimeException("查询邮件附件失败: " + messageId, e);
        }
    }

    /** 删除某封邮件的全部附件（用于级联清理）。 */
    public void deleteByMessage(long messageId) {
        db.runWrite(() -> {
            String sql = "DELETE FROM mail_attachment WHERE message_id = ?";
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                ps.setLong(1, messageId);
                ps.executeUpdate();
                return null;
            } catch (SQLException e) {
                throw new RuntimeException("删除邮件附件失败: " + messageId, e);
            }
        });
    }

    /** 把结果集当前行映射为 Attachment。 */
    private Attachment map(ResultSet rs) throws SQLException {
        return new Attachment(
                rs.getLong("id"),
                rs.getLong("message_id"),
                rs.getString("filename"),
                rs.getString("content_type"),
                rs.getLong("size"),
                rs.getString("file_path"),
                rs.getLong("created_at"));
    }
}
