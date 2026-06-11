package com.maildock.web;

import com.maildock.model.Account;
import com.maildock.model.Attachment;
import com.maildock.model.Message;
import com.maildock.model.User;
import com.maildock.repository.AccountRepository;
import com.maildock.service.AccountService;
import com.maildock.service.AuthService;
import com.maildock.service.LinuxDoOAuthService;
import com.maildock.service.MailQueryService;
import com.maildock.service.MailSyncService;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;

import java.time.Duration;
import java.util.Optional;

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
    private static final String SESSION_COOKIE = "maildock_session";

    private final Vertx vertx;
    private final AuthService authService;
    private final LinuxDoOAuthService linuxDoOAuthService;
    private final AccountService accountService;
    private final MailSyncService mailSyncService;
    private final MailQueryService mailQueryService;
    private final boolean sessionCookieSecure;
    private final long sessionMaxAgeSeconds;

    public ApiRouter(Vertx vertx,
                     AuthService authService,
                     AccountService accountService,
                     MailSyncService mailSyncService,
                     MailQueryService mailQueryService) {
        this(vertx, authService, null, accountService, mailSyncService, mailQueryService,
                false, Duration.ofHours(24));
    }

    public ApiRouter(Vertx vertx,
                     AuthService authService,
                     LinuxDoOAuthService linuxDoOAuthService,
                     AccountService accountService,
                     MailSyncService mailSyncService,
                     MailQueryService mailQueryService,
                     boolean sessionCookieSecure,
                     Duration sessionTtl) {
        this.vertx = vertx;
        this.authService = authService;
        this.linuxDoOAuthService = linuxDoOAuthService;
        this.accountService = accountService;
        this.mailSyncService = mailSyncService;
        this.mailQueryService = mailQueryService;
        this.sessionCookieSecure = sessionCookieSecure;
        this.sessionMaxAgeSeconds = Math.max(1, sessionTtl.toSeconds());
    }

    /** 构建并返回配置好的 Router。 */
    public Router build() {
        Router router = Router.router(vertx);
        router.route().handler(BodyHandler.create());

        // 认证路由（无需 Session）
        router.post(API + "/auth/login").handler(this::handleLogin);
        router.get(API + "/auth/linuxdo/start").handler(this::handleLinuxdoStart);
        router.get(API + "/auth/linuxdo/callback").handler(this::handleLinuxdoCallback);

        // Cookie Session 鉴权中间件：保护该前缀下除登录 / OAuth 入口外的所有路由
        router.route(API + "/*").handler(this::authMiddleware);

        // 当前用户与登出（需已登录）
        router.get(API + "/auth/me").handler(this::handleMe);
        router.post(API + "/auth/logout").handler(this::handleLogout);

        registerAccountRoutes(router);
        registerMailRoutes(router);

        // 统一异常处理
        router.route().failureHandler(this::handleFailure);
        return router;
    }

    // ===== 认证 =====

    /** 邮箱密码登录：校验凭据，成功设置 Session Cookie 并返回当前用户。 */
    private void handleLogin(RoutingContext ctx) {
        JsonObject body = bodyAsJson(ctx);
        String email = body.getString("email");
        if (isBlank(email)) {
            email = body.getString("username");
        }
        String password = body.getString("password");
        if (isBlank(email) || isBlank(password)) {
            fail(ctx, 400, "邮箱和密码不能为空");
            return;
        }
        Optional<AuthService.LoginResult> login = authService.loginWithEmailPassword(email, password);
        if (login.isEmpty()) {
            fail(ctx, 401, "邮箱或密码错误");
            return;
        }
        setSessionCookie(ctx, login.get().sessionToken());
        json(ctx, 200, userJson(login.get().user()));
    }

    /** linux.do OAuth 登录入口：生成 state / PKCE 后跳转到授权地址。 */
    private void handleLinuxdoStart(RoutingContext ctx) {
        if (linuxDoOAuthService == null) {
            fail(ctx, 500, "linux.do OAuth 配置不完整");
            return;
        }
        try {
            LinuxDoOAuthService.StartResult start = linuxDoOAuthService.start();
            ctx.response()
                    .setStatusCode(302)
                    .putHeader("Location", start.redirectUrl())
                    .end();
        } catch (Exception e) {
            ctx.fail(e);
        }
    }

    /** linux.do OAuth 回调：换取用户信息、签发 session，再回到前端首页。 */
    private void handleLinuxdoCallback(RoutingContext ctx) {
        if (linuxDoOAuthService == null) {
            fail(ctx, 500, "linux.do OAuth 配置不完整");
            return;
        }
        String code = ctx.request().getParam("code");
        String state = ctx.request().getParam("state");
        vertx.executeBlocking(() -> linuxDoOAuthService.callback(code, state), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    if (ar.result().isEmpty()) {
                        fail(ctx, 400, "linux.do OAuth 登录失败");
                        return;
                    }
                    AuthService.LoginResult login = ar.result().get();
                    setSessionCookie(ctx, login.sessionToken());
                    ctx.response()
                            .setStatusCode(302)
                            .putHeader("Location", "/")
                            .end();
                });
    }

    /** 返回当前登录用户摘要。 */
    private void handleMe(RoutingContext ctx) {
        User user = ctx.get("currentUser");
        if (user == null) {
            fail(ctx, 401, "未认证或 Session 无效");
            return;
        }
        json(ctx, 200, userJson(user));
    }

    /** 登出：撤销当前 Session 并清理 Cookie。 */
    private void handleLogout(RoutingContext ctx) {
        String token = sessionToken(ctx);
        if (token != null) {
            authService.logout(token);
        }
        clearSessionCookie(ctx);
        ctx.response().setStatusCode(204).end();
    }

    /** Cookie Session 鉴权中间件：登录与 OAuth 入口放行，其余 /api 路由需有效 Session。 */
    private void authMiddleware(RoutingContext ctx) {
        String path = ctx.request().path();
        if (path.equals(API + "/auth/login")
                || path.equals(API + "/auth/linuxdo/start")
                || path.equals(API + "/auth/linuxdo/callback")) {
            ctx.next();
            return;
        }
        String token = sessionToken(ctx);
        Optional<User> user = authService.currentUser(token);
        if (user.isEmpty()) {
            fail(ctx, 401, "未认证或 Session 无效");
            return;
        }
        ctx.put("currentUserId", user.get().id());
        ctx.put("currentUser", user.get());
        ctx.next();
    }

    // ===== 账号路由 =====

    private void registerAccountRoutes(Router router) {
        router.get(API + "/accounts").handler(this::handleListAccounts);
        router.post(API + "/accounts").handler(this::handleCreateAccount);
        router.post(API + "/accounts/import").handler(this::handleImportAccounts);
        router.post(API + "/accounts/test-batch").handler(this::handleTestBatch);
        router.post(API + "/accounts/delete-batch").handler(this::handleDeleteBatch);
        router.post(API + "/accounts/:id/test").handler(this::handleTestConnection);
        router.delete(API + "/accounts/:id").handler(this::handleDeleteAccount);
    }

    /** 账号列表：分页 + 邮箱搜索 + 状态过滤 + 排序，返回 { total, items }（items 不含授权码）。 */
    private void handleListAccounts(RoutingContext ctx) {
        String email = ctx.request().getParam("email");
        String status = ctx.request().getParam("status");
        String sortBy = ctx.request().getParam("sortBy");
        String sortOrder = ctx.request().getParam("sortOrder");
        int page = parseIntOr(ctx.request().getParam("page"), 1);
        int size = parseIntOr(ctx.request().getParam("size"), 20);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.queryAccounts(userId, email, status, sortBy, sortOrder, page, size), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    AccountRepository.PagedAccounts paged = ar.result();
                    JsonArray items = new JsonArray();
                    for (Account a : paged.items()) {
                        items.add(accountToJson(a));
                    }
                    json(ctx, 200, new JsonObject()
                            .put("total", paged.total())
                            .put("items", items));
                });
    }

    /** 创建账号：加密授权码、入库（不自动测活，状态保持待检测），返回 201。 */
    private void handleCreateAccount(RoutingContext ctx) {
        JsonObject body = bodyAsJson(ctx);
        String email = body.getString("email");
        String authCode = body.getString("authCode");
        if (isBlank(email) || isBlank(authCode)) {
            fail(ctx, 400, "邮箱和授权码不能为空");
            return;
        }
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.createAccount(userId, email, authCode), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 201, accountToJson(ar.result()));
                });
    }

    /** 单个测活：返回 { ok, message }，并持久化测活状态。 */
    private void handleTestConnection(RoutingContext ctx) {
        long id = pathId(ctx);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.testConnection(userId, id), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    boolean ok = ar.result();
                    json(ctx, 200, new JsonObject()
                            .put("ok", ok)
                            .put("message", ok ? "连接成功" : "连接失败"));
                });
    }

    /** 批量测活：body { ids: [...] }，不传 ids 则测试全部。 */
    private void handleTestBatch(RoutingContext ctx) {
        JsonObject body = bodyAsJson(ctx);
        JsonArray idsArr = body.getJsonArray("ids");
        final java.util.List<Long> ids;
        if (idsArr == null) {
            ids = null;
        } else {
            ids = new java.util.ArrayList<>();
            for (int i = 0; i < idsArr.size(); i++) {
                ids.add(idsArr.getLong(i));
            }
        }
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.testBatch(userId, ids), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    JsonArray results = new JsonArray();
                    for (AccountService.TestResult r : ar.result()) {
                        results.add(new JsonObject()
                                .put("id", r.id())
                                .put("email", r.email())
                                .put("ok", r.ok())
                                .put("message", r.message())
                                .put("latencyMs", r.latencyMs()));
                    }
                    json(ctx, 200, new JsonObject().put("results", results));
                });
    }

    /** 批量导入 txt：body 为纯文本，每行 "账号 授权码"。 */
    private void handleImportAccounts(RoutingContext ctx) {
        String text = ctx.body().asString();
        if (text == null) {
            text = "";
        }
        boolean test = "true".equalsIgnoreCase(ctx.request().getParam("test"));
        boolean overwrite = "true".equalsIgnoreCase(ctx.request().getParam("overwrite"));
        final String content = text;
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.importFromText(userId, content, test, overwrite), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    AccountService.ImportResult result = ar.result();
                    JsonArray results = new JsonArray();
                    for (AccountService.ImportItem item : result.results()) {
                        results.add(new JsonObject()
                                .put("email", item.email())
                                .put("status", item.status())
                                .put("message", item.message()));
                    }
                    json(ctx, 200, new JsonObject()
                            .put("total", result.total())
                            .put("success", result.success())
                            .put("failed", result.failed())
                            .put("skipped", result.skipped())
                            .put("results", results));
                });
    }

    /** 删除账号：级联清理邮件 / 附件，返回 204。 */
    private void handleDeleteAccount(RoutingContext ctx) {
        long id = pathId(ctx);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> {
            accountService.deleteAccount(userId, id);
            return null;
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                failFromThrowable(ctx, ar.cause());
                return;
            }
            ctx.response().setStatusCode(204).end();
        });
    }

    /** 批量删除账号：body { ids: [...] }，级联清理邮件 / 附件，返回 { deleted }。 */
    private void handleDeleteBatch(RoutingContext ctx) {
        JsonObject body = bodyAsJson(ctx);
        JsonArray idsArr = body.getJsonArray("ids");
        if (idsArr == null || idsArr.isEmpty()) {
            fail(ctx, 400, "ids 不能为空");
            return;
        }
        java.util.List<Long> ids = new java.util.ArrayList<>();
        for (int i = 0; i < idsArr.size(); i++) {
            ids.add(idsArr.getLong(i));
        }
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> accountService.deleteBatch(userId, ids), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 200, new JsonObject().put("deleted", ar.result()));
                });
    }

    /** 把账号序列化为 JSON，刻意排除授权码字段，绝不外泄。 */
    private JsonObject accountToJson(Account a) {
        return new JsonObject()
                .put("id", a.id())
                .put("email", a.email())
                .put("imapHost", a.imapHost())
                .put("imapPort", a.imapPort())
                .put("lastUid", a.lastUid())
                .put("lastSyncAt", a.lastSyncAt())
                .put("lastTestAt", a.lastTestAt())
                .put("lastTestOk", a.lastTestOk())
                .put("lastTestMsg", a.lastTestMsg());
    }

    // ===== 邮件路由 =====

    private void registerMailRoutes(Router router) {
        router.post(API + "/accounts/:id/refresh").handler(this::handleRefresh);
        router.get(API + "/accounts/:id/messages").handler(this::handleListMessages);
        router.get(API + "/messages/:id").handler(this::handleMessageDetail);
        router.get(API + "/messages/:id/attachments/:attId").handler(this::handleDownloadAttachment);
        router.patch(API + "/messages/:id/read").handler(this::handleMarkRead);
    }

    /** 刷新某账号：触发增量同步，返回 { newCount, syncedAt }。 */
    private void handleRefresh(RoutingContext ctx) {
        long id = pathId(ctx);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailSyncService.refresh(userId, id), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    json(ctx, 200, new JsonObject()
                            .put("newCount", ar.result())
                            .put("syncedAt", System.currentTimeMillis()));
                });
    }

    /** 邮件列表：分页返回摘要（不含正文）与总数。 */
    private void handleListMessages(RoutingContext ctx) {
        long id = pathId(ctx);
        int page = parseIntOr(ctx.request().getParam("page"), 1);
        int size = parseIntOr(ctx.request().getParam("size"), 20);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailQueryService.list(userId, id, page, size), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    MailQueryService.PagedMessages paged = ar.result();
                    JsonArray items = new JsonArray();
                    for (Message m : paged.items()) {
                        items.add(messageSummaryJson(m));
                    }
                    json(ctx, 200, new JsonObject()
                            .put("total", paged.total())
                            .put("items", items));
                });
    }

    /** 邮件详情：返回正文与附件列表，不存在返回 404。 */
    private void handleMessageDetail(RoutingContext ctx) {
        long id = pathId(ctx);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailQueryService.getDetail(userId, id), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    if (ar.result().isEmpty()) {
                        fail(ctx, 404, "邮件不存在");
                        return;
                    }
                    MailQueryService.MessageDetail detail = ar.result().get();
                    json(ctx, 200, messageDetailJson(detail));
                });
    }

    /** 下载附件：校验归属后返回二进制流。 */
    private void handleDownloadAttachment(RoutingContext ctx) {
        long messageId = pathId(ctx);
        long attId = parseIntOr(ctx.pathParam("attId"), -1);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> mailQueryService.loadAttachment(userId, messageId, attId), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        failFromThrowable(ctx, ar.cause());
                        return;
                    }
                    ctx.response()
                            .setStatusCode(200)
                            .putHeader("Content-Type", "application/octet-stream")
                            .end(io.vertx.core.buffer.Buffer.buffer(ar.result()));
                });
    }

    /** 标记已读 / 未读。 */
    private void handleMarkRead(RoutingContext ctx) {
        long id = pathId(ctx);
        JsonObject body = bodyAsJson(ctx);
        boolean read = body.getBoolean("read", true);
        long userId = currentUserId(ctx);
        vertx.executeBlocking(() -> {
            mailQueryService.markRead(userId, id, read);
            return null;
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                failFromThrowable(ctx, ar.cause());
                return;
            }
            json(ctx, 200, new JsonObject().put("id", id).put("read", read));
        });
    }

    /** 邮件摘要 JSON：用于列表，刻意不含正文以减小传输量。 */
    private JsonObject messageSummaryJson(Message m) {
        return new JsonObject()
                .put("id", m.id())
                .put("accountId", m.accountId())
                .put("uid", m.uid())
                .put("subject", m.subject())
                .put("fromAddr", m.fromAddr())
                .put("toAddr", m.toAddr())
                .put("sentAt", m.sentAt())
                .put("receivedAt", m.receivedAt())
                .put("hasAttach", m.hasAttach())
                .put("isRead", m.isRead());
    }

    /** 邮件详情 JSON：含正文与附件列表。 */
    private JsonObject messageDetailJson(MailQueryService.MessageDetail detail) {
        Message m = detail.message();
        JsonArray atts = new JsonArray();
        for (Attachment a : detail.attachments()) {
            atts.add(new JsonObject()
                    .put("id", a.id())
                    .put("filename", a.filename())
                    .put("contentType", a.contentType())
                    .put("size", a.size()));
        }
        return new JsonObject()
                .put("id", m.id())
                .put("accountId", m.accountId())
                .put("uid", m.uid())
                .put("messageId", m.messageId())
                .put("subject", m.subject())
                .put("fromAddr", m.fromAddr())
                .put("toAddr", m.toAddr())
                .put("ccAddr", m.ccAddr())
                .put("sentAt", m.sentAt())
                .put("receivedAt", m.receivedAt())
                .put("bodyText", m.bodyText())
                .put("bodyHtml", m.bodyHtml())
                .put("hasAttach", m.hasAttach())
                .put("isRead", m.isRead())
                .put("attachments", atts);
    }

    // ===== 辅助方法 =====

    /** 从 Cookie 头中提取 session token，无则返回 null。 */
    private String sessionToken(RoutingContext ctx) {
        String header = ctx.request().getHeader("Cookie");
        if (header == null || header.isBlank()) {
            return null;
        }
        String[] parts = header.split(";");
        for (String part : parts) {
            String cookie = part.strip();
            String prefix = SESSION_COOKIE + "=";
            if (cookie.startsWith(prefix)) {
                String token = cookie.substring(prefix.length()).strip();
                return token.isEmpty() ? null : token;
            }
        }
        return null;
    }

    private void setSessionCookie(RoutingContext ctx, String token) {
        ctx.response().putHeader("Set-Cookie", sessionCookieValue(token, sessionMaxAgeSeconds));
    }

    private void clearSessionCookie(RoutingContext ctx) {
        ctx.response().putHeader("Set-Cookie", sessionCookieValue("", 0));
    }

    private String sessionCookieValue(String token, long maxAgeSeconds) {
        StringBuilder cookie = new StringBuilder()
                .append(SESSION_COOKIE).append("=").append(token == null ? "" : token)
                .append("; Path=/")
                .append("; Max-Age=").append(maxAgeSeconds)
                .append("; HttpOnly")
                .append("; SameSite=Lax");
        if (sessionCookieSecure) {
            cookie.append("; Secure");
        }
        return cookie.toString();
    }

    private long currentUserId(RoutingContext ctx) {
        Long userId = ctx.get("currentUserId");
        if (userId == null) {
            throw new IllegalStateException("当前用户不存在");
        }
        return userId;
    }

    private JsonObject userJson(User user) {
        return new JsonObject()
                .put("id", user.id())
                .put("primaryEmail", user.primaryEmail())
                .put("displayName", user.displayName())
                .put("avatarUrl", user.avatarUrl())
                .put("lastLoginAt", user.lastLoginAt());
    }

    /** 安全地读取请求体为 JSON，无体时返回空对象。 */
    private JsonObject bodyAsJson(RoutingContext ctx) {
        try {
            JsonObject body = ctx.body().asJsonObject();
            return body != null ? body : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    /** 以指定状态码返回 JSON 响应。 */
    private void json(RoutingContext ctx, int status, JsonObject body) {
        ctx.response()
                .setStatusCode(status)
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(body.encode());
    }

    /** 以错误状态码结束请求，响应体为统一的 JSON 错误结构。 */
    private void fail(RoutingContext ctx, int status, String message) {
        json(ctx, status, new JsonObject().put("error", status).put("message", message));
    }

    private void failFromThrowable(RoutingContext ctx, Throwable cause) {
        if (isNotFound(cause)) {
            fail(ctx, 404, cause.getMessage());
            return;
        }
        ctx.fail(cause);
    }

    private boolean isNotFound(Throwable t) {
        String message = t != null ? t.getMessage() : null;
        return message != null && (message.contains("不存在") || message.contains("不属于"));
    }

    /** 全局异常处理：未被业务捕获的异常映射为 500。 */
    private void handleFailure(RoutingContext ctx) {
        Throwable t = ctx.failure();
        int status = ctx.statusCode() > 0 ? ctx.statusCode() : 500;
        String message = t != null && t.getMessage() != null ? t.getMessage() : "服务器内部错误";
        if (!ctx.response().ended()) {
            json(ctx, status, new JsonObject().put("error", status).put("message", message));
        }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** 从路径参数 :id 解析为 long，非法时抛异常（由 failureHandler 统一处理）。 */
    private long pathId(RoutingContext ctx) {
        return Long.parseLong(ctx.pathParam("id"));
    }

    /** 把字符串解析为 int，为空或非法时返回默认值。 */
    private int parseIntOr(String s, int defaultValue) {
        if (s == null || s.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(s.strip());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
