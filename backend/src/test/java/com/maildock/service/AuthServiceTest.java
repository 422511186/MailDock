package com.maildock.service;

import com.maildock.repository.AdminRepository;
import com.maildock.repository.Database;
import com.maildock.security.TokenStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceTest {

    private Database db;
    private AdminRepository adminRepo;
    private TokenStore tokenStore;
    private AuthService service;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        // 每个测试使用独立的临时 SQLite 文件库
        dbFile = Files.createTempFile("maildock-auth-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        adminRepo = new AdminRepository(db);
        tokenStore = new TokenStore();
        service = new AuthService(adminRepo, tokenStore);
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void ensureDefaultAdminCreatesWhenAbsent() {
        // 首次启动且无管理员时，按给定凭据创建默认管理员
        assertEquals(0, adminRepo.count());

        service.ensureDefaultAdmin("admin", "init-pass");

        assertEquals(1, adminRepo.count());
        // 密码以哈希形式存储，不应是明文
        assertNotEquals("init-pass", adminRepo.findByUsername("admin").orElseThrow().passwordHash());
    }

    @Test
    void ensureDefaultAdminDoesNothingWhenAdminExists() {
        // 已有管理员时不重复创建
        service.ensureDefaultAdmin("admin", "init-pass");
        service.ensureDefaultAdmin("admin", "another-pass");

        assertEquals(1, adminRepo.count());
    }

    @Test
    void loginWithCorrectCredentialsReturnsToken() {
        // 凭据正确时登录返回有效 Token
        service.ensureDefaultAdmin("admin", "init-pass");

        Optional<String> token = service.login("admin", "init-pass");

        assertTrue(token.isPresent());
        assertTrue(tokenStore.isValid(token.get()));
        assertEquals("admin", tokenStore.subject(token.get()));
    }

    @Test
    void loginWithWrongPasswordReturnsEmpty() {
        // 密码错误时登录失败，返回空
        service.ensureDefaultAdmin("admin", "init-pass");

        assertTrue(service.login("admin", "wrong-pass").isEmpty());
    }

    @Test
    void loginWithUnknownUserReturnsEmpty() {
        // 用户名不存在时登录失败
        service.ensureDefaultAdmin("admin", "init-pass");

        assertTrue(service.login("nobody", "init-pass").isEmpty());
    }

    @Test
    void logoutRevokesToken() {
        // 登出后 Token 失效
        service.ensureDefaultAdmin("admin", "init-pass");
        String token = service.login("admin", "init-pass").orElseThrow();

        service.logout(token);

        assertFalse(tokenStore.isValid(token));
    }

    @Test
    void authenticatedReflectsTokenValidity() {
        // authenticated 反映 Token 是否有效
        service.ensureDefaultAdmin("admin", "init-pass");
        String token = service.login("admin", "init-pass").orElseThrow();

        assertTrue(service.authenticated(token));
        assertFalse(service.authenticated("bogus-token"));
    }
}
