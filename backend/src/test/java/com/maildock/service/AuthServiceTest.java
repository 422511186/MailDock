package com.maildock.service;

import com.maildock.model.User;
import com.maildock.model.UserIdentity;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mindrot.jbcrypt.BCrypt;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceTest {

    private Database db;
    private UserRepository userRepo;
    private IdentityRepository identityRepo;
    private SessionStore sessionStore;
    private AuthService service;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-auth-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        identityRepo = new IdentityRepository(db);
        sessionStore = new SessionStore();
        service = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void ensureDefaultEmailUserCreatesUserAndIdentity() {
        service.ensureDefaultEmailUser("Alice@Example.COM", "init-pass");

        UserIdentity identity = identityRepo
                .findByProviderUid("email_password", "alice@example.com")
                .orElseThrow();
        assertTrue(BCrypt.checkpw("init-pass", identity.secretHash()));
        assertEquals("alice@example.com", userRepo.findById(identity.userId()).orElseThrow().primaryEmail());
    }

    @Test
    void ensureDefaultEmailUserUpdatesExistingPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "old-pass");
        service.ensureDefaultEmailUser("alice@example.com", "new-pass");

        UserIdentity identity = identityRepo
                .findByProviderUid("email_password", "alice@example.com")
                .orElseThrow();

        assertTrue(BCrypt.checkpw("new-pass", identity.secretHash()));
    }

    @Test
    void emailPasswordLoginReturnsSessionAndUser() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");

        AuthService.LoginResult result = service.loginWithEmailPassword("alice@example.com", "init-pass")
                .orElseThrow();

        assertEquals("alice@example.com", result.user().primaryEmail());
        assertEquals(result.user().id(), sessionStore.userId(result.sessionToken()).orElseThrow());
    }

    @Test
    void emailPasswordLoginRejectsWrongPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");

        assertTrue(service.loginWithEmailPassword("alice@example.com", "wrong").isEmpty());
    }

    @Test
    void emailPasswordLoginUpdatesLastLoginAt() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");

        User before = service.loginWithEmailPassword("alice@example.com", "init-pass").orElseThrow().user();
        User after = userRepo.findById(before.id()).orElseThrow();

        assertTrue(after.lastLoginAt() > 0);
    }

    @Test
    void currentUserReturnsSessionUser() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");
        AuthService.LoginResult login = service.loginWithEmailPassword("alice@example.com", "init-pass")
                .orElseThrow();

        User current = service.currentUser(login.sessionToken()).orElseThrow();

        assertEquals(login.user().id(), current.id());
        assertEquals("alice@example.com", current.primaryEmail());
    }

    @Test
    void userIdAuthenticatedAndLogoutReflectSessionState() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");
        AuthService.LoginResult login = service.loginWithEmailPassword("alice@example.com", "init-pass")
                .orElseThrow();

        assertTrue(service.authenticated(login.sessionToken()));
        assertEquals(login.user().id(), service.userId(login.sessionToken()).orElseThrow());

        service.logout(login.sessionToken());

        assertFalse(service.authenticated(login.sessionToken()));
        assertTrue(service.userId(login.sessionToken()).isEmpty());
    }

    @Test
    void hasPasswordTrueForEmailPasswordUser() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertTrue(service.hasPassword(userId));
    }

    @Test
    void hasPasswordFalseForLinuxdoUser() {
        User user = userRepo.insert("linux@example.com", "Linux", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertFalse(service.hasPassword(user.id()));
    }

    @Test
    void changePasswordSucceedsWithCorrectOldPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "old-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertEquals(AuthService.ChangePasswordResult.OK,
                service.changePassword(userId, "old-pass", "new-pass-1"));

        // 旧密码失效，新密码可登录
        assertTrue(service.loginWithEmailPassword("alice@example.com", "old-pass").isEmpty());
        assertTrue(service.loginWithEmailPassword("alice@example.com", "new-pass-1").isPresent());
    }

    @Test
    void changePasswordRejectsWrongOldPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "old-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertEquals(AuthService.ChangePasswordResult.WRONG_OLD_PASSWORD,
                service.changePassword(userId, "wrong", "new-pass-1"));
    }

    @Test
    void changePasswordRejectsLinuxdoUserWithoutPassword() {
        User user = userRepo.insert("linux@example.com", "Linux", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertEquals(AuthService.ChangePasswordResult.NO_PASSWORD_IDENTITY,
                service.changePassword(user.id(), "anything", "new-pass-1"));
    }

    @Test
    void updateDisplayNameKeepsEmailAndAvatar() {
        User user = userRepo.insert("alice2@example.com", "Alice", "http://a/x.png");
        User updated = service.updateDisplayName(user.id(), "新名").orElseThrow();

        assertEquals("新名", updated.displayName());
        assertEquals("alice2@example.com", updated.primaryEmail());
        assertEquals("http://a/x.png", updated.avatarUrl());
    }
}
