package com.maildock.service;

import com.maildock.config.AppConfig;
import io.vertx.core.MultiMap;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.net.ProxyOptions;
import io.vertx.core.net.ProxyType;
import io.vertx.ext.web.client.HttpResponse;
import io.vertx.ext.web.client.WebClient;
import io.vertx.ext.web.client.WebClientOptions;

import java.util.concurrent.TimeUnit;

/**
 * 基于 Vert.x WebClient 的 OAuth HTTP 客户端。
 */
public final class VertxOAuthClient implements OAuthClient {

    private static final long REQUEST_TIMEOUT_SECONDS = 30;

    private final WebClient client;
    private final AppConfig config;

    public VertxOAuthClient(Vertx vertx, AppConfig config) {
        this.client = WebClient.create(vertx, webClientOptions(config));
        this.config = config;
    }

    /** 根据配置构建 WebClient 选项；配置了代理主机时让出站请求经 HTTP 代理转发。 */
    private static WebClientOptions webClientOptions(AppConfig config) {
        WebClientOptions options = new WebClientOptions();
        if (config.httpProxyHost() != null && config.httpProxyPort() > 0) {
            options.setProxyOptions(new ProxyOptions()
                    .setType(ProxyType.HTTP)
                    .setHost(config.httpProxyHost())
                    .setPort(config.httpProxyPort()));
        }
        return options;
    }

    @Override
    public TokenResponse exchangeCode(String tokenUrl,
                                      String clientId,
                                      String clientSecret,
                                      String code,
                                      String redirectUri,
                                      String codeVerifier) {
        MultiMap form = MultiMap.caseInsensitiveMultiMap()
                .add("grant_type", "authorization_code")
                .add("client_id", valueOrEmpty(clientId))
                .add("client_secret", valueOrEmpty(clientSecret))
                .add("code", valueOrEmpty(code))
                .add("redirect_uri", valueOrEmpty(redirectUri))
                .add("code_verifier", valueOrEmpty(codeVerifier));

        HttpResponse<Buffer> response = await(client.postAbs(tokenUrl).sendForm(form));
        ensureSuccess(response, "OAuth token 请求失败");
        JsonBody body = new JsonBody(response);
        return new TokenResponse(body.string("access_token"));
    }

    @Override
    public OAuthUser fetchUser(String userinfoUrl, String accessToken) {
        HttpResponse<Buffer> response = await(client.getAbs(userinfoUrl)
                .putHeader("Authorization", "Bearer " + accessToken)
                .send());
        ensureSuccess(response, "OAuth userinfo 请求失败");
        JsonBody body = new JsonBody(response);
        return new OAuthUser(
                body.string(fieldOrDefault(config.linuxdoUserIdField(), "id")),
                body.string(fieldOrDefault(config.linuxdoEmailField(), "email")),
                body.string(fieldOrDefault(config.linuxdoNameField(), "username")),
                body.string(fieldOrDefault(config.linuxdoAvatarField(), "avatar_url")));
    }

    private HttpResponse<Buffer> await(io.vertx.core.Future<HttpResponse<Buffer>> future) {
        try {
            return future.toCompletionStage().toCompletableFuture()
                    .get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("OAuth HTTP 请求被中断", e);
        } catch (Exception e) {
            throw new RuntimeException("OAuth HTTP 请求失败", e);
        }
    }

    private void ensureSuccess(HttpResponse<Buffer> response, String message) {
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException(message + ": HTTP " + response.statusCode());
        }
    }

    private String fieldOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private static final class JsonBody {
        private final io.vertx.core.json.JsonObject body;

        private JsonBody(HttpResponse<Buffer> response) {
            this.body = response.bodyAsJsonObject();
            if (this.body == null) {
                throw new RuntimeException("OAuth 响应不是 JSON");
            }
        }

        private String string(String field) {
            Object value = body.getValue(field);
            return value == null ? null : String.valueOf(value);
        }
    }
}
