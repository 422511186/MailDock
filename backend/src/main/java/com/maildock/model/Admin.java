package com.maildock.model;

/**
 * 管理员模型，对应数据库表 admin_user。
 *
 * @param id           主键
 * @param username     用户名
 * @param passwordHash BCrypt 密码哈希
 * @param createdAt    创建时间（毫秒时间戳）
 */
public record Admin(
        long id,
        String username,
        String passwordHash,
        long createdAt) {
}
