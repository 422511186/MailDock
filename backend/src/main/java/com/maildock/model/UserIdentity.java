package com.maildock.model;

/**
 * 用户登录身份模型，对应数据库表 user_identity。
 *
 * @param id          主键
 * @param userId      所属 app_user.id
 * @param provider    身份来源，如 email_password / linuxdo
 * @param providerUid 该身份来源下的稳定唯一标识
 * @param secretHash  凭据哈希，仅 email_password 使用
 * @param createdAt   创建时间（毫秒时间戳）
 * @param updatedAt   更新时间（毫秒时间戳）
 */
public record UserIdentity(
        long id,
        long userId,
        String provider,
        String providerUid,
        String secretHash,
        long createdAt,
        long updatedAt) {
}
