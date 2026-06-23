package com.maildock.mail;

import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.internet.MimeMessage;
import org.eclipse.angus.mail.imap.IMAPFolder;
import org.eclipse.angus.mail.imap.IMAPStore;

import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * IMAP 客户端：连接邮箱服务器、按 UID 增量拉取 INBOX 邮件、测试连通性。
 *
 * <p>针对 163 的特殊要求：连接登录后会发送 IMAP ID 命令（RFC 2971）声明客户端信息，
 * 否则 163 会返回 "Unsafe Login" 错误。该命令对不支持的服务器（如测试用的 GreenMail）
 * 容错处理，发送失败不影响后续操作。
 *
 * <p>增量依据 IMAP UID（稳定标识）而非邮件序号。每次拉取同时返回当前 UIDVALIDITY，
 * 调用方据此判断邮箱是否重建（需要全量重新同步）。
 */
public final class ImapClient {

    private final String host;
    private final int port;
    private final boolean useSsl;
    private final String email;
    private final String authCode;

    public ImapClient(String host, int port, boolean useSsl, String email, String authCode) {
        this.host = host;
        this.port = port;
        this.useSsl = useSsl;
        this.email = email;
        this.authCode = authCode;
    }

    /**
     * 增量拉取 INBOX 中 UID 大于 lastUid 的邮件。
     *
     * @param lastUid 上次同步到的最大 UID；传 0 表示全量拉取
     * @return 拉取结果，含 UIDVALIDITY 与按 UID 升序的邮件列表
     */
    public ImapFetchResult fetchSince(long lastUid) {
        Store store = null;
        Folder inbox = null;
        try {
            store = connect();
            inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);

            IMAPFolder imapFolder = (IMAPFolder) inbox;
            long uidValidity = imapFolder.getUIDValidity();

            // lastUid 已达 Long 上限时不可能有更大 UID，直接返回空结果
            if (lastUid == Long.MAX_VALUE) {
                return new ImapFetchResult(uidValidity, List.of());
            }

            // 拉取 UID 在 (lastUid, MAXUID] 区间的邮件
            Message[] msgs = imapFolder.getMessagesByUID(lastUid + 1, IMAPFolder.MAXUID);

            List<ImapMessage> result = new ArrayList<>();
            for (Message m : msgs) {
                long uid = imapFolder.getUID(m);
                // getMessagesByUID 的下界是包含的，且空区间可能返回最后一封，需再次过滤
                if (uid <= lastUid) {
                    continue;
                }
                // 复制成独立的 MimeMessage，避免 folder 关闭后无法读取内容
                MimeMessage copy = new MimeMessage((MimeMessage) m);
                result.add(new ImapMessage(uid, copy));
            }
            result.sort((a, b) -> Long.compare(a.uid(), b.uid()));

            return new ImapFetchResult(uidValidity, result);
        } catch (Exception e) {
            throw new RuntimeException("IMAP 增量拉取失败: " + email, e);
        } finally {
            closeQuietly(inbox, store);
        }
    }

    /** 测试连通性：能成功连接并登录则视为成功，否则抛异常。 */
    public void testConnection() {
        Store store = null;
        try {
            store = connect();
            // 能打开 INBOX 即视为连通正常
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            inbox.close(false);
        } catch (Exception e) {
            throw new RuntimeException("IMAP 连接测试失败: " + e.getMessage(), e);
        } finally {
            closeQuietly(null, store);
        }
    }

    /** 建立 IMAP 连接并登录，登录后尝试发送 163 要求的 ID 命令。 */
    private Store connect() throws Exception {
        Properties props = new Properties();
        String protocol = useSsl ? "imaps" : "imap";
        props.put("mail.store.protocol", protocol);
        props.put("mail." + protocol + ".host", host);
        props.put("mail." + protocol + ".port", String.valueOf(port));
        if (useSsl) {
            props.put("mail." + protocol + ".ssl.enable", "true");
        }
        // 连接与读取超时（毫秒），避免阻塞 worker 线程过久
        props.put("mail." + protocol + ".connectiontimeout", "15000");
        props.put("mail." + protocol + ".timeout", "30000");
        props.put("mail." + protocol + ".writetimeout", "10000");

        Session session = Session.getInstance(props);
        Store store = session.getStore(protocol);
        store.connect(host, port, email, authCode);

        sendId(store);
        return store;
    }

    /**
     * 发送 IMAP ID 命令声明客户端信息（163 必需）。
     * 对不支持 ID 扩展的服务器容错：失败仅忽略，不影响主流程。
     */
    private void sendId(Store store) {
        if (!(store instanceof IMAPStore imapStore)) {
            return;
        }
        try {
            java.util.Map<String, String> id = new java.util.HashMap<>();
            id.put("name", "MailDock");
            id.put("version", "1.0");
            id.put("vendor", "MailDock");
            id.put("support-email", "support@maildock.local");
            imapStore.id(id);
        } catch (Exception ignored) {
            // 服务器不支持 ID 命令时忽略
        }
    }

    private void closeQuietly(Folder folder, Store store) {
        if (folder != null && folder.isOpen()) {
            try {
                folder.close(false);
            } catch (Exception ignored) {
            }
        }
        if (store != null && store.isConnected()) {
            try {
                store.close();
            } catch (Exception ignored) {
            }
        }
    }
}
