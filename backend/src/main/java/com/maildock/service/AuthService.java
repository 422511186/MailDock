package com.maildock.service;

import com.maildock.model.Admin;
import com.maildock.repository.AdminRepository;
import com.maildock.security.TokenStore;
import org.mindrot.jbcrypt.BCrypt;

import java.time.Duration;
import java.util.Optional;

/**
 * 管理员认证服务：负责默认管理员初始化、登录、登出与 Token 校验。
 *
 * <p>密码使用 BCrypt 哈希存储；登录成功后通过 {@link TokenStore} 签发进程内存 Token。
 */
public final class AuthService {

    /** 会话有效期：24 小时。 */
    private static final Duration SESSION_TTL = Duration.ofHours(24);

    private final AdminRepository adminRepo;
    private final TokenStore tokenStore;

    public AuthService(AdminRepository adminRepo, TokenStore tokenStore) {
        this.adminRepo = adminRepo;
        this.tokenStore = tokenStore;
    }

    /**
     * 确保存在默认管理员：当库中没有任何管理员时，按给定凭据创建一个。
     * 密码以 BCrypt 哈希存储。已存在管理员时不做任何操作。
     */
    public void ensureDefaultAdmin(String username, String rawPassword) {
        if (adminRepo.count() > 0) {
            return;
        }
        String hash = BCrypt.hashpw(rawPassword, BCrypt.gensalt());
        adminRepo.insert(username, hash);
    }

    /**
     * 管理员登录：校验用户名与密码，成功则签发并返回 Token，失败返回空。
     *
     * @param username 用户名
     * @param rawPassword 明文密码
     * @return 登录成功返回 Token，失败返回 {@link Optional#empty()}
     */
    public Optional<String> login(String username, String rawPassword) {
        Optional<Admin> admin = adminRepo.findByUsername(username);
        if (admin.isEmpty()) {
            return Optional.empty();
        }
        if (!BCrypt.checkpw(rawPassword, admin.get().passwordHash())) {
            return Optional.empty();
        }
        return Optional.of(tokenStore.issue(username, SESSION_TTL));
    }

    /** 登出：撤销 Token。 */
    public void logout(String token) {
        tokenStore.revoke(token);
    }

    /** 校验 Token 是否有效（已登录且未过期）。 */
    public boolean authenticated(String token) {
        return tokenStore.isValid(token);
    }
}
