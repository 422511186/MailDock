package com.maildock.model;

/**
 * MailDock 普通用户模型，对应数据库表 app_user。
 *
 * @param id           主键
 * @param primaryEmail 主要邮箱，可为空
 * @param displayName  显示名，可为空
 * @param avatarUrl    头像地址，可为空
 * @param createdAt    创建时间（毫秒时间戳）
 * @param updatedAt    更新时间（毫秒时间戳）
 * @param lastLoginAt  最后登录时间（毫秒时间戳），无则为 0
 */
public record User(
        long id,
        String primaryEmail,
        String displayName,
        String avatarUrl,
        long createdAt,
        long updatedAt,
        long lastLoginAt) {
}
