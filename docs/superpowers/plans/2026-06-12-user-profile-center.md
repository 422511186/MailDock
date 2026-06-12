# 个人中心与头像下拉菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 header 中间的用户名与右侧登出按钮替换为右上角头像 + 下拉菜单，并新增个人中心页面（资料展示、改显示名、改密码）。

**Architecture:** 后端在 `/auth/me` 与登录响应的用户 JSON 中新增 `hasPassword` 字段，新增 `PATCH /api/v1/users/me`（改显示名）与 `POST /api/v1/users/me/password`（改密码）两条受保护路由，复用现有 `AuthService` / `UserRepository` / `IdentityRepository`，不新增 Service。前端在 `api/client.ts` 扩展类型与方法，新增 `UserMenu` 组件与 `ProfilePage` 页面，并在 `App.tsx` 的 `View` 状态机里挂载 profile 视图。

**Tech Stack:** 后端 JDK 21 + Vert.x + SQLite + jBCrypt + JUnit5/VertxExtension；前端 React + TypeScript + Tailwind + vitest + @testing-library/react。

**设计依据：** `docs/superpowers/specs/2026-06-12-user-profile-center-design.md`

**约束提醒（务必遵守）：**
- 阻塞操作（JDBC、BCrypt）必须包在 `vertx.executeBlocking(..., false)`，写操作经 `database.runWrite(...)`（DAO 内部已封装）。
- 新路由位于 `authMiddleware` 之后，操作对象固定取 `ctx.get("currentUserId")`，不接受 body/路径中的他人 userId。
- 修改密码仅对 `email_password` 用户开放；linux.do 用户（无该身份）返回 403。
- 强制 TDD：每个任务先写失败测试，再写最小实现。

---

## File Structure

后端（`backend/src/main/java/com/maildock`）：
- Modify `repository/IdentityRepository.java` — 新增 `findByUserAndProvider`
- Modify `service/AuthService.java` — 新增 `hasPassword`、`changePassword`
- Modify `web/ApiRouter.java` — `userJson` 加 `hasPassword`、注册 `registerUserRoutes`、新增两个 handler
- Test `repository/IdentityRepositoryTest.java`、`service/AuthServiceTest.java`、新建 `web/UserRouteTest.java`

前端（`frontend/src`）：
- Modify `api/client.ts` — `CurrentUser` 加 `hasPassword`，新增 `updateDisplayName`、`changePassword`
- Create `components/UserMenu.tsx` + `components/UserMenu.test.tsx`
- Create `pages/ProfilePage.tsx` + `pages/ProfilePage.test.tsx`
- Modify `App.tsx` — `View` 加 profile、header 渲染 `UserMenu`、删除中间用户名 span
- Modify `App.test.tsx` — 更新 user 工厂与登出/用户名相关用例
- Modify `styles.css` — 头像、下拉菜单、个人中心页样式

---

## Task 1: IdentityRepository 按用户与 provider 查询

**Files:**
- Modify: `backend/src/main/java/com/maildock/repository/IdentityRepository.java`
- Test: `backend/src/test/java/com/maildock/repository/IdentityRepositoryTest.java`

- [ ] **Step 1: 写失败测试**

在 `IdentityRepositoryTest.java` 的最后一个 `}` 之前追加：

```java
    @Test
    void findByUserAndProviderReturnsMatchingIdentity() {
        User user = userRepo.insert("alice@example.com", "Alice", null);
        identityRepo.insert(user.id(), "email_password", "alice@example.com", "hash-1");

        UserIdentity found = identityRepo.findByUserAndProvider(user.id(), "email_password").orElseThrow();

        assertEquals("email_password", found.provider());
        assertEquals("hash-1", found.secretHash());
    }

    @Test
    void findByUserAndProviderReturnsEmptyWhenNoSuchProvider() {
        User user = userRepo.insert("bob@example.com", "Bob", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertTrue(identityRepo.findByUserAndProvider(user.id(), "email_password").isEmpty());
    }
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=IdentityRepositoryTest`
Expected: 编译失败，`findByUserAndProvider` 方法不存在。

- [ ] **Step 3: 实现最小代码**

在 `IdentityRepository.java` 的 `findByProviderUid` 方法之后插入：

