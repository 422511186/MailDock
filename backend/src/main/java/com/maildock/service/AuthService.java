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
            userRepo.updateProfile(user.id(), primaryEmail, displayName, avatarUrl);
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

    /** 临时兼容旧配置入口；后续任务会替换为 {@link #ensureDefaultEmailUser(String, String)}。 */
    public void ensureDefaultAdmin(String username, String rawPassword) {
        ensureDefaultEmailUser(username, rawPassword);
    }

    /** 临时兼容旧 Bearer Token 登录路由。 */
    public Optional<String> login(String username, String rawPassword) {
        return loginWithEmailPassword(username, rawPassword).map(LoginResult::sessionToken);
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
