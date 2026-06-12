package com.maildock.service;

import com.maildock.model.User;
import com.maildock.model.UserIdentity;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import org.mindrot.jbcrypt.BCrypt;

import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

/**
 * 用户认证服务：负责预制邮箱密码用户初始化、登录、登出与 Session 校验。
 */
public final class AuthService {

    private static final String EMAIL_PASSWORD_PROVIDER = "email_password";
    private static final String LINUXDO_PROVIDER = "linuxdo";

    private final UserRepository userRepo;
    private final IdentityRepository identityRepo;
    private final SessionStore sessionStore;
    private final Duration sessionTtl;

    public AuthService(UserRepository userRepo,
                       IdentityRepository identityRepo,
                       SessionStore sessionStore,
                       Duration sessionTtl) {
        this.userRepo = userRepo;
        this.identityRepo = identityRepo;
        this.sessionStore = sessionStore;
        this.sessionTtl = sessionTtl;
    }

    public record LoginResult(String sessionToken, User user) {
    }

    public enum ChangePasswordResult {
        OK,
        WRONG_OLD_PASSWORD,
        NO_PASSWORD_IDENTITY
    }

    public void ensureDefaultEmailUser(String email, String rawPassword) {
        if (isBlank(email) || isBlank(rawPassword)) {
            return;
        }
        String normalizedEmail = normalizeEmail(email);
        String hash = BCrypt.hashpw(rawPassword, BCrypt.gensalt());
        Optional<UserIdentity> existing = identityRepo.findByProviderUid(EMAIL_PASSWORD_PROVIDER, normalizedEmail);
        if (existing.isPresent()) {
            identityRepo.updateSecretHash(existing.get().id(), hash);
            return;
        }

        User user = userRepo.insert(normalizedEmail, normalizedEmail, null);
        identityRepo.insert(user.id(), EMAIL_PASSWORD_PROVIDER, normalizedEmail, hash);
    }

    public Optional<LoginResult> loginWithEmailPassword(String email, String rawPassword) {
        if (isBlank(email) || isBlank(rawPassword)) {
            return Optional.empty();
        }
        String normalizedEmail = normalizeEmail(email);
        Optional<UserIdentity> identity = identityRepo.findByProviderUid(EMAIL_PASSWORD_PROVIDER, normalizedEmail);
        if (identity.isEmpty() || isBlank(identity.get().secretHash())) {
            return Optional.empty();
        }
        if (!BCrypt.checkpw(rawPassword, identity.get().secretHash())) {
            return Optional.empty();
        }

        Optional<User> user = userRepo.findById(identity.get().userId());
        if (user.isEmpty()) {
            return Optional.empty();
        }
        long now = System.currentTimeMillis();
        userRepo.updateLastLogin(user.get().id(), now);
        User updated = userRepo.findById(user.get().id()).orElse(user.get());
        String token = sessionStore.issue(updated.id(), sessionTtl);
        return Optional.of(new LoginResult(token, updated));
    }

    public Optional<User> currentUser(String token) {
        return sessionStore.userId(token).flatMap(userRepo::findById);
    }

    /** 判断用户是否拥有可修改的邮箱密码身份（存在 email_password 且密码哈希非空）。 */
    public boolean hasPassword(long userId) {
        return identityRepo.findByUserAndProvider(userId, EMAIL_PASSWORD_PROVIDER)
                .map(identity -> !isBlank(identity.secretHash()))
                .orElse(false);
    }

    /** 修改邮箱密码用户的密码：校验旧密码后写入新哈希。新密码长度等校验由调用方负责。 */
    public ChangePasswordResult changePassword(long userId, String oldPassword, String newPassword) {
        Optional<UserIdentity> identity = identityRepo.findByUserAndProvider(userId, EMAIL_PASSWORD_PROVIDER);
        if (identity.isEmpty() || isBlank(identity.get().secretHash())) {
            return ChangePasswordResult.NO_PASSWORD_IDENTITY;
        }
        if (!BCrypt.checkpw(oldPassword, identity.get().secretHash())) {
            return ChangePasswordResult.WRONG_OLD_PASSWORD;
        }
        String hash = BCrypt.hashpw(newPassword, BCrypt.gensalt());
        identityRepo.updateSecretHash(identity.get().id(), hash);
        return ChangePasswordResult.OK;
    }

    /** 更新显示名，保留邮箱与头像不变；返回更新后的用户。 */
    public Optional<User> updateDisplayName(long userId, String displayName) {
        Optional<User> current = userRepo.findById(userId);
        if (current.isEmpty()) {
            return Optional.empty();
        }
        User u = current.get();
        userRepo.updateProfile(u.id(), u.primaryEmail(), displayName, u.avatarUrl());
        return userRepo.findById(u.id());
    }

    public Optional<LoginResult> loginWithLinuxdoUser(OAuthClient.OAuthUser oauthUser) {
        if (oauthUser == null || isBlank(oauthUser.providerUid())) {
            return Optional.empty();
        }

        String providerUid = oauthUser.providerUid().strip();
        String primaryEmail = nullableStrip(oauthUser.email());
        String displayName = nullableStrip(oauthUser.displayName());
        String avatarUrl = nullableStrip(oauthUser.avatarUrl());

        Optional<UserIdentity> identity = identityRepo.findByProviderUid(LINUXDO_PROVIDER, providerUid);
        User user;
        if (identity.isPresent()) {
            user = userRepo.findById(identity.get().userId()).orElse(null);
            if (user == null) {
                return Optional.empty();
            }
            // 只在首次创建时更新资料，后续登录不覆盖用户修改的显示名
        } else {
            user = userRepo.insert(primaryEmail, displayName, avatarUrl);
            identityRepo.insert(user.id(), LINUXDO_PROVIDER, providerUid, null);
        }

        long now = System.currentTimeMillis();
        userRepo.updateLastLogin(user.id(), now);
        User updated = userRepo.findById(user.id()).orElse(user);
        String token = sessionStore.issue(updated.id(), sessionTtl);
        return Optional.of(new LoginResult(token, updated));
    }

    public Optional<Long> userId(String token) {
        return sessionStore.userId(token);
    }

    public void logout(String token) {
        sessionStore.revoke(token);
    }

    public boolean authenticated(String token) {
        return sessionStore.isValid(token);
    }

    private String normalizeEmail(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private String nullableStrip(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
