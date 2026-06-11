package com.maildock.service;

import com.maildock.config.AppConfig;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * linux.do OAuth2 登录编排服务。
 */
public final class LinuxDoOAuthService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final long STATE_TTL_SECONDS = 600;

    private final AppConfig config;
    private final AuthService authService;
    private final OAuthClient oauthClient;
    private final ConcurrentHashMap<String, PendingState> states = new ConcurrentHashMap<>();

    public LinuxDoOAuthService(AppConfig config, AuthService authService, OAuthClient oauthClient) {
        this.config = config;
        this.authService = authService;
        this.oauthClient = oauthClient;
    }

    public record StartResult(String redirectUrl, String state) {
    }

    public StartResult start() {
        requireConfigured();
        String state = randomToken();
        String codeVerifier = randomToken();
        states.put(state, new PendingState(codeVerifier, Instant.now().plusSeconds(STATE_TTL_SECONDS)));

        String redirectUri = redirectUri();
        String url = config.linuxdoAuthUrl()
                + "?response_type=code"
                + "&client_id=" + enc(config.linuxdoClientId())
                + "&redirect_uri=" + enc(redirectUri)
                + "&scope=" + enc(config.linuxdoScope() == null ? "" : config.linuxdoScope())
                + "&state=" + enc(state)
                + "&code_challenge=" + enc(codeChallenge(codeVerifier))
                + "&code_challenge_method=S256";
        return new StartResult(url, state);
    }

    public Optional<AuthService.LoginResult> callback(String code, String state) {
        if (isBlank(code) || isBlank(state)) {
            return Optional.empty();
        }
        PendingState pending = states.remove(state);
        if (pending == null || pending.isExpired()) {
            return Optional.empty();
        }

        OAuthClient.TokenResponse token = oauthClient.exchangeCode(
                config.linuxdoTokenUrl(),
                config.linuxdoClientId(),
                config.linuxdoClientSecret(),
                code,
                redirectUri(),
                pending.codeVerifier());
        if (token == null || isBlank(token.accessToken())) {
            return Optional.empty();
        }

        OAuthClient.OAuthUser user = oauthClient.fetchUser(config.linuxdoUserinfoUrl(), token.accessToken());
        if (user == null || isBlank(user.providerUid())) {
            return Optional.empty();
        }
        return authService.loginWithLinuxdoUser(user);
    }

    private void requireConfigured() {
        if (isBlank(config.linuxdoAuthUrl())
                || isBlank(config.linuxdoTokenUrl())
                || isBlank(config.linuxdoUserinfoUrl())
                || isBlank(config.linuxdoClientId())
                || isBlank(config.linuxdoClientSecret())
                || isBlank(config.publicBaseUrl())) {
            throw new IllegalStateException("linux.do OAuth 配置不完整");
        }
    }

    private String redirectUri() {
        return trimTrailingSlash(config.publicBaseUrl()) + "/api/v1/auth/linuxdo/callback";
    }

    private String codeChallenge(String codeVerifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String trimTrailingSlash(String value) {
        String result = value.strip();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record PendingState(String codeVerifier, Instant expiresAt) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
