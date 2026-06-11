package com.maildock.service;

/**
 * OAuth HTTP 客户端抽象，便于服务层测试用假实现替代真实网络请求。
 */
public interface OAuthClient {

    record TokenResponse(String accessToken) {
    }

    record OAuthUser(String providerUid, String email, String displayName, String avatarUrl) {
    }

    TokenResponse exchangeCode(String tokenUrl,
                               String clientId,
                               String clientSecret,
                               String code,
                               String redirectUri,
                               String codeVerifier);

    OAuthUser fetchUser(String userinfoUrl, String accessToken);
}