```java
    public Optional<UserIdentity> findByUserAndProvider(long userId, String provider) {
        String sql = "SELECT * FROM user_identity WHERE user_id = ? AND provider = ?";
        try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setString(2, provider);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        } catch (SQLException e) {
            throw new RuntimeException("按 user/provider 查询用户身份失败: " + userId + "/" + provider, e);
        }
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=IdentityRepositoryTest`
Expected: PASS（全部用例通过）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/maildock/repository/IdentityRepository.java backend/src/test/java/com/maildock/repository/IdentityRepositoryTest.java
git commit -m "feat: IdentityRepository 支持按 user+provider 查询身份"
```

---

## Task 2: AuthService.hasPassword

**Files:**
- Modify: `backend/src/main/java/com/maildock/service/AuthService.java`
- Test: `backend/src/test/java/com/maildock/service/AuthServiceTest.java`

- [ ] **Step 1: 写失败测试**

在 `AuthServiceTest.java` 的最后一个 `}` 之前追加：

```java
    @Test
    void hasPasswordTrueForEmailPasswordUser() {
        service.ensureDefaultEmailUser("alice@example.com", "init-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertTrue(service.hasPassword(userId));
    }

    @Test
    void hasPasswordFalseForLinuxdoUser() {
        User user = userRepo.insert("linux@example.com", "Linux", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertFalse(service.hasPassword(user.id()));
    }
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: 编译失败，`hasPassword` 方法不存在。

- [ ] **Step 3: 实现最小代码**

在 `AuthService.java` 的 `currentUser` 方法之后插入：

```java
    /** 判断用户是否拥有可修改的邮箱密码身份（存在 email_password 且密码哈希非空）。 */
    public boolean hasPassword(long userId) {
        return identityRepo.findByUserAndProvider(userId, EMAIL_PASSWORD_PROVIDER)
                .map(identity -> !isBlank(identity.secretHash()))
                .orElse(false);
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/maildock/service/AuthService.java backend/src/test/java/com/maildock/service/AuthServiceTest.java
git commit -m "feat: AuthService.hasPassword 判断用户是否可改密"
```

---

## Task 3: AuthService.changePassword

**Files:**
- Modify: `backend/src/main/java/com/maildock/service/AuthService.java`
- Test: `backend/src/test/java/com/maildock/service/AuthServiceTest.java`

约定返回值用枚举区分失败原因，便于 handler 映射状态码。

- [ ] **Step 1: 写失败测试**

在 `AuthServiceTest.java` 的最后一个 `}` 之前追加：

```java
    @Test
    void changePasswordSucceedsWithCorrectOldPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "old-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertEquals(AuthService.ChangePasswordResult.OK,
                service.changePassword(userId, "old-pass", "new-pass-1"));

        // 旧密码失效，新密码可登录
        assertTrue(service.loginWithEmailPassword("alice@example.com", "old-pass").isEmpty());
        assertTrue(service.loginWithEmailPassword("alice@example.com", "new-pass-1").isPresent());
    }

    @Test
    void changePasswordRejectsWrongOldPassword() {
        service.ensureDefaultEmailUser("alice@example.com", "old-pass");
        long userId = identityRepo.findByProviderUid("email_password", "alice@example.com")
                .orElseThrow().userId();

        assertEquals(AuthService.ChangePasswordResult.WRONG_OLD_PASSWORD,
                service.changePassword(userId, "wrong", "new-pass-1"));
    }

    @Test
    void changePasswordRejectsLinuxdoUserWithoutPassword() {
        User user = userRepo.insert("linux@example.com", "Linux", null);
        identityRepo.insert(user.id(), "linuxdo", "42", null);

        assertEquals(AuthService.ChangePasswordResult.NO_PASSWORD_IDENTITY,
                service.changePassword(user.id(), "anything", "new-pass-1"));
    }
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: 编译失败，`ChangePasswordResult` 与 `changePassword` 不存在。

- [ ] **Step 3: 实现最小代码**

在 `AuthService.java` 的 `LoginResult` record 之后插入枚举：

```java
    public enum ChangePasswordResult {
        OK,
        WRONG_OLD_PASSWORD,
        NO_PASSWORD_IDENTITY
    }
```

在 `hasPassword` 方法之后插入：

```java
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=AuthServiceTest`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/maildock/service/AuthService.java backend/src/test/java/com/maildock/service/AuthServiceTest.java
git commit -m "feat: AuthService.changePassword 校验旧密码并改密"
```

---

## Task 4: 用户路由（hasPassword 字段 + 改名 + 改密）

**Files:**
- Modify: `backend/src/main/java/com/maildock/web/ApiRouter.java`
- Test: `backend/src/test/java/com/maildock/web/UserRouteTest.java`（新建）

### 4a. userJson 增加 hasPassword

- [ ] **Step 1: 写失败测试（/auth/me 含 hasPassword）**

新建 `backend/src/test/java/com/maildock/web/UserRouteTest.java`：

```java
package com.maildock.web;

import com.maildock.repository.Database;
import com.maildock.repository.IdentityRepository;
import com.maildock.repository.UserRepository;
import com.maildock.security.SessionStore;
import com.maildock.service.AuthService;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.client.WebClient;
import io.vertx.junit5.VertxExtension;
import io.vertx.junit5.VertxTestContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(VertxExtension.class)
class UserRouteTest {

    private Vertx vertx;
    private HttpServer server;
    private WebClient client;
    private Database db;
    private Path dbFile;
    private int port;
    private UserRepository userRepo;
    private IdentityRepository identityRepo;
    private AuthService authService;

    @BeforeEach
    void setUp(VertxTestContext ctx) throws Exception {
        vertx = Vertx.vertx();
        dbFile = Files.createTempFile("maildock-user-route", ".db");
        db = new Database("jdbc:sqlite:" + dbFile.toAbsolutePath());
        db.initSchema();

        userRepo = new UserRepository(db);
        identityRepo = new IdentityRepository(db);
        SessionStore sessionStore = new SessionStore();
        authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(1));
        authService.ensureDefaultEmailUser("alice@example.com", "init-pass");

        Router router = new ApiRouter(vertx, authService, null, null, null).build();
        server = vertx.createHttpServer().requestHandler(router);
        server.listen(0).onComplete(ctx.succeeding(s -> {
            port = s.actualPort();
            client = WebClient.create(vertx);
            ctx.completeNow();
        }));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) server.close();
        if (vertx != null) vertx.close();
        if (db != null) db.close();
        Files.deleteIfExists(dbFile);
    }

    /** 登录后拿到 Cookie，供后续受保护请求使用。 */
    private io.vertx.core.Future<String> loginCookie() {
        return client.post(port, "localhost", ApiRouter.API + "/auth/login")
                .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
                .map(resp -> resp.getHeader("Set-Cookie"));
    }

    @Test
    void meContainsHasPasswordTrueForEmailUser(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.get(port, "localhost", ApiRouter.API + "/auth/me")
                        .putHeader("Cookie", cookie).send())
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    assertTrue(resp.bodyAsJsonObject().getBoolean("hasPassword"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
}
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=UserRouteTest#meContainsHasPasswordTrueForEmailUser`
Expected: FAIL，`getBoolean("hasPassword")` 为 null（断言失败）。

- [ ] **Step 3: 实现 userJson 改造**

在 `ApiRouter.java` 中，将 `userJson(User user)` 改为接收 `hasPassword` 参数：

```java
    private JsonObject userJson(User user, boolean hasPassword) {
        return new JsonObject()
                .put("id", user.id())
                .put("primaryEmail", user.primaryEmail())
                .put("displayName", user.displayName())
                .put("avatarUrl", user.avatarUrl())
                .put("lastLoginAt", user.lastLoginAt())
                .put("hasPassword", hasPassword);
    }
```

更新 `handleLogin`：邮箱密码登录成功的用户必然有密码，直接传 `true`：

```java
        setSessionCookie(ctx, login.get().sessionToken());
        json(ctx, 200, userJson(login.get().user(), true));
```

更新 `handleMe`：在 `executeBlocking` 中查 `hasPassword`，避免事件循环阻塞：

```java
    private void handleMe(RoutingContext ctx) {
        User user = ctx.get("currentUser");
        if (user == null) {
            fail(ctx, 401, "未认证或 Session 无效");
            return;
        }
        vertx.executeBlocking(() -> authService.hasPassword(user.id()), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    json(ctx, 200, userJson(user, ar.result()));
                });
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=UserRouteTest#meContainsHasPasswordTrueForEmailUser`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/main/java/com/maildock/web/ApiRouter.java backend/src/test/java/com/maildock/web/UserRouteTest.java
git commit -m "feat: 用户 JSON 增加 hasPassword 字段"
```

### 4b. PATCH /users/me 改显示名

- [ ] **Step 1: 写失败测试**

在 `UserRouteTest.java` 的最后一个 `}` 之前追加：

```java
    @Test
    void updateDisplayNameSucceeds(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.patch(port, "localhost", ApiRouter.API + "/users/me")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject().put("displayName", "新名字")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(200, resp.statusCode());
                    JsonObject body = resp.bodyAsJsonObject();
                    assertEquals("新名字", body.getString("displayName"));
                    assertEquals("alice@example.com", body.getString("primaryEmail"));
                    assertTrue(body.getBoolean("hasPassword"));
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void updateDisplayNameRejectsBlank(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.patch(port, "localhost", ApiRouter.API + "/users/me")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject().put("displayName", "  ")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void updateDisplayNameWithoutCookieReturns401(VertxTestContext ctx) throws Exception {
        client.patch(port, "localhost", ApiRouter.API + "/users/me")
                .sendJsonObject(new JsonObject().put("displayName", "x"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(401, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=UserRouteTest#updateDisplayNameSucceeds`
Expected: FAIL，404（路由未注册）。

- [ ] **Step 3: 实现路由与 handler**

在 `ApiRouter.build()` 中，`router.post(API + "/auth/logout")...` 之后插入：

```java
        registerUserRoutes(router);
```

新增 `registerUserRoutes` 方法（放在 `registerAccountRoutes` 之前）：

```java
    private void registerUserRoutes(Router router) {
        router.patch(API + "/users/me").handler(this::handleUpdateProfile);
        router.post(API + "/users/me/password").handler(this::handleChangePassword);
    }

    /** 更新当前用户显示名，仅改 display_name，保留 email/avatar 不被覆盖。 */
    private void handleUpdateProfile(RoutingContext ctx) {
        User user = ctx.get("currentUser");
        JsonObject body = bodyAsJson(ctx);
        String displayName = body.getString("displayName");
        if (isBlank(displayName)) {
            fail(ctx, 400, "显示名不能为空");
            return;
        }
        if (displayName.strip().length() > 64) {
            fail(ctx, 400, "显示名过长");
            return;
        }
        String newName = displayName.strip();
        vertx.executeBlocking(() -> {
            userRepoUpdateProfile(user, newName);
            User updated = ctx.<User>get("currentUser"); // 占位，下面 Step 用真实查询替换
            return updated;
        }, false);
    }
```

> 注意：上面 handler 留有占位，下一步用完整实现替换。先建立路由骨架让 401/404 行为正确。

- [ ] **Step 4: 用完整实现替换 handler**

`ApiRouter` 当前没有 `UserRepository` 字段。改密/改名需要它。在类字段区新增并通过 `AuthService` 暴露的方法完成更新，避免给 `ApiRouter` 增加新依赖。

在 `AuthService.java` 新增改名方法（在 `changePassword` 之后）：

```java
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
```

为该方法补 `AuthServiceTest` 用例（在 `AuthServiceTest.java` 末尾追加）：

```java
    @Test
    void updateDisplayNameKeepsEmailAndAvatar() {
        User user = userRepo.insert("alice@example.com", "Alice", "http://a/x.png");
        User updated = service.updateDisplayName(user.id(), "新名").orElseThrow();

        assertEquals("新名", updated.displayName());
        assertEquals("alice@example.com", updated.primaryEmail());
        assertEquals("http://a/x.png", updated.avatarUrl());
    }
```

把 `handleUpdateProfile` 替换为完整实现：

```java
    /** 更新当前用户显示名，仅改 display_name，保留 email/avatar 不被覆盖。 */
    private void handleUpdateProfile(RoutingContext ctx) {
        long userId = currentUserId(ctx);
        JsonObject body = bodyAsJson(ctx);
        String displayName = body.getString("displayName");
        if (isBlank(displayName)) {
            fail(ctx, 400, "显示名不能为空");
            return;
        }
        String trimmed = displayName.strip();
        if (trimmed.length() > 64) {
            fail(ctx, 400, "显示名过长");
            return;
        }
        vertx.executeBlocking(() -> {
            User updated = authService.updateDisplayName(userId, trimmed).orElseThrow();
            boolean hasPassword = authService.hasPassword(userId);
            return userJson(updated, hasPassword);
        }, false).onComplete(ar -> {
            if (ar.failed()) {
                ctx.fail(ar.cause());
                return;
            }
            json(ctx, 200, ar.result());
        });
    }
```

> 删除 Step 3 里临时引用的 `userRepoUpdateProfile`（它从未真正定义，仅为骨架占位说明）。最终 `ApiRouter` 不新增字段，全部通过 `authService` 完成。

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=UserRouteTest,AuthServiceTest`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/main/java/com/maildock/web/ApiRouter.java backend/src/main/java/com/maildock/service/AuthService.java backend/src/test/java/com/maildock/web/UserRouteTest.java backend/src/test/java/com/maildock/service/AuthServiceTest.java
git commit -m "feat: PATCH /users/me 更新显示名"
```

### 4c. POST /users/me/password 改密

- [ ] **Step 1: 写失败测试**

在 `UserRouteTest.java` 末尾追加：

```java
    @Test
    void changePasswordSucceedsReturns204(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject()
                                .put("oldPassword", "init-pass")
                                .put("newPassword", "new-pass-1")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(204, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void changePasswordRejectsShortNewPassword(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject()
                                .put("oldPassword", "init-pass")
                                .put("newPassword", "123")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void changePasswordRejectsWrongOldPassword(VertxTestContext ctx) throws Exception {
        loginCookie()
                .compose(cookie -> client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                        .putHeader("Cookie", cookie)
                        .sendJsonObject(new JsonObject()
                                .put("oldPassword", "wrong")
                                .put("newPassword", "new-pass-1")))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(400, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }

    @Test
    void changePasswordRejectsLinuxdoUserWith403(VertxTestContext ctx) throws Exception {
        // 直接造一个 linux.do 用户并签发 session
        com.maildock.model.User linux = userRepo.insert("linux@example.com", "Linux", null);
        identityRepo.insert(linux.id(), "linuxdo", "99", null);
        String token = new SessionStoreAccessor().issueFor(authService, linux.id());
        String cookie = "maildock_session=" + token;

        client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject()
                        .put("oldPassword", "x")
                        .put("newPassword", "new-pass-1"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(403, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
```

> `SessionStoreAccessor` 不存在——改用更简单的方式：给 linux.do 用户签发 session。`AuthService` 没有公开「直接为 userId 签发 session」的方法，但 `loginWithLinuxdoUser` 可以。把上面 `changePasswordRejectsLinuxdoUserWith403` 用例改为通过 OAuth 登录路径造 session：

```java
    @Test
    void changePasswordRejectsLinuxdoUserWith403(VertxTestContext ctx) throws Exception {
        // 通过 linux.do 登录路径造一个无密码用户的 session
        AuthService.LoginResult login = authService.loginWithLinuxdoUser(
                new com.maildock.service.OAuthClient.OAuthUser("99", "linux@example.com", "Linux", null))
                .orElseThrow();
        String cookie = "maildock_session=" + login.sessionToken();

        client.post(port, "localhost", ApiRouter.API + "/users/me/password")
                .putHeader("Cookie", cookie)
                .sendJsonObject(new JsonObject()
                        .put("oldPassword", "x")
                        .put("newPassword", "new-pass-1"))
                .onComplete(ctx.succeeding(resp -> ctx.verify(() -> {
                    assertEquals(403, resp.statusCode());
                    ctx.completeNow();
                })));
        assertTrue(ctx.awaitCompletion(10, TimeUnit.SECONDS));
    }
```

> 使用上面这版（删掉引用 `SessionStoreAccessor` 的那版）。

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && mvn test -Dtest=UserRouteTest#changePasswordSucceedsReturns204`
Expected: FAIL，404（路由未注册）。

- [ ] **Step 3: 实现 handler**

在 `ApiRouter.java` 的 `handleUpdateProfile` 之后插入（路由已在 4b 的 `registerUserRoutes` 注册）：

```java
    /** 修改当前用户密码：校验新密码长度 → 校验旧密码 → 写新哈希。仅邮箱密码用户可用。 */
    private void handleChangePassword(RoutingContext ctx) {
        long userId = currentUserId(ctx);
        JsonObject body = bodyAsJson(ctx);
        String oldPassword = body.getString("oldPassword");
        String newPassword = body.getString("newPassword");
        if (isBlank(oldPassword) || isBlank(newPassword)) {
            fail(ctx, 400, "原密码和新密码不能为空");
            return;
        }
        if (newPassword.length() < 6) {
            fail(ctx, 400, "新密码至少 6 位");
            return;
        }
        vertx.executeBlocking(() -> authService.changePassword(userId, oldPassword, newPassword), false)
                .onComplete(ar -> {
                    if (ar.failed()) {
                        ctx.fail(ar.cause());
                        return;
                    }
                    switch (ar.result()) {
                        case OK -> ctx.response().setStatusCode(204).end();
                        case WRONG_OLD_PASSWORD -> fail(ctx, 400, "原密码错误");
                        case NO_PASSWORD_IDENTITY -> fail(ctx, 403, "当前账号未设置密码，无法修改");
                    }
                });
    }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && mvn test -Dtest=UserRouteTest`
Expected: PASS（全部用例）。

- [ ] **Step 5: 跑全量后端测试，确认无回归**

Run: `cd backend && mvn test`
Expected: PASS（特别是 `AuthRouteTest` 不受 userJson 签名变更影响）。

- [ ] **Step 6: 提交**

```bash
git add backend/src/main/java/com/maildock/web/ApiRouter.java backend/src/test/java/com/maildock/web/UserRouteTest.java
git commit -m "feat: POST /users/me/password 修改密码"
```

---

## Task 5: 前端 API 客户端扩展

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: 修改 `CurrentUser` 接口**

将 `CurrentUser` 改为：

```typescript
/** 当前登录用户摘要。 */
export interface CurrentUser {
  id: number;
  primaryEmail: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** 是否拥有可修改的邮箱密码（linux.do 用户为 false）。 */
  hasPassword: boolean;
}
```

- [ ] **Step 2: 新增两个方法**

在 `ApiClient` 类的 `logout()` 方法之后插入：

```typescript
  /** 更新当前用户显示名，返回更新后的用户。 */
  updateDisplayName(displayName: string): Promise<CurrentUser> {
    return this.request<CurrentUser>('/users/me', {
      method: 'PATCH',
      json: { displayName },
    });
  }

  /** 修改当前用户密码（仅邮箱密码用户可用）。 */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.request<void>('/users/me/password', {
      method: 'POST',
      json: { oldPassword, newPassword },
      raw: true,
    });
  }
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: 报错 `App.test.tsx`、`App.tsx` 等处 `CurrentUser` 缺 `hasPassword`（后续任务修复）。`client.ts` 本身无错。

> 此步骤无独立测试；不单独提交，与下一个使用它的任务一起验证。但为保持频繁提交，可先提交客户端改动：

```bash
git add frontend/src/api/client.ts
git commit -m "feat: 前端 API 客户端新增改名/改密与 hasPassword"
```

---

## Task 6: UserMenu 组件

**Files:**
- Create: `frontend/src/components/UserMenu.tsx`
- Test: `frontend/src/components/UserMenu.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/UserMenu.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from './UserMenu';
import type { CurrentUser } from '../api/client';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

describe('UserMenu', () => {
  it('无头像时显示显示名首字母', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('A');
  });

  it('无显示名时回退到邮箱首字母', () => {
    render(<UserMenu user={user({ displayName: null })} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('A');
  });

  it('点击头像展开菜单并显示用户名与邮箱', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('点击「个人资料」触发 onOpenProfile', () => {
    const onOpenProfile = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={onOpenProfile} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人资料' }));
    expect(onOpenProfile).toHaveBeenCalled();
  });

  it('点击「退出登录」触发 onLogout', () => {
    const onLogout = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('按 Esc 关闭菜单', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend && npx vitest run src/components/UserMenu.test.tsx`
Expected: FAIL，无法解析 `./UserMenu`。

- [ ] **Step 3: 实现组件**

新建 `frontend/src/components/UserMenu.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react';
import type { CurrentUser } from '../api/client';

interface UserMenuProps {
  /** 当前用户。 */
  user: CurrentUser;
  /** 进入个人中心。 */
  onOpenProfile: () => void;
  /** 退出登录。 */
  onLogout: () => void;
}

/** 取头像首字母：优先显示名，其次邮箱，再退化为 ?。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 右上角用户头像 + 下拉菜单。
 * 头像有 avatarUrl 时显示图片，否则显示首字母方块。
 * 下拉菜单含用户名/邮箱与菜单项：个人资料、修改密码、退出登录。
 */
export function UserMenu({ user, onOpenProfile, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部与 Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const name = user.displayName || user.primaryEmail || 'MailDock 用户';

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-avatar"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="user-avatar-img" />
        ) : (
          <span aria-hidden="true">{initial(user)}</span>
        )}
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-head">
            <span className="user-dropdown-name">{name}</span>
            {user.primaryEmail && (
              <span className="user-dropdown-email">{user.primaryEmail}</span>
            )}
          </div>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            个人资料
          </button>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            修改密码
          </button>
          <button
            type="button"
            className="user-dropdown-item user-dropdown-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
```

> 「个人资料」与「修改密码」都进入个人中心页（同一页含资料与改密两块）。`onOpenProfile` 复用即可，无需分别回调。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend && npx vitest run src/components/UserMenu.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/UserMenu.tsx frontend/src/components/UserMenu.test.tsx
git commit -m "feat: UserMenu 头像下拉菜单组件"
```

---

## Task 7: ProfilePage 页面

**Files:**
- Create: `frontend/src/pages/ProfilePage.tsx`
- Test: `frontend/src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/pages/ProfilePage.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';
import type { CurrentUser } from '../api/client';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    updateDisplayName: vi.fn().mockResolvedValue(user({ displayName: '新名字' })),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ProfilePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('渲染只读资料（邮箱）与显示名输入框', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('显示名')).toHaveValue('Alice');
  });

  it('提交改名调用 updateDisplayName 并回传更新后的用户', async () => {
    const onUserUpdated = vi.fn();
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={onUserUpdated} />);

    fireEvent.change(screen.getByLabelText('显示名'), { target: { value: '新名字' } });
    fireEvent.click(screen.getByRole('button', { name: '更新资料' }));

    await waitFor(() => expect(api.updateDisplayName).toHaveBeenCalledWith('新名字'));
    await waitFor(() => expect(onUserUpdated).toHaveBeenCalled());
  });

  it('改密两次输入不一致时报错且不调用 API', async () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('改密成功时调用 changePassword 并清空表单', async () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1'));
    await waitFor(() => expect(screen.getByLabelText('新密码')).toHaveValue(''));
  });

  it('linux.do 用户（hasPassword=false）改密区禁用并提示', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user({ hasPassword: false })} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    expect(screen.getByText('当前账号通过 linux.do 登录，未设置密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改密码' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend && npx vitest run src/pages/ProfilePage.test.tsx`
Expected: FAIL，无法解析 `./ProfilePage`。

- [ ] **Step 3: 实现页面**

新建 `frontend/src/pages/ProfilePage.tsx`：

```tsx
import { useState, type FormEvent } from 'react';
import type { ApiClient, CurrentUser } from '../api/client';

interface ProfilePageProps {
  api: ApiClient;
  user: CurrentUser;
  /** 返回上一视图。 */
  onBack: () => void;
  /** 资料更新后回传新用户，供上层同步状态。 */
  onUserUpdated: (user: CurrentUser) => void;
}

/** 头像首字母占位。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 个人中心页：展示只读资料、编辑显示名、修改密码。
 * 修改密码仅对邮箱密码用户（hasPassword）开放。
 */
export function ProfilePage({ api, user, onBack, onUserUpdated }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setSavingProfile(true);
    try {
      const updated = await api.updateDisplayName(displayName.trim());
      onUserUpdated(updated);
      setProfileMsg('资料已更新');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdMsg('');
    setPwdErr('');
    if (newPassword.length < 6) {
      setPwdErr('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }
    setSavingPwd(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg('密码已修改');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <button type="button" className="link-btn" onClick={onBack}>返回</button>
        <h1>个人中心</h1>
      </header>

      {/* 资料卡 */}
      <section className="profile-card">
        <h2>资料与头像</h2>
        <div className="profile-card-body">
          <div className="profile-identity">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar" aria-hidden="true">{initial(user)}</div>
            )}
            <dl className="profile-readonly">
              <dt>邮箱</dt>
              <dd>{user.primaryEmail ?? '—'}</dd>
              <dt>登录方式</dt>
              <dd>{user.hasPassword ? '邮箱密码' : 'linux.do'}</dd>
            </dl>
          </div>

          <form className="profile-form" onSubmit={handleProfileSubmit}>
            <div className="field">
              <label htmlFor="displayName">显示名</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                maxLength={64}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            {profileErr && <p className="error" role="alert">{profileErr}</p>}
            {profileMsg && <p className="success">{profileMsg}</p>}
            <button type="submit" className="btn-primary" disabled={savingProfile}>更新资料</button>
          </form>
        </div>
      </section>

      {/* 修改密码卡 */}
      <section className="profile-card">
        <h2>修改密码</h2>
        {!user.hasPassword && (
          <p className="profile-note">当前账号通过 linux.do 登录，未设置密码</p>
        )}
        <form className="profile-form" onSubmit={handlePasswordSubmit}>
          <div className="field">
            <label htmlFor="oldPassword">原密码</label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              disabled={!user.hasPassword}
              autoComplete="current-password"
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">新密码</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              disabled={!user.hasPassword}
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">确认新密码</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              disabled={!user.hasPassword}
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {pwdErr && <p className="error" role="alert">{pwdErr}</p>}
          {pwdMsg && <p className="success">{pwdMsg}</p>}
          <button type="submit" className="btn-primary" disabled={!user.hasPassword || savingPwd}>
            修改密码
          </button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend && npx vitest run src/pages/ProfilePage.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/ProfilePage.tsx frontend/src/pages/ProfilePage.test.tsx
git commit -m "feat: ProfilePage 个人中心页（资料/改名/改密）"
```

---

## Task 8: App.tsx 接线 + 更新 App.test.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

### 8a. 更新 App.test.tsx 工厂与用例（先改测试）

- [ ] **Step 1: user 工厂加 hasPassword，改登出/用户名相关用例**

修改 `App.test.tsx`：

把 `user` 工厂改为：

```typescript
function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}
```

`stubApi` 增加新方法（合并进返回对象）：

```typescript
    updateDisplayName: vi.fn().mockResolvedValue(user()),
    changePassword: vi.fn().mockResolvedValue(undefined),
```

把用例「auth me 成功时直接进入账号列表」中对 `'Alice'` 的断言改为：用户名现在在头像菜单里，需先展开。替换该用例为：

```typescript
  it('auth me 成功时直接进入账号列表', async () => {
    const api = stubApi({ me: vi.fn().mockResolvedValue(user()) });
    render(<App api={api as never} />);

    await waitFor(() => expect(api.me).toHaveBeenCalled());
    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
    // 用户名移入头像下拉，展开后可见
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
```

把用例「点击登出回到登录页」替换为：

```typescript
  it('点击登出回到登录页', async () => {
    // 登出入口移入头像下拉菜单
    const api = stubApi();
    render(<App api={api as never} />);
    await screen.findAllByText('owner@163.com');

    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
    });
    expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  });
```

新增用例「打开个人中心」：

```typescript
  it('从头像菜单进入个人中心，可返回账号列表', async () => {
    const api = stubApi();
    render(<App api={api as never} />);
    await screen.findAllByText('owner@163.com');

    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人资料' }));

    expect(await screen.findByText('个人中心')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL，找不到 `用户菜单` 按钮（App.tsx 尚未改）。

### 8b. 改 App.tsx

- [ ] **Step 3: 改 View 类型、header、profile 渲染**

修改 `App.tsx`：

新增导入：

```typescript
import { UserMenu } from './components/UserMenu';
import { ProfilePage } from './pages/ProfilePage';
```

`View` 类型新增 profile 分支：

```typescript
type View =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'accounts'; user: CurrentUser }
  | { name: 'profile'; user: CurrentUser }
  | { name: 'mailList'; user: CurrentUser; accountId: number }
  | { name: 'mailDetail'; user: CurrentUser; accountId: number; messageId: number };
```

把 accounts 视图 `<header className="topbar">` 中「顶部操作区：当前用户与登出」整段（中间用户名 `<span>` 与 `logout-btn` 按钮）替换为 `UserMenu`：

```tsx
          {/* 顶部操作区：用户头像菜单 */}
          <UserMenu
            user={view.user}
            onOpenProfile={() => setView({ name: 'profile', user: view.user })}
            onLogout={() => void handleLogout()}
          />
```

在 `mailList` 视图渲染分支之前，新增 profile 视图渲染：

```tsx
  if (view.name === 'profile') {
    return (
      <ProfilePage
        api={api}
        user={view.user}
        onBack={() => setView({ name: 'accounts', user: view.user })}
        onUserUpdated={(updated) => setView({ name: 'profile', user: updated })}
      />
    );
  }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS。

- [ ] **Step 5: 类型检查 + 全量前端测试**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: 无类型错误；全部测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: header 改用头像菜单并挂载个人中心视图"
```

---

## Task 9: 样式

**Files:**
- Modify: `frontend/src/styles.css`

样式无单测；`styles.test.ts` 仅断言类名字符串存在，不受影响。本任务靠类型检查 + 视觉自检验证。

- [ ] **Step 1: 新增样式**

在 `styles.css` 的 `.topbar .logout-btn .logout-text { ... }` 规则之后插入头像菜单与个人中心样式：

```css
  /* ===== 用户头像菜单 ===== */
  .user-menu {
    @apply relative;
  }

  .user-avatar {
    @apply flex h-9 w-9 items-center justify-center overflow-hidden rounded-full
      bg-gradient-to-br from-brand-500 to-brand-600 text-sm font-semibold text-white
      shadow-md shadow-brand-500/30 transition hover:opacity-90 sm:h-10 sm:w-10;
  }

  .user-avatar-img {
    @apply h-full w-full object-cover;
  }

  .user-dropdown {
    @apply absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl
      border border-slate-200 bg-white py-1 shadow-xl shadow-slate-300/40;
  }

  .user-dropdown-head {
    @apply flex flex-col gap-0.5 border-b border-slate-100 px-4 py-3;
  }

  .user-dropdown-name {
    @apply text-sm font-semibold text-slate-800;
  }

  .user-dropdown-email {
    @apply truncate text-xs text-slate-400;
  }

  .user-dropdown-item {
    @apply block w-full px-4 py-2.5 text-left text-sm text-slate-600
      transition hover:bg-slate-50 hover:text-slate-900;
  }

  .user-dropdown-item-danger {
    @apply text-rose-600 hover:bg-rose-50 hover:text-rose-700;
  }

  /* ===== 个人中心 ===== */
  .profile-page {
    @apply mx-auto w-full max-w-3xl px-4 py-6 sm:px-6;
  }

  .profile-header {
    @apply mb-6 flex items-center gap-3;
  }

  .profile-header h1 {
    @apply text-lg font-bold text-slate-800 sm:text-xl;
  }

  .profile-card {
    @apply mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6;
  }

  .profile-card h2 {
    @apply mb-4 text-base font-semibold text-slate-800;
  }

  .profile-card-body {
    @apply grid gap-6 sm:grid-cols-2;
  }

  .profile-identity {
    @apply flex items-start gap-4;
  }

  .profile-avatar {
    @apply flex h-16 w-16 items-center justify-center rounded-2xl
      bg-gradient-to-br from-brand-500 to-brand-600 text-2xl font-semibold text-white;
  }

  .profile-avatar-img {
    @apply h-16 w-16 rounded-2xl object-cover;
  }

  .profile-readonly {
    @apply grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm;
  }

  .profile-readonly dt {
    @apply text-slate-400;
  }

  .profile-readonly dd {
    @apply text-slate-700;
  }

  .profile-form {
    @apply flex flex-col gap-3;
  }

  .profile-form .field {
    @apply flex flex-col gap-1;
  }

  .profile-form label {
    @apply text-sm text-slate-600;
  }

  .profile-form input {
    @apply rounded-lg border border-slate-200 px-3 py-2 text-sm
      focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100
      disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400;
  }

  .profile-form .success {
    @apply text-sm text-emerald-600;
  }

  .profile-note {
    @apply mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700;
  }
```

> `.btn-primary`、`.link-btn`、`.error` 若已存在则复用，无需重复定义。若不存在，在上述块末尾补：
>
> ```css
>   .btn-primary {
>     @apply self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
>       transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60;
>   }
>
>   .link-btn {
>     @apply text-sm text-brand-600 hover:text-brand-700;
>   }
> ```
>
> 执行前先 grep `styles.css` 确认 `.btn-primary` / `.link-btn` / `.error` 是否已定义，避免重复。

- [ ] **Step 2: 构建确认无误**

Run: `cd frontend && npm run build`
Expected: `tsc -b` 与 `vite build` 均成功，Tailwind 编译无 unknown utility 报错。

- [ ] **Step 3: 全量前端测试**

Run: `cd frontend && npx vitest run`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles.css
git commit -m "style: 头像菜单与个人中心页样式"
```

---

## 收尾验证

- [ ] **后端全量测试**

Run: `cd backend && mvn test`
Expected: PASS。

- [ ] **前端全量测试 + 构建**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS。

- [ ] **手动自检（可选）**

启动后端与前端 dev server，确认：
1. 登录后右上角显示头像（首字母），中间不再有用户名文本。
2. 点击头像展开菜单，显示用户名 + 邮箱与三个菜单项。
3. 「个人资料」/「修改密码」进入个人中心；改名后头像菜单中的用户名同步更新。
4. 邮箱密码用户可改密；linux.do 用户改密区禁用并提示。
