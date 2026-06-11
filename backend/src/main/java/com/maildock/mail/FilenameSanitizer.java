package com.maildock.mail;

/**
 * 附件文件名清洗工具，防止路径穿越和非法字符落盘。
 *
 * <p>邮件附件的文件名由发件人控制，可能包含路径分隔符、{@code ..} 穿越片段、
 * 控制字符或前导点等危险内容。本工具将其清洗为只含安全字符的纯文件名，
 * 落盘时再配合内部生成的 {@code {accountId}/{messageId}/} 目录结构使用。
 */
public final class FilenameSanitizer {

    /** 清洗后为空时使用的安全默认文件名。 */
    private static final String DEFAULT_NAME = "attachment";

    private FilenameSanitizer() {
        // 工具类，禁止实例化
    }

    /**
     * 将原始文件名清洗为安全的纯文件名。
     *
     * @param raw 原始文件名，可能为 null
     * @return 不含路径分隔符、穿越片段、控制字符和前导点的安全文件名；
     *         清洗后为空时返回 {@link #DEFAULT_NAME}
     */
    public static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_NAME;
        }

        // 统一分隔符为正斜杠，仅保留最后一段（去除目录和 .. 穿越片段）
        String name = raw.replace('\\', '/');
        int lastSlash = name.lastIndexOf('/');
        if (lastSlash >= 0) {
            name = name.substring(lastSlash + 1);
        }

        // 去除控制字符和空白字符
        StringBuilder sb = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (!Character.isISOControl(c) && !Character.isWhitespace(c)) {
                sb.append(c);
            }
        }

        // 去除前导点，避免生成隐藏文件或残留 .. 片段
        int start = 0;
        while (start < sb.length() && sb.charAt(start) == '.') {
            start++;
        }
        String cleaned = sb.substring(start);

        return cleaned.isBlank() ? DEFAULT_NAME : cleaned;
    }
}
