package com.maildock.web;

import com.maildock.service.AccountService;
import com.maildock.service.AuthService;
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import com.maildock.web.handler.AccountApiHandler;
import com.maildock.web.handler.AuthApiHandler;
import com.maildock.web.handler.MailApiHandler;
import com.maildock.web.handler.SessionApiHandler;
import com.maildock.web.handler.UserApiHandler;
import io.vertx.core.Vertx;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.handler.CorsHandler;

import java.time.Duration;
import java.util.Set;
/**
 * 构建 REST API 的路由表。把路由构建逻辑独立出来，便于测试注入各 service 并用 WebClient 直接打路由。
 *
 * <p>所有接口前缀 {@code /api/v1}。除登录与 OAuth 入口外，{@code /api/v1} 下的路由都需要
 * 校验 HttpOnly Cookie Session。
 *
 * <p>阻塞操作（IMAP 收取、JDBC、磁盘 I/O）通过 {@link Vertx#executeBlocking} 隔离，
 * 不在事件循环线程上直接执行。所有阻塞任务都以 {@code ordered=false} 提交，进 worker 池并行执行，
 * 避免慢操作（如批量测活）把后续查询请求排队堵死。SQLite 写串行化由 {@code Database} 内部的锁保证，
 * 不依赖 executeBlocking 的顺序性。
 */
public final class ApiRouter {

    /** API 路径前缀（含版本号）。所有 REST 接口都挂在该前缀下，便于后续版本演进。 */
    public static final String API = "/api/v1";
    private final Vertx vertx;
    private final AuthApiHandler authApiHandler;
    private final AccountApiHandler accountApiHandler;
    private final MailApiHandler mailApiHandler;
    private final UserApiHandler userApiHandler;
    private final SessionApiHandler sessionApiHandler;
    private final String corsOrigins;

    public ApiRouter(Vertx vertx,
                     AuthService authService,
                     AccountService accountService,
                     MailSyncService mailSyncService,
                     MailQueryService mailQueryService) {
        this(vertx, authService, null, accountService, mailSyncService, mailQueryService,
                false, Duration.ofHours(24), "/", "http://localhost:5173");
    }

    public ApiRouter(Vertx vertx,
                     AuthService authService,
                     LinuxDoOAuthService linuxDoOAuthService,
                     AccountService accountService,
                     MailSyncService mailSyncService,
                     MailQueryService mailQueryService,
                     boolean sessionCookieSecure,
                     Duration sessionTtl,
                     String frontendUrl,
                     String corsOrigins) {
        this.vertx = vertx;
        this.authApiHandler = new AuthApiHandler(
                vertx, authService, linuxDoOAuthService, sessionCookieSecure, sessionTtl);
        this.accountApiHandler = new AccountApiHandler(vertx, accountService);
        this.mailApiHandler = new MailApiHandler(vertx, mailSyncService, mailQueryService);
        this.userApiHandler = new UserApiHandler(vertx, authService);
        this.sessionApiHandler = new SessionApiHandler(vertx, authService, sessionCookieSecure);
        this.corsOrigins = corsOrigins;
    }

    /** 构建并返回配置好的 Router。 */
    public Router build() {
        Router router = Router.router(vertx);

        // CORS - 使用配置的允许来源，而非通配符
        CorsHandler corsHandler = CorsHandler.create()
                .allowedMethods(Set.of(HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE, HttpMethod.OPTIONS))
                .allowedHeaders(Set.of("Content-Type", "Authorization"))
                .allowCredentials(true);
        // 逐个添加允许的来源
        for (String origin : corsOrigins.split(",")) {
            corsHandler.addRelativeOrigin(origin.trim());
        }
        router.route().handler(corsHandler);

        router.route().handler(BodyHandler.create().setBodyLimit(10 * 1024 * 1024));

        // Security headers
        router.route().handler(ctx -> {
            ctx.response().headers()
                    .add("X-Content-Type-Options", "nosniff")
                    .add("X-Frame-Options", "DENY")
                    .add("Referrer-Policy", "strict-origin-when-cross-origin");
            ctx.next();
        });

        // 认证路由（无需 Session）
        authApiHandler.registerPublicRoutes(router, API);

        // Session 路由与鉴权中间件
        sessionApiHandler.registerRoutes(router, API);

        registerUserRoutes(router);
        registerAccountRoutes(router);
        registerMailRoutes(router);

        // 统一异常处理
        router.route().failureHandler(this::handleFailure);
        return router;
    }

    // ===== 当前用户资料路由 =====

    private void registerUserRoutes(Router router) {
        userApiHandler.registerRoutes(router, API);
    }

    // ===== 账号路由 =====

    private void registerAccountRoutes(Router router) {
        accountApiHandler.registerRoutes(router, API);
    }

    // ===== 邮件路由 =====

    private void registerMailRoutes(Router router) {
        mailApiHandler.registerRoutes(router, API);
    }

    /** 全局异常处理：未被业务捕获的异常映射为 500。 */
    private void handleFailure(RoutingContext ctx) {
        Throwable t = ctx.failure();
        int status = ctx.statusCode() > 0 ? ctx.statusCode() : 500;
        String message;
        if (t != null && t.getMessage() != null) {
            // Sanitize: only filter messages that look like Java stack traces or class references
            String msg = t.getMessage();
            // Filter Java exception patterns: class names (com.xxx.Yyy), file paths (.java:xx), stack traces
            if (msg.matches(".*\\b(com|org|net|io|java|javax)\\.[a-zA-Z]+\\..*")
                    || msg.matches(".*\\.java:\\d+.*")
                    || msg.contains("at com.maildock.") || msg.contains("at java.")) {
                message = "服务器内部错误";
            } else {
                message = msg;
            }
        } else {
            message = "服务器内部错误";
        }
        if (!ctx.response().ended()) {
            ctx.response()
                    .setStatusCode(status)
                    .putHeader("Content-Type", "application/json; charset=utf-8")
                    .end(new io.vertx.core.json.JsonObject().put("error", status).put("message", message).encode());
        }
    }
}
