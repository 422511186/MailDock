package com.maildock.model;

/**
 * 163 邮箱账号模型，对应数据库表 mail_account。
 *
 * @param id          主键
 * @param userId      所属用户 id
 * @param email       邮箱地址
 * @param authCodeEnc 授权码（AES-GCM 加密后的密文）
 * @param imapHost    IMAP 服务器地址
 * @param imapPort    IMAP 端口
 * @param lastUid     INBOX 上次同步到的最大 UID（增量依据）
 * @param uidValidity IMAP UIDVALIDITY，变化时需重置 lastUid
 * @param lastSyncAt  上次同步时间（毫秒时间戳），无则为 0
 * @param lastTestAt  最后测活时间（毫秒时间戳），无则为 0
 * @param lastTestOk  最后测活结果是否成功
 * @param lastTestMsg 最后测活信息（失败原因等）
 * @param createdAt   创建时间（毫秒时间戳）
 */
public record Account(
        long id,
        long userId,
        String email,
        String authCodeEnc,
        String imapHost,
        int imapPort,
        long lastUid,
        long uidValidity,
        long lastSyncAt,
        long lastTestAt,
        boolean lastTestOk,
        String lastTestMsg,
        long createdAt) {

    public Account(long id,
                   String email,
                   String authCodeEnc,
                   String imapHost,
                   int imapPort,
                   long lastUid,
                   long uidValidity,
                   long lastSyncAt,
                   long lastTestAt,
                   boolean lastTestOk,
                   String lastTestMsg,
                   long createdAt) {
        this(id, 0L, email, authCodeEnc, imapHost, imapPort, lastUid, uidValidity,
                lastSyncAt, lastTestAt, lastTestOk, lastTestMsg, createdAt);
    }
}
