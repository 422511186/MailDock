package com.maildock.mail;

import java.util.List;

/**
 * 一次 IMAP 增量拉取的结果。
 *
 * @param uidValidity 本次打开 INBOX 时的 UIDVALIDITY；若与上次记录不同，
 *                    说明邮箱已重建，调用方需重置 lastUid 后全量重新同步
 * @param messages    本次拉取到的邮件列表，按 UID 升序
 */
public record ImapFetchResult(long uidValidity, List<ImapMessage> messages) {
}
