package com.maildock.mail;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.ServerSetupTest;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.util.Date;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;

class ImapClientTest {

    // 启动内嵌 IMAP 服务器（明文，端口见 ServerSetupTest.IMAP）
    @RegisterExtension
    static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.IMAP);

    private static final String EMAIL = "owner@example.com";
    private static final String PASSWORD = "secret-pass";

    private GreenMailUser user;

    @BeforeEach
    void setUp() throws Exception {
        // 用户只创建一次：已存在则复用，避免重复创建抛 UserException
        user = greenMail.getUserManager().getUserByEmail(EMAIL);
        if (user == null) {
            user = greenMail.getUserManager().createUser(EMAIL, EMAIL, PASSWORD);
        }
    }

    /** 向收件人的 INBOX 投递一封简单邮件。 */
    private void deliver(String subject, String body) throws Exception {
        Session session = Session.getInstance(new Properties());
        MimeMessage msg = new MimeMessage(session);
        msg.setFrom(new InternetAddress("sender@example.com"));
        msg.setRecipient(MimeMessage.RecipientType.TO, new InternetAddress(EMAIL));
        msg.setSubject(subject, "UTF-8");
        msg.setSentDate(new Date());
        msg.setText(body, "UTF-8");
        msg.saveChanges();
        greenMail.getManagers().getImapHostManager().getInbox(user).store(msg);
    }

    private ImapClient client() {
        return new ImapClient(
                "127.0.0.1",
                ServerSetupTest.IMAP.getPort(),
                false, // GreenMail 测试用明文
                EMAIL,
                PASSWORD);
    }

    @Test
    void fetchSinceZeroReturnsAllMessages() throws Exception {
        // lastUid=0 时应拉取 INBOX 中全部邮件
        deliver("第一封", "正文1");
        deliver("第二封", "正文2");

        ImapFetchResult result = client().fetchSince(0);

        assertEquals(2, result.messages().size());
        assertTrue(result.uidValidity() > 0, "UIDVALIDITY 应为正数");
        // UID 升序
        assertTrue(result.messages().get(0).uid() < result.messages().get(1).uid());
        assertEquals("第一封", result.messages().get(0).message().getSubject());
    }

    @Test
    void fetchSinceLastUidReturnsOnlyNewer() throws Exception {
        // 仅返回 UID 大于 lastUid 的邮件（增量）
        deliver("旧邮件", "old");
        deliver("旧邮件2", "old2");

        // 先全量拿到当前最大 UID
        ImapFetchResult first = client().fetchSince(0);
        assertEquals(2, first.messages().size());
        long maxUid = first.messages().get(first.messages().size() - 1).uid();

        // 再投递一封新邮件
        deliver("新邮件", "new");

        ImapFetchResult incremental = client().fetchSince(maxUid);
        assertEquals(1, incremental.messages().size(), "只应拉到新投递的那一封");
        assertEquals("新邮件", incremental.messages().get(0).message().getSubject());
        assertTrue(incremental.messages().get(0).uid() > maxUid);
    }

    @Test
    void fetchSinceOnEmptyInboxReturnsNothing() throws Exception {
        // 空收件箱返回空列表，但 UIDVALIDITY 仍有效
        ImapFetchResult result = client().fetchSince(0);

        assertTrue(result.messages().isEmpty());
        assertTrue(result.uidValidity() > 0);
    }

    @Test
    void testConnectionSucceedsWithValidCredentials() {
        // 凭据正确时测活成功，不抛异常
        assertDoesNotThrow(() -> client().testConnection());
    }

    @Test
    void testConnectionFailsWithWrongPassword() {
        // 凭据错误时测活抛异常
        ImapClient bad = new ImapClient(
                "127.0.0.1", ServerSetupTest.IMAP.getPort(), false, EMAIL, "wrong-pass");

        assertThrows(Exception.class, bad::testConnection);
    }
}
