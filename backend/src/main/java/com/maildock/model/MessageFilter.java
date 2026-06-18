package com.maildock.model;

/**
 * 聚合邮件查询的过滤条件。所有字段为 null 表示对应维度不过滤。
 * keyword 长度 >= 3 走 FTS5（含正文），< 3 回退主题/发件人 LIKE。
 * sortBy / sortOrder 在 Repository 内用白名单校验，默认 received_at DESC。
 */
public record MessageFilter(
        String keyword,
        Long accountId,
        Boolean isRead,
        Boolean hasAttach,
        Long startDate,
        Long endDate,
        String sortBy,
        String sortOrder) {
}
