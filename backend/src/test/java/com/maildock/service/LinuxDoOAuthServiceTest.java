package com.maildock.service;

import com.maildock.config.AppConfig;
import com.maildock.model.UserIdentity;
import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LinuxDoOAuthServiceTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef";

    private Database db;
    private UserRepository userRepo;
    private IdentityRepository identityRepo;
    private SessionStore sessionStore;
    private AuthService authService;
    private FakeOAuthClient fakeClient;
    private Path dbFile;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("maildock-linuxdo-oauth-test", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();
        userRepo = new UserRepository(db);
        identityRepo = new IdentityRepository(db);
        sessionStore = new SessionStore();
        authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        fakeClient = new FakeOAuthClient();
    }

    @AfterEach
    void tearDown() throws Exception {
        db.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void startBuildsAuthorizationRedirectAndStoresState() {
        LinuxDoOAuthService service = serviceWithConfig();

        LinuxDoOAuthService.StartResult result = service.start();

        assertTrue(result.redirectUrl().startsWith("https://connect.linux.do/oauth2/authorize?"));
        assertTrue(result.redirectUrl().contains("client_id=client-id"));
        assertTrue(result.redirectUrl().contains("redirect_uri=https%3A%2F%2Fmaildock.example%2Fapi%2Fv1%2Fauth%2Flinuxdo%2Fcallback"));
        assertTrue(result.redirectUrl().contains("scope=read"));
        assertTrue(result.redirectUrl().contains("state="));
        assertTrue(result.redirectUrl().contains("code_challenge="));
        assertTrue(result.redirectUrl().contains("code_challenge_method=S256"));
        assertFalse(result.state().isBlank());
    }

    @Test
    void callbackCreatesLinuxdoUserAndSession() {
        LinuxDoOAuthService service = serviceWithConfig();
        LinuxDoOAuthService.StartResult start = service.start();
        fakeClient.user = new OAuthClient.OAuthUser("linux-42", "linux@example.com", "linux name", "avatar");

        AuthService.LoginResult result = service.callback("code-1", start.state()).orElseThrow();

        assertEquals("linux@example.com", result.user().primaryEmail());
        assertEquals("linux name", result.user().displayName());
        assertEquals("avatar", result.user().avatarUrl());
        assertEquals(result.user().id(), sessionStore.userId(result.sessionToken()).orElseThrow());
        assertTrue(identityRepo.findByProviderUid("linuxdo", "linux-42").isPresent());
        assertEquals("code-1", fakeClient.code);
        assertEquals("https://maildock.example/api/v1/auth/linuxdo/callback", fakeClient.redirectUri);
        assertFalse(fakeClient.codeVerifier.isBlank());
    }

    @Test
    void callbackFailsWhenUserinfoHasNoStableUserId() {
        LinuxDoOAuthService service = serviceWithConfig();
        LinuxDoOAuthService.StartResult start = service.start();
        fakeClient.user = new OAuthClient.OAuthUser("", "linux@example.com", "linux name", null);

        assertTrue(service.callback("code-1", start.state()).isEmpty());
    }

    @Test
    void callbackRejectsUnknownState() {
        LinuxDoOAuthService service = serviceWithConfig();

        assertTrue(service.callback("code-1", "missing-state").isEmpty());
    }

    @Test
    void repeatedLinuxdoLoginDoesNotOverwriteUserProfile() {
        LinuxDoOAuthService service = serviceWithConfig();
        LinuxDoOAuthService.StartResult first = service.start();
        fakeClient.user = new OAuthClient.OAuthUser("linux-42", "old@example.com", "Old", "old-avatar");
        AuthService.LoginResult firstLogin = service.callback("code-1", first.state()).orElseThrow();

        LinuxDoOAuthService.StartResult second = service.start();
        fakeClient.user = new OAuthClient.OAuthUser("linux-42", "new@example.com", "New", "new-avatar");
        AuthService.LoginResult secondLogin = service.callback("code-2", second.state()).orElseThrow();

        // 用户ID相同，但资料保持首次创建时的值，不被后续登录覆盖
        assertEquals(firstLogin.user().id(), secondLogin.user().id());
        assertEquals("old@example.com", secondLogin.user().primaryEmail());
        assertEquals("Old", secondLogin.user().displayName());
        assertEquals("old-avatar", secondLogin.user().avatarUrl());
        UserIdentity identity = identityRepo.findByProviderUid("linuxdo", "linux-42").orElseThrow();
        assertEquals(firstLogin.user().id(), identity.userId());
    }

    private LinuxDoOAuthService serviceWithConfig() {
        return new LinuxDoOAuthService(config(), authService, fakeClient);
    }

    private AppConfig config() {
        Map<String, String> env = new HashMap<>();
        env.put("MAILDOCK_SECRET_KEY", KEY);
        env.put("MAILDOCK_LINUXDO_CLIENT_ID", "client-id");
        env.put("MAILDOCK_LINUXDO_CLIENT_SECRET", "client-secret");
        env.put("MAILDOCK_LINUXDO_AUTH_URL", "https://connect.linux.do/oauth2/authorize");
        env.put("MAILDOCK_LINUXDO_TOKEN_URL", "https://connect.linux.do/oauth2/token");
        env.put("MAILDOCK_LINUXDO_USERINFO_URL", "https://connect.linux.do/api/user");
        env.put("MAILDOCK_LINUXDO_SCOPE", "read");
        env.put("MAILDOCK_PUBLIC_BASE_URL", "https://maildock.example");
        return AppConfig.from(env);
    }

    private static final class FakeOAuthClient implements OAuthClient {
        OAuthUser user = new OAuthUser("linux-42", "linux@example.com", "linux name", "avatar");
        String code;
        String redirectUri;
        String codeVerifier;

        @Override
        public TokenResponse exchangeCode(String tokenUrl,
                                          String clientId,
                                          String clientSecret,
                                          String code,
                                          String redirectUri,
                                          String codeVerifier) {
            this.code = code;
            this.redirectUri = redirectUri;
            this.codeVerifier = codeVerifier;
            return new TokenResponse("access-token");
        }

        @Override
        public OAuthUser fetchUser(String userinfoUrl, String accessToken) {
            return user;
        }
    }
}
