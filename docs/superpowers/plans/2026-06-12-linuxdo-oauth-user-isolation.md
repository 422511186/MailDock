# MailDock linux.do OAuth 与用户隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MailDock 从单管理员全局邮箱池改造成普通用户体系，支持预制邮箱密码登录、linux.do OAuth 登录、HttpOnly Cookie 会话，以及邮箱/邮件/附件按用户隔离。

**Architecture:** 后端新增 `app_user`/`user_identity` 与 `SessionStore`，认证中间件从 `maildock_session` Cookie 解析 `currentUserId`。账号、邮件、附件服务全部显式接收 `userId`，Repository 查询按 `user_id` 或 join 关系限制范围。前端改为 `/auth/me` 恢复会话，所有请求使用 Cookie。

**Tech Stack:** Java 21、Vert.x Web、SQLite JDBC、BCrypt、JUnit 5、React 18、TypeScript、Vitest。

---

## 文件结构

后端新增：

- `backend/src/main/java/com/maildock/model/User.java`：普通用户模型，对应 `app_user`。
- `backend/src/main/java/com/maildock/model/UserIdentity.java`：登录身份模型，对应 `user_identity`。
- `backend/src/main/java/com/maildock/repository/UserRepository.java`：用户插入、查找、资料与登录时间更新。
- `backend/src/main/java/com/maildock/repository/IdentityRepository.java`：identity 插入、查找、密码哈希更新。
- `backend/src/main/java/com/maildock/security/SessionStore.java`：内存 session token 到 `userId` 的映射。
- `backend/src/main/java/com/maildock/service/LinuxDoOAuthService.java`：linux.do OAuth start/callback 编排。
- `backend/src/main/java/com/maildock/service/OAuthClient.java`：OAuth HTTP 客户端接口，便于测试替换。

后端修改：

- `backend/src/main/java/com/maildock/repository/Database.java`：新建 `app_user`、`user_identity`，给 `mail_account` 增加 `user_id` 与 `(user_id, email)` 唯一约束。
- `backend/src/main/java/com/maildock/model/Account.java`：增加 `userId`。
- `backend/src/main/java/com/maildock/repository/AccountRepository.java`：所有查询和写入增加用户维度。
- `backend/src/main/java/com/maildock/repository/MessageRepository.java`：增加按用户归属查询详情、标记已读、统计等方法。
- `backend/src/main/java/com/maildock/repository/AttachmentRepository.java`：增加按用户归属查询附件的方法。
- `backend/src/main/java/com/maildock/config/AppConfig.java`：移除 admin 配置语义，增加默认邮箱用户、OAuth、session 配置。
- `backend/src/main/java/com/maildock/service/AuthService.java`：改为邮箱密码登录、默认邮箱用户初始化、linux.do 用户 upsert、session 签发。
- `backend/src/main/java/com/maildock/service/AccountService.java`：所有入口增加 `userId`。
- `backend/src/main/java/com/maildock/service/MailSyncService.java`：刷新时校验 account 属于 `userId`，附件路径包含 `userId`。
- `backend/src/main/java/com/maildock/service/MailQueryService.java`：详情、附件、已读操作按 `userId` 校验。
- `backend/src/main/java/com/maildock/web/ApiRouter.java`：Cookie session 鉴权、`/auth/me`、linux.do start/callback、所有服务调用传 `currentUserId`。
- `backend/src/main/java/com/maildock/web/WebVerticle.java`：装配新 Repository/Service，初始化默认邮箱用户。

前端修改：

- `frontend/src/api/client.ts`：移除 localStorage token，所有请求 `credentials: 'include'`，新增 `me()`、邮箱登录、linux.do start URL。
- `frontend/src/App.tsx`：启动时调用 `/auth/me` 恢复会话，顶部栏展示当前用户。
- `frontend/src/pages/LoginPage.tsx`：登录字段改为邮箱/密码，增加 linux.do 登录按钮。
- 对应测试文件同步更新。

文档修改：

- `README.md`
- `CLAUDE.md`
- 必要时补充 `docs/superpowers/specs/2026-06-12-linuxdo-oauth-user-isolation-design.md` 的实施注记。

---

### Task 0: 执行前隔离与基线验证

**Files:**
- Read: `docs/superpowers/specs/2026-06-12-linuxdo-oauth-user-isolation-design.md`
- Read: `docs/superpowers/plans/2026-06-12-linuxdo-oauth-user-isolation.md`

- [ ] **Step 1: 使用 worktree 技能检查隔离**

激活并遵守 `superpowers:using-git-worktrees`。先运行检测命令：

```powershell
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
```

Expected:

- 如果已在 linked worktree 中，报告当前路径和分支，继续 Step 2。
- 如果不是 linked worktree，按 `using-git-worktrees` 询问是否创建隔离 worktree。
- 不得在 `main` 或 `master` 上直接实现，除非用户明确允许。

- [ ] **Step 2: 确认工作树状态**

Run:

```powershell
git status --short
```

Expected:

- 只允许存在用户已知的未跟踪 `.codex/`、`openspec/` 或计划文件。
- 如果出现业务代码未提交变更，停止并询问用户。

- [ ] **Step 3: 运行后端基线测试**

Run:

```powershell
mvn test
```

Workdir: `backend`

Expected:

- PASS。
- 如果失败，记录失败测试名和错误摘要，停止询问用户是否先修基线。

- [ ] **Step 4: 运行前端基线测试**

Run:

```powershell
npm test
```

Workdir: `frontend`

Expected:

- PASS。
- 如果失败，记录失败测试名和错误摘要，停止询问用户是否先修基线。

---

### Task 1: 用户与登录身份持久层

**Files:**
- Create: `backend/src/main/java/com/maildock/model/User.java`
- Create: `backend/src/main/java/com/maildock/model/UserIdentity.java`
- Create: `backend/src/main/java/com/maildock/repository/UserRepository.java`
- Create: `backend/src/main/java/com/maildock/repository/IdentityRepository.java`
- Modify: `backend/src/main/java/com/maildock/repository/Database.java`
- Modify: `backend/src/main/java/com/maildock/model/Account.java`
- Modify: `backend/src/main/java/com/maildock/repository/AccountRepository.java`
- Test: `backend/src/test/java/com/maildock/repository/UserRepositoryTest.java`
- Test: `backend/src/test/java/com/maildock/repository/IdentityRepositoryTest.java`
- Test: `backend/src/test/java/com/maildock/repository/AccountRepositoryTest.java`
- Remove or stop compiling: `backend/src/main/java/com/maildock/model/Admin.java`
- Remove or stop compiling: `backend/src/main/java/com/maildock/repository/AdminRepository.java`
- Remove or replace: `backend/src/test/java/com/maildock/repository/AdminRepositoryTest.java`

- [ ] **Step 1: 写 UserRepository 失败测试**

Create `backend/src/test/java/com/maildock/repository/UserRepositoryTest.java` with tests covering:

```java
@Test
void insertAndFindById() {
    User user = userRepo.insert("alice@example.com", "Alice", "https://avatar.example/a.png");

    User found = userRepo.findById(user.id()).orElseThrow();

    assertEquals("alice@example.com", found.primaryEmail());
    assertEquals("Alice", found.displayName());
    assertEquals("https://avatar.example/a.png", found.avatarUrl());
    assertTrue(found.createdAt() > 0);
    assertTrue(found.updatedAt() > 0);
}

@Test
void updateProfileAndLastLogin() {
    User user = userRepo.insert("alice@example.com", "Alice", null);

    userRepo.updateProfile(user.id(), "new@example.com", "New Name", "avatar");
    userRepo.updateLastLogin(user.id(), 1700000000000L);

    User found = userRepo.findById(user.id()).orElseThrow();
    assertEquals("new@example.com", found.primaryEmail());
    assertEquals("New Name", found.displayName());
    assertEquals("avatar", found.avatarUrl());
    assertEquals(1700000000000L, found.lastLoginAt());
}
```

Expected setup:

- `@BeforeEach` creates temp SQLite file, calls `db.initSchema()`, then `userRepo = new UserRepository(db)`.
- `@AfterEach` closes DB and deletes temp file.

- [ ] **Step 2: 写 IdentityRepository 失败测试**

Create `backend/src/test/java/com/maildock/repository/IdentityRepositoryTest.java` with tests covering:

```java
@Test
void insertAndFindByProviderUid() {
    User user = userRepo.insert("alice@example.com", "Alice", null);
    UserIdentity identity = identityRepo.insert(user.id(), "email_password", "alice@example.com", "hash-1");

    UserIdentity found = identityRepo.findByProviderUid("email_password", "alice@example.com").orElseThrow();

    assertEquals(identity.id(), found.id());
    assertEquals(user.id(), found.userId());
    assertEquals("hash-1", found.secretHash());
}

@Test
void providerAndUidAreUniqueTogether() {
    User user = userRepo.insert("alice@example.com", "Alice", null);
    identityRepo.insert(user.id(), "linuxdo", "42", null);

    assertThrows(RuntimeException.class, () -> identityRepo.insert(user.id(), "linuxdo", "42", null));
}

@Test
void updateSecretHash() {
    User user = userRepo.insert("alice@example.com", "Alice", null);
    UserIdentity identity = identityRepo.insert(user.id(), "email_password", "alice@example.com", "old");

    identityRepo.updateSecretHash(identity.id(), "new");

    assertEquals("new", identityRepo.findById(identity.id()).orElseThrow().secretHash());
}
```

- [ ] **Step 3: 更新 AccountRepository 测试为用户隔离**

Modify `backend/src/test/java/com/maildock/repository/AccountRepositoryTest.java`:

- 创建两个 `app_user`。
- `insert(userId, email, enc)` 允许不同用户插入同一个 email。
- 同一用户重复插入同一个 email 抛异常。
- `findById(userId, accountId)` 对其他用户返回 empty。
- `query(userId, ...)` 只返回该用户数据。

Use assertions:

```java
Account a1 = accountRepo.insert(userA.id(), "same@163.com", "enc-a");
Account a2 = accountRepo.insert(userB.id(), "same@163.com", "enc-b");

assertTrue(accountRepo.findById(userA.id(), a1.id()).isPresent());
assertTrue(accountRepo.findById(userA.id(), a2.id()).isEmpty());
assertEquals(1, accountRepo.query(userA.id(), "same", null, "lastSyncAt", "desc", 1, 20).total());
```

- [ ] **Step 4: 运行 repository 测试并确认失败**

Run:

```powershell
mvn -Dtest=UserRepositoryTest,IdentityRepositoryTest,AccountRepositoryTest test
```

Workdir: `backend`

Expected:

- FAIL，因为新模型、Repository 和 Account 签名尚未实现。

- [ ] **Step 5: 实现模型与 schema**

Create `User.java`:

```java
package com.maildock.model;

public record User(
        long id,
        String primaryEmail,
        String displayName,
        String avatarUrl,
        long createdAt,
        long updatedAt,
        long lastLoginAt) {
}
```

Create `UserIdentity.java`:

```java
package com.maildock.model;

public record UserIdentity(
        long id,
        long userId,
        String provider,
        String providerUid,
        String secretHash,
        long createdAt,
        long updatedAt) {
}
```

Modify `Account.java` to add `long userId` immediately after `id`.

Modify `Database.initSchema()`:

- Remove `admin_user`.
- Add `app_user`.
- Add `user_identity`.
- Add `user_id INTEGER NOT NULL` to `mail_account`.
- Replace `email TEXT NOT NULL UNIQUE` with `email TEXT NOT NULL`.
- Add `FOREIGN KEY (user_id) REFERENCES app_user(id)`.
- Add `UNIQUE (user_id, email)`.
- Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_identity_user ON user_identity(user_id)
CREATE INDEX IF NOT EXISTS idx_account_user ON mail_account(user_id, id)
```

- [ ] **Step 6: 实现 UserRepository 与 IdentityRepository**

Implement methods:

```java
public User insert(String primaryEmail, String displayName, String avatarUrl)
public Optional<User> findById(long id)
public void updateProfile(long id, String primaryEmail, String displayName, String avatarUrl)
public void updateLastLogin(long id, long lastLoginAt)
```

```java
public UserIdentity insert(long userId, String provider, String providerUid, String secretHash)
public Optional<UserIdentity> findById(long id)
public Optional<UserIdentity> findByProviderUid(String provider, String providerUid)
public void updateSecretHash(long id, String secretHash)
```

All writes use `db.runWrite`.

- [ ] **Step 7: 更新 AccountRepository 用户维度**

Change public signatures:

```java
public Account insert(long userId, String email, String authCodeEnc)
public Optional<Account> findById(long userId, long id)
public Optional<Account> findByEmail(long userId, String email)
public List<Account> listAll(long userId)
public PagedAccounts query(long userId, String email, String status, String sortBy, String sortOrder, int page, int size)
public void delete(long userId, long id)
public void updateAuthCode(long userId, long id, String authCodeEnc)
public void updateSyncState(long userId, long id, long lastUid, long uidValidity, long lastSyncAt)
public void updateTestStatus(long userId, long id, long lastTestAt, boolean ok, String msg)
```

Keep package-private or test-only helpers only if needed:

```java
public Optional<Account> findByIdAnyUser(long id)
```

Use it only in tests that build fixture data. Application services must use user-scoped methods.

- [ ] **Step 8: 移除 Admin 主流程代码**

Delete or stop compiling:

- `backend/src/main/java/com/maildock/model/Admin.java`
- `backend/src/main/java/com/maildock/repository/AdminRepository.java`
- `backend/src/test/java/com/maildock/repository/AdminRepositoryTest.java`

If deletion creates import failures, the later tasks will replace those imports. At this task, repository tests must compile.

- [ ] **Step 9: 跑 Task 1 测试**

Run:

```powershell
mvn -Dtest=UserRepositoryTest,IdentityRepositoryTest,AccountRepositoryTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 10: 提交 Task 1**

Run:

```powershell
git add backend/src/main/java/com/maildock/model backend/src/main/java/com/maildock/repository backend/src/test/java/com/maildock/repository
git commit -m "feat: add user identity persistence"
```

---

### Task 2: 配置模型改造

**Files:**
- Modify: `backend/src/main/java/com/maildock/config/AppConfig.java`
- Test: `backend/src/test/java/com/maildock/config/AppConfigTest.java`

- [ ] **Step 1: 更新 AppConfigTest 失败测试**

Modify tests to assert:

```java
@Test
void parsesDefaultUserOauthAndSessionConfig() {
    Map<String, String> env = baseEnv();
    env.put("MAILDOCK_DEFAULT_EMAIL", "Admin@Example.COM ");
    env.put("MAILDOCK_DEFAULT_PASSWORD", "secret");
    env.put("MAILDOCK_LINUXDO_CLIENT_ID", "cid");
    env.put("MAILDOCK_LINUXDO_CLIENT_SECRET", "csecret");
    env.put("MAILDOCK_LINUXDO_AUTH_URL", "https://connect.linux.do/oauth2/authorize");
    env.put("MAILDOCK_LINUXDO_TOKEN_URL", "https://connect.linux.do/oauth2/token");
    env.put("MAILDOCK_LINUXDO_USERINFO_URL", "https://connect.linux.do/api/user");
    env.put("MAILDOCK_LINUXDO_SCOPE", "read");
    env.put("MAILDOCK_LINUXDO_USER_ID_FIELD", "id");
    env.put("MAILDOCK_LINUXDO_EMAIL_FIELD", "email");
    env.put("MAILDOCK_LINUXDO_NAME_FIELD", "username");
    env.put("MAILDOCK_LINUXDO_AVATAR_FIELD", "avatar_url");
    env.put("MAILDOCK_PUBLIC_BASE_URL", "https://maildock.example");
    env.put("MAILDOCK_SESSION_COOKIE_SECURE", "true");
    env.put("MAILDOCK_SESSION_TTL_HOURS", "12");

    AppConfig config = AppConfig.from(env);

    assertEquals("Admin@Example.COM", config.defaultEmail());
    assertEquals("secret", config.defaultPassword());
    assertEquals("cid", config.linuxdoClientId());
    assertTrue(config.sessionCookieSecure());
    assertEquals(12, config.sessionTtlHours());
}
```

Add test:

```java
@Test
void missingDefaultUserDoesNotGeneratePassword() {
    AppConfig config = AppConfig.from(baseEnv());

    assertNull(config.defaultEmail());
    assertNull(config.defaultPassword());
}
```

Remove tests expecting generated admin password.

- [ ] **Step 2: Run config tests and confirm failure**

Run:

```powershell
mvn -Dtest=AppConfigTest test
```

Workdir: `backend`

Expected:

- FAIL because new record fields are missing.

- [ ] **Step 3: Implement AppConfig fields**

Replace admin fields with:

```java
String defaultEmail,
String defaultPassword,
String linuxdoClientId,
String linuxdoClientSecret,
String linuxdoAuthUrl,
String linuxdoTokenUrl,
String linuxdoUserinfoUrl,
String linuxdoScope,
String linuxdoUserIdField,
String linuxdoEmailField,
String linuxdoNameField,
String linuxdoAvatarField,
String publicBaseUrl,
boolean sessionCookieSecure,
int sessionTtlHours
```

Keep existing fields:

```java
String secretKey,
int httpPort,
String dbPath,
String attachmentsDir
```

Parsing rules:

- `defaultEmail` is `strip()` only, not lowercased in config.
- `defaultPassword` is null when missing or blank.
- `sessionCookieSecure` is true only when value equals `true` ignoring case.
- `sessionTtlHours` defaults to 24 and must be at least 1; invalid values fallback to 24.
- OAuth fields are nullable strings after `strip()`.

Remove `SecureRandom`, random password generation, `DEFAULT_ADMIN_USER`, `adminUser()`, `adminPassword()`, and `passwordGenerated()`.

- [ ] **Step 4: Run config tests**

Run:

```powershell
mvn -Dtest=AppConfigTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 5: 提交 Task 2**

Run:

```powershell
git add backend/src/main/java/com/maildock/config/AppConfig.java backend/src/test/java/com/maildock/config/AppConfigTest.java
git commit -m "feat: add user auth configuration"
```

---

### Task 3: SessionStore 与邮箱密码 AuthService

**Files:**
- Create: `backend/src/main/java/com/maildock/security/SessionStore.java`
- Modify: `backend/src/main/java/com/maildock/service/AuthService.java`
- Test: `backend/src/test/java/com/maildock/security/SessionStoreTest.java`
- Test: `backend/src/test/java/com/maildock/service/AuthServiceTest.java`
- Remove or replace: `backend/src/main/java/com/maildock/security/TokenStore.java`
- Remove or replace: `backend/src/test/java/com/maildock/security/TokenStoreTest.java`

- [ ] **Step 1: 写 SessionStore 失败测试**

Create `SessionStoreTest`:

```java
@Test
void issueAndResolveSession() {
    SessionStore store = new SessionStore();

    String token = store.issue(7L, Duration.ofHours(1));

    assertEquals(7L, store.userId(token).orElseThrow());
}

@Test
void expiredSessionIsRemoved() {
    SessionStore store = new SessionStore();
    String token = store.issue(7L, Duration.ofMillis(-1));

    assertTrue(store.userId(token).isEmpty());
    assertFalse(store.isValid(token));
}

@Test
void revokeRemovesSession() {
    SessionStore store = new SessionStore();
    String token = store.issue(7L, Duration.ofHours(1));

    store.revoke(token);

    assertTrue(store.userId(token).isEmpty());
}
```

- [ ] **Step 2: 更新 AuthServiceTest 失败测试**

Replace admin tests with:

```java
@Test
void ensureDefaultEmailUserCreatesUserAndIdentity() {
    service.ensureDefaultEmailUser("Alice@Example.COM", "init-pass");

    UserIdentity identity = identityRepo
            .findByProviderUid("email_password", "alice@example.com")
            .orElseThrow();
    assertTrue(BCrypt.checkpw("init-pass", identity.secretHash()));
    assertEquals("alice@example.com", userRepo.findById(identity.userId()).orElseThrow().primaryEmail());
}

@Test
void ensureDefaultEmailUserUpdatesExistingPassword() {
    service.ensureDefaultEmailUser("alice@example.com", "old-pass");
    service.ensureDefaultEmailUser("alice@example.com", "new-pass");

    UserIdentity identity = identityRepo
            .findByProviderUid("email_password", "alice@example.com")
            .orElseThrow();

    assertTrue(BCrypt.checkpw("new-pass", identity.secretHash()));
}

@Test
void emailPasswordLoginReturnsSessionAndUser() {
    service.ensureDefaultEmailUser("alice@example.com", "init-pass");

    AuthService.LoginResult result = service.loginWithEmailPassword("alice@example.com", "init-pass").orElseThrow();

    assertEquals("alice@example.com", result.user().primaryEmail());
    assertEquals(result.user().id(), sessionStore.userId(result.sessionToken()).orElseThrow());
}

@Test
void emailPasswordLoginRejectsWrongPassword() {
    service.ensureDefaultEmailUser("alice@example.com", "init-pass");

    assertTrue(service.loginWithEmailPassword("alice@example.com", "wrong").isEmpty());
}
```

- [ ] **Step 3: Run auth/security tests and confirm failure**

Run:

```powershell
mvn -Dtest=SessionStoreTest,AuthServiceTest test
```

Workdir: `backend`

Expected:

- FAIL because `SessionStore` and new AuthService methods do not exist.

- [ ] **Step 4: Implement SessionStore**

Create `SessionStore` with methods:

```java
public String issue(long userId, Duration ttl)
public Optional<Long> userId(String token)
public boolean isValid(String token)
public void revoke(String token)
```

Use 32 random bytes and URL-safe Base64 without padding, same entropy style as old `TokenStore`.

- [ ] **Step 5: Implement AuthService email/password behavior**

Constructor:

```java
public AuthService(UserRepository userRepo,
                   IdentityRepository identityRepo,
                   SessionStore sessionStore,
                   Duration sessionTtl)
```

Records:

```java
public record LoginResult(String sessionToken, User user) {}
```

Methods:

```java
public void ensureDefaultEmailUser(String email, String rawPassword)
public Optional<LoginResult> loginWithEmailPassword(String email, String rawPassword)
public Optional<User> currentUser(String token)
public void logout(String token)
public boolean authenticated(String token)
public Optional<Long> userId(String token)
```

Rules:

- Normalize email with `email.strip().toLowerCase(Locale.ROOT)`.
- If default email or password is null/blank, `ensureDefaultEmailUser` returns without writing.
- Use BCrypt for `secret_hash`.
- Login updates `app_user.last_login_at`.

- [ ] **Step 6: Remove TokenStore**

Delete or stop compiling:

- `backend/src/main/java/com/maildock/security/TokenStore.java`
- `backend/src/test/java/com/maildock/security/TokenStoreTest.java`

- [ ] **Step 7: Run tests**

Run:

```powershell
mvn -Dtest=SessionStoreTest,AuthServiceTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 8: 提交 Task 3**

Run:

```powershell
git add backend/src/main/java/com/maildock/security backend/src/main/java/com/maildock/service/AuthService.java backend/src/test/java/com/maildock/security backend/src/test/java/com/maildock/service/AuthServiceTest.java
git commit -m "feat: add cookie session email authentication"
```

---

### Task 4: linux.do OAuth 服务

**Files:**
- Create: `backend/src/main/java/com/maildock/service/OAuthClient.java`
- Create: `backend/src/main/java/com/maildock/service/LinuxDoOAuthService.java`
- Modify: `backend/src/main/java/com/maildock/service/AuthService.java`
- Test: `backend/src/test/java/com/maildock/service/LinuxDoOAuthServiceTest.java`
- Test: `backend/src/test/java/com/maildock/service/AuthServiceTest.java`

- [ ] **Step 1: 写 OAuth 服务失败测试**

Create `LinuxDoOAuthServiceTest` with a fake `OAuthClient`.

Test start URL:

```java
@Test
void startBuildsAuthorizationRedirectAndStoresState() {
    LinuxDoOAuthService service = serviceWithConfig();

    LinuxDoOAuthService.StartResult result = service.start();

    assertTrue(result.redirectUrl().startsWith("https://connect.linux.do/oauth2/authorize?"));
    assertTrue(result.redirectUrl().contains("client_id=client-id"));
    assertTrue(result.redirectUrl().contains("state="));
    assertTrue(result.redirectUrl().contains("code_challenge="));
}
```

Test callback creates user:

```java
@Test
void callbackCreatesLinuxdoUserAndSession() {
    LinuxDoOAuthService.StartResult start = service.start();
    String state = start.state();
    fakeClient.user = new OAuthClient.OAuthUser("linux-42", "linux@example.com", "linux name", "avatar");

    AuthService.LoginResult result = service.callback("code-1", state).orElseThrow();

    assertEquals("linux@example.com", result.user().primaryEmail());
    assertEquals(result.user().id(), sessionStore.userId(result.sessionToken()).orElseThrow());
    assertTrue(identityRepo.findByProviderUid("linuxdo", "linux-42").isPresent());
}
```

Test missing provider UID:

```java
@Test
void callbackFailsWhenUserinfoHasNoStableUserId() {
    LinuxDoOAuthService.StartResult start = service.start();
    fakeClient.user = new OAuthClient.OAuthUser("", "linux@example.com", "linux name", null);

    assertTrue(service.callback("code-1", start.state()).isEmpty());
}
```

- [ ] **Step 2: Run OAuth tests and confirm failure**

Run:

```powershell
mvn -Dtest=LinuxDoOAuthServiceTest test
```

Workdir: `backend`

Expected:

- FAIL because OAuth service does not exist.

- [ ] **Step 3: Create OAuthClient interface**

Create:

```java
public interface OAuthClient {
    record TokenResponse(String accessToken) {}
    record OAuthUser(String providerUid, String email, String displayName, String avatarUrl) {}

    TokenResponse exchangeCode(String tokenUrl,
                               String clientId,
                               String clientSecret,
                               String code,
                               String redirectUri,
                               String codeVerifier);

    OAuthUser fetchUser(String userinfoUrl, String accessToken);
}
```

Do not add a real HTTP implementation in this task. Route wiring can use a simple implementation in a later task.

- [ ] **Step 4: Implement LinuxDoOAuthService**

Required records:

```java
public record StartResult(String redirectUrl, String state) {}
```

Required methods:

```java
public StartResult start()
public Optional<AuthService.LoginResult> callback(String code, String state)
```

Rules:

- Generate random `state`.
- Generate random PKCE `codeVerifier`.
- Store state in memory for 10 minutes.
- Build redirect URL using `MAILDOCK_LINUXDO_AUTH_URL`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`.
- `redirect_uri` is `publicBaseUrl + "/api/v1/auth/linuxdo/callback"`.
- On callback, state must exist and not be expired.
- Exchange code with `OAuthClient`.
- Fetch userinfo with `OAuthClient`.
- If `providerUid` is null/blank, return empty.
- Delegate user creation/session issuance to `AuthService.loginWithLinuxdoUser(OAuthClient.OAuthUser user)`.

- [ ] **Step 5: Add AuthService linux.do upsert**

Add method:

```java
public Optional<LoginResult> loginWithLinuxdoUser(OAuthClient.OAuthUser oauthUser)
```

Rules:

- Find `identity(provider=linuxdo, providerUid)`.
- If found, load user and update profile fields.
- If not found, create `app_user`, then identity with `secret_hash=null`.
- Update `last_login_at`.
- Issue session.

- [ ] **Step 6: Run OAuth/Auth tests**

Run:

```powershell
mvn -Dtest=LinuxDoOAuthServiceTest,AuthServiceTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 7: 提交 Task 4**

Run:

```powershell
git add backend/src/main/java/com/maildock/service backend/src/test/java/com/maildock/service
git commit -m "feat: add linuxdo oauth service"
```

---

### Task 5: 账号服务用户隔离

**Files:**
- Modify: `backend/src/main/java/com/maildock/service/AccountService.java`
- Modify: `backend/src/main/java/com/maildock/repository/AccountRepository.java`
- Test: `backend/src/test/java/com/maildock/service/AccountServiceTest.java`
- Test: `backend/src/test/java/com/maildock/web/AccountRouteTest.java`

- [ ] **Step 1: 更新 AccountServiceTest 失败测试**

Modify fixture to create `userA` and `userB`, then call user-scoped service methods.

Add tests:

```java
@Test
void sameMailboxCanBeCreatedForDifferentUsers() {
    Account a = service.createAccount(userA.id(), EMAIL, AUTH_CODE);
    Account b = service.createAccount(userB.id(), EMAIL, AUTH_CODE);

    assertNotEquals(a.id(), b.id());
    assertEquals(userA.id(), a.userId());
    assertEquals(userB.id(), b.userId());
}

@Test
void queryAccountsReturnsOnlyCurrentUserAccounts() {
    service.createAccount(userA.id(), "a@163.com", AUTH_CODE);
    service.createAccount(userB.id(), "b@163.com", AUTH_CODE);

    AccountRepository.PagedAccounts page = service.queryAccounts(userA.id(), null, null, "lastSyncAt", "desc", 1, 20);

    assertEquals(1, page.total());
    assertEquals("a@163.com", page.items().get(0).email());
}

@Test
void deleteBatchIgnoresOtherUsersAccounts() {
    Account own = service.createAccount(userA.id(), "a@163.com", AUTH_CODE);
    Account other = service.createAccount(userB.id(), "b@163.com", AUTH_CODE);

    int deleted = service.deleteBatch(userA.id(), List.of(own.id(), other.id()));

    assertEquals(1, deleted);
    assertTrue(accountRepo.findById(userA.id(), own.id()).isEmpty());
    assertTrue(accountRepo.findById(userB.id(), other.id()).isPresent());
}
```

- [ ] **Step 2: Run AccountService tests and confirm failure**

Run:

```powershell
mvn -Dtest=AccountServiceTest test
```

Workdir: `backend`

Expected:

- FAIL because service signatures are not user-scoped.

- [ ] **Step 3: Update AccountService signatures**

Change methods:

```java
createAccount(long userId, String email, String authCode)
listAccounts(long userId)
queryAccounts(long userId, String email, String status, String sortBy, String sortOrder, int page, int size)
findById(long userId, long id)
testConnection(long userId, long accountId)
testBatch(long userId, List<Long> ids)
deleteAccount(long userId, long accountId)
deleteBatch(long userId, List<Long> ids)
importFromText(long userId, String text, boolean test, boolean overwrite)
```

Rules:

- `ids == null` in `testBatch` means current user's accounts only.
- Import overwrite checks `findByEmail(userId, email)`.
- Delete uses `messageRepo.listAllByAccount(accountId)` only after user-scoped account lookup succeeds.
- Attachment directory deletion uses `attachmentsDir.resolve(String.valueOf(userId)).resolve(String.valueOf(accountId))`.

- [ ] **Step 4: Update attachment cleanup path**

In `deleteFileQuietly` and `resolveAttachmentPath`, support stored paths like:

```text
attachments/{userId}/{accountId}/{messageId}/{filename}
```

Keep existing relative path resolution behavior for tests.

- [ ] **Step 5: Run AccountService tests**

Run:

```powershell
mvn -Dtest=AccountServiceTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 6: 提交 Task 5**

Run:

```powershell
git add backend/src/main/java/com/maildock/service/AccountService.java backend/src/main/java/com/maildock/repository/AccountRepository.java backend/src/test/java/com/maildock/service/AccountServiceTest.java
git commit -m "feat: scope mail accounts by user"
```

---

### Task 6: 邮件同步、查询与附件用户隔离

**Files:**
- Modify: `backend/src/main/java/com/maildock/repository/MessageRepository.java`
- Modify: `backend/src/main/java/com/maildock/repository/AttachmentRepository.java`
- Modify: `backend/src/main/java/com/maildock/service/MailSyncService.java`
- Modify: `backend/src/main/java/com/maildock/service/MailQueryService.java`
- Test: `backend/src/test/java/com/maildock/repository/MessageRepositoryTest.java`
- Test: `backend/src/test/java/com/maildock/repository/AttachmentRepositoryTest.java`
- Test: `backend/src/test/java/com/maildock/service/MailSyncServiceTest.java`
- Test: `backend/src/test/java/com/maildock/service/MailQueryServiceTest.java`

- [ ] **Step 1: Update MailQueryServiceTest for user ownership**

Add tests:

```java
@Test
void getDetailReturnsEmptyForOtherUsersMessage() {
    Message otherMessage = insertMessageFor(userB.id(), otherAccountId, 1, "other");

    assertTrue(service.getDetail(userA.id(), otherMessage.id()).isEmpty());
}

@Test
void markReadRejectsOtherUsersMessage() {
    Message otherMessage = insertMessageFor(userB.id(), otherAccountId, 1, "other");

    assertThrows(RuntimeException.class, () -> service.markRead(userA.id(), otherMessage.id(), true));
}

@Test
void loadAttachmentRejectsOtherUsersAttachment() {
    Message otherMessage = insertMessageFor(userB.id(), otherAccountId, 1, "other");
    Attachment att = attachmentRepo.insert(otherMessage.id(), "a.pdf", "application/pdf", 10L, "attachments/2/2/1/a.pdf");

    assertThrows(RuntimeException.class, () -> service.loadAttachment(userA.id(), otherMessage.id(), att.id()));
}
```

- [ ] **Step 2: Update MailSyncServiceTest for user ownership and path**

Add tests:

```java
@Test
void refreshRejectsOtherUsersAccount() {
    Account other = accountRepo.insert(userB.id(), EMAIL, crypto.encrypt(AUTH_CODE));

    assertThrows(RuntimeException.class, () -> service.refresh(userA.id(), other.id()));
}

@Test
void storedAttachmentPathIncludesUserId() {
    Account account = accountRepo.insert(userA.id(), EMAIL, crypto.encrypt(AUTH_CODE));

    service.refresh(userA.id(), account.id());

    Attachment att = attachmentRepo.findByMessage(messageRepo.listByAccount(account.id(), 1, 20).get(0).id()).get(0);
    assertTrue(att.filePath().startsWith("attachments/" + userA.id() + "/" + account.id() + "/"));
}
```

- [ ] **Step 3: Run mail tests and confirm failure**

Run:

```powershell
mvn -Dtest=MailQueryServiceTest,MailSyncServiceTest,MessageRepositoryTest,AttachmentRepositoryTest test
```

Workdir: `backend`

Expected:

- FAIL because user-scoped methods are missing.

- [ ] **Step 4: Add user-scoped MessageRepository methods**

Add:

```java
public Optional<Message> findByIdForUser(long userId, long messageId)
public List<Message> listByAccountForUser(long userId, long accountId, int page, int size)
public long countByAccountForUser(long userId, long accountId)
public void markReadForUser(long userId, long messageId, boolean read)
```

Use SQL joins:

```sql
SELECT m.* FROM mail_message m
JOIN mail_account a ON a.id = m.account_id
WHERE m.id = ? AND a.user_id = ?
```

For `markReadForUser`, update only when subquery matches:

```sql
UPDATE mail_message
SET is_read = ?
WHERE id = ?
  AND account_id IN (SELECT id FROM mail_account WHERE user_id = ?)
```

If update count is 0, throw `RuntimeException("邮件不存在")`.

- [ ] **Step 5: Add user-scoped AttachmentRepository method**

Add:

```java
public Optional<Attachment> findByIdForUser(long userId, long messageId, long attachmentId)
```

Use join through `mail_message` and `mail_account`.

- [ ] **Step 6: Update MailQueryService signatures**

Change methods:

```java
list(long userId, long accountId, int page, int size)
getDetail(long userId, long messageId)
markRead(long userId, long messageId, boolean read)
loadAttachment(long userId, long messageId, long attachmentId)
```

Rules:

- `getDetail` uses `messageRepo.findByIdForUser`.
- `loadAttachment` uses `attachmentRepo.findByIdForUser`.
- Other-user access results in empty or exception that route maps to 404.

- [ ] **Step 7: Update MailSyncService signatures and attachment path**

Change:

```java
refresh(long userId, long accountId)
```

Rules:

- Load account via `accountRepo.findById(userId, accountId)`.
- `storeMessage` takes `userId`.
- Attachment directory is:

```java
Path dir = attachmentsDir
        .resolve(String.valueOf(userId))
        .resolve(String.valueOf(accountId))
        .resolve(String.valueOf(messageId));
```

- Relative path is:

```java
attachments/{userId}/{accountId}/{messageId}/{safeName}
```

- [ ] **Step 8: Run mail tests**

Run:

```powershell
mvn -Dtest=MailQueryServiceTest,MailSyncServiceTest,MessageRepositoryTest,AttachmentRepositoryTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 9: 提交 Task 6**

Run:

```powershell
git add backend/src/main/java/com/maildock/repository backend/src/main/java/com/maildock/service/MailQueryService.java backend/src/main/java/com/maildock/service/MailSyncService.java backend/src/test/java/com/maildock/repository backend/src/test/java/com/maildock/service/MailQueryServiceTest.java backend/src/test/java/com/maildock/service/MailSyncServiceTest.java
git commit -m "feat: isolate mail data by user"
```

---

### Task 7: WebVerticle 与 ApiRouter 接入 Cookie Session

**Files:**
- Modify: `backend/src/main/java/com/maildock/web/WebVerticle.java`
- Modify: `backend/src/main/java/com/maildock/web/ApiRouter.java`
- Modify: `backend/pom.xml`
- Test: `backend/src/test/java/com/maildock/web/AuthRouteTest.java`
- Test: `backend/src/test/java/com/maildock/web/AccountRouteTest.java`
- Test: `backend/src/test/java/com/maildock/web/MailRouteTest.java`
- Test: `backend/src/test/java/com/maildock/web/WebVerticleTest.java`

- [ ] **Step 1: Add HTTP client dependency for OAuth**

Modify `backend/pom.xml` dependencies:

```xml
<dependency>
    <groupId>io.vertx</groupId>
    <artifactId>vertx-web-client</artifactId>
</dependency>
```

It already exists as test scope; add a compile dependency or remove the test scope from the existing entry. Keep one dependency entry.

- [ ] **Step 2: Update AuthRouteTest for Cookie session**

Tests:

```java
@Test
void emailLoginSetsHttpOnlyCookieAndMeReturnsUser(VertxTestContext ctx) {
    client.post(port, "localhost", ApiRouter.API + "/auth/login")
            .sendJsonObject(new JsonObject().put("email", "alice@example.com").put("password", "init-pass"))
            .compose(loginResp -> {
                String cookie = loginResp.getHeader("Set-Cookie");
                ctx.verify(() -> {
                    assertEquals(200, loginResp.statusCode());
                    assertTrue(cookie.contains("maildock_session="));
                    assertTrue(cookie.contains("HttpOnly"));
                    assertTrue(cookie.contains("SameSite=Lax"));
                });
                return client.get(port, "localhost", ApiRouter.API + "/auth/me")
                        .putHeader("Cookie", cookie)
                        .send();
            })
            .onComplete(ctx.succeeding(meResp -> ctx.verify(() -> {
                assertEquals(200, meResp.statusCode());
                assertEquals("alice@example.com", meResp.bodyAsJsonObject().getString("primaryEmail"));
                ctx.completeNow();
            })));
}
```

Add tests:

- `/auth/me` without cookie returns 401.
- logout clears cookie and invalidates session.
- `/auth/linuxdo/start` without OAuth config returns 500.

- [ ] **Step 3: Update AccountRouteTest and MailRouteTest auth setup**

Replace bearer token setup:

```java
String cookie = loginResp.getHeader("Set-Cookie");
```

Use `.putHeader("Cookie", cookie)` for protected requests.

Add route isolation tests:

- Create user A cookie and user B cookie.
- User A cannot list user B account.
- User A cannot refresh user B account.
- User A cannot download user B attachment.

- [ ] **Step 4: Run web tests and confirm failure**

Run:

```powershell
mvn -Dtest=AuthRouteTest,AccountRouteTest,MailRouteTest,WebVerticleTest test
```

Workdir: `backend`

Expected:

- FAIL because router still uses bearer token and admin login.

- [ ] **Step 5: Implement ApiRouter auth routes**

Routes:

```java
router.post(API + "/auth/login").handler(this::handleEmailLogin);
router.get(API + "/auth/linuxdo/start").handler(this::handleLinuxdoStart);
router.get(API + "/auth/linuxdo/callback").handler(this::handleLinuxdoCallback);
router.route(API + "/*").handler(this::authMiddleware);
router.get(API + "/auth/me").handler(this::handleMe);
router.post(API + "/auth/logout").handler(this::handleLogout);
```

Cookie helpers:

```java
private static final String SESSION_COOKIE = "maildock_session";
private String sessionToken(RoutingContext ctx)
private void setSessionCookie(RoutingContext ctx, String token)
private void clearSessionCookie(RoutingContext ctx)
private long currentUserId(RoutingContext ctx)
```

Middleware:

- Allow `/auth/login`, `/auth/linuxdo/start`, `/auth/linuxdo/callback`.
- Read cookie token.
- Resolve user ID from `AuthService`.
- Store it with `ctx.put("currentUserId", userId)`.
- Missing or invalid session returns 401.

Set-Cookie must include:

```text
maildock_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=<ttl seconds>
```

Include `Secure` only when `AppConfig.sessionCookieSecure()` is true.

- [ ] **Step 6: Wire all service calls with currentUserId**

Examples:

```java
long userId = currentUserId(ctx);
accountService.queryAccounts(userId, email, status, sortBy, sortOrder, page, size)
mailSyncService.refresh(userId, accountId)
mailQueryService.getDetail(userId, messageId)
```

Map missing/foreign resources to 404 in route handlers.

- [ ] **Step 7: Implement real OAuthClient**

Create package-private class inside `WebVerticle` or separate file `VertxOAuthClient`:

```java
public final class VertxOAuthClient implements OAuthClient
```

Use Vert.x `WebClient`.

Token exchange:

- POST configured token URL.
- Send form fields: `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`.
- Parse `access_token`.

Userinfo:

- GET configured userinfo URL.
- Header `Authorization: Bearer <accessToken>`.
- Map fields based on AppConfig field names.

If HTTP status is non-2xx, throw `RuntimeException`.

- [ ] **Step 8: Update WebVerticle wiring**

Instantiate:

```java
UserRepository userRepo = new UserRepository(database);
IdentityRepository identityRepo = new IdentityRepository(database);
SessionStore sessionStore = new SessionStore();
AuthService authService = new AuthService(userRepo, identityRepo, sessionStore, Duration.ofHours(config.sessionTtlHours()));
authService.ensureDefaultEmailUser(config.defaultEmail(), config.defaultPassword());
```

Remove `AdminRepository` and generated password logging.

Create `LinuxDoOAuthService` with config and `OAuthClient`.

Pass config needed for cookie to `ApiRouter` constructor.

- [ ] **Step 9: Run web tests**

Run:

```powershell
mvn -Dtest=AuthRouteTest,AccountRouteTest,MailRouteTest,WebVerticleTest test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 10: Run all backend tests**

Run:

```powershell
mvn test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 11: 提交 Task 7**

Run:

```powershell
git add backend/pom.xml backend/src/main/java/com/maildock backend/src/test/java/com/maildock
git commit -m "feat: wire cookie auth and user-scoped api"
```

---

### Task 8: 前端 Cookie 会话与登录页

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/pages/MailDetailPage.tsx`
- Modify: `frontend/src/pages/MailDetailPage.test.tsx`

- [ ] **Step 1: Update ApiClient tests for cookie session**

Expected changes:

```ts
it('login posts email password and relies on cookie session', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, primaryEmail: 'a@example.com', displayName: 'a@example.com' }));

  const user = await client.login('a@example.com', 'pass');

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/v1/auth/login');
  expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com', password: 'pass' });
  expect(init.credentials).toBe('include');
  expect(user.primaryEmail).toBe('a@example.com');
  expect(localStorage.getItem('maildock_token')).toBeNull();
});
```

Add tests:

```ts
it('me calls auth me with credentials include', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, primaryEmail: 'a@example.com' }));

  await client.me();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/v1/auth/me');
  expect(init.credentials).toBe('include');
});

it('linuxDoLoginUrl returns start endpoint', () => {
  expect(client.linuxDoLoginUrl()).toBe('/api/v1/auth/linuxdo/start');
});
```

- [ ] **Step 2: Update LoginPage tests**

Replace username expectations with email:

```ts
fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
fireEvent.click(screen.getByRole('button', { name: '登录' }));

await waitFor(() => expect(onLogin).toHaveBeenCalledWith('a@example.com', 'secret'));
```

Add linux.do button test:

```ts
fireEvent.click(screen.getByRole('button', { name: '使用 linux.do 登录' }));
expect(onLinuxDoLogin).toHaveBeenCalled();
```

- [ ] **Step 3: Update App tests**

Use `api.me` for startup:

- `api.me` resolves user -> accounts page renders.
- `api.me` rejects -> login page renders.
- login success sets view to accounts.
- logout calls `api.logout` and returns login.

- [ ] **Step 4: Run frontend tests and confirm failure**

Run:

```powershell
npm test
```

Workdir: `frontend`

Expected:

- FAIL because client/App/Login still use token and username.

- [ ] **Step 5: Update ApiClient**

Add:

```ts
export interface CurrentUser {
  id: number;
  primaryEmail: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}
```

Remove:

- `TOKEN_KEY`
- `token` field
- `getToken`
- `setToken`
- `clearToken`
- Authorization header logic.

Change:

```ts
async me(): Promise<CurrentUser>
async login(email: string, password: string): Promise<CurrentUser>
linuxDoLoginUrl(): string
```

Every `fetch` call must include:

```ts
credentials: 'include'
```

`logout()` no longer clears localStorage; it just POSTs and ignores errors in finally-free style.

- [ ] **Step 6: Update App**

State includes loading:

```ts
type View =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'accounts'; user: CurrentUser }
  | { name: 'mailList'; user: CurrentUser; accountId: number }
  | { name: 'mailDetail'; user: CurrentUser; accountId: number; messageId: number };
```

On mount:

```ts
api.me().then(user => setView({ name: 'accounts', user })).catch(() => setView({ name: 'login' }));
```

Linux.do login handler:

```ts
window.location.href = api.linuxDoLoginUrl();
```

Topbar displays:

```tsx
{view.user.displayName || view.user.primaryEmail || 'MailDock 用户'}
```

- [ ] **Step 7: Update LoginPage**

Props:

```ts
onLogin: (email: string, password: string) => Promise<void>;
onLinuxDoLogin: () => void;
```

Labels:

```text
邮箱
密码
登录
使用 linux.do 登录
```

Use `autoComplete="email"` for email.

- [ ] **Step 8: Update attachment behavior if needed**

Keep:

```ts
attachmentUrl(messageId, attachmentId)
```

Do not append token query params. Normal anchor downloads rely on Cookie.

- [ ] **Step 9: Run frontend tests**

Run:

```powershell
npm test
```

Workdir: `frontend`

Expected:

- PASS.

- [ ] **Step 10: 提交 Task 8**

Run:

```powershell
git add frontend/src
git commit -m "feat: use cookie sessions in frontend"
```

---

### Task 9: 文档清理与全量验证

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-06-12-linuxdo-oauth-user-isolation-design.md` if implementation reveals a precise decided detail.

- [ ] **Step 1: Update README**

Replace admin login/config text with:

```text
MAILDOCK_DEFAULT_EMAIL=you@example.com
MAILDOCK_DEFAULT_PASSWORD=your_password
```

Document linux.do OAuth config:

```text
MAILDOCK_LINUXDO_CLIENT_ID
MAILDOCK_LINUXDO_CLIENT_SECRET
MAILDOCK_LINUXDO_AUTH_URL
MAILDOCK_LINUXDO_TOKEN_URL
MAILDOCK_LINUXDO_USERINFO_URL
MAILDOCK_LINUXDO_SCOPE
MAILDOCK_LINUXDO_USER_ID_FIELD
MAILDOCK_LINUXDO_EMAIL_FIELD
MAILDOCK_LINUXDO_NAME_FIELD
MAILDOCK_LINUXDO_AVATAR_FIELD
MAILDOCK_PUBLIC_BASE_URL
```

Document:

- First startup creates the default email user only when email and password are both configured.
- Users are normal users, not administrators.
- Existing old database data is not migrated.

- [ ] **Step 2: Update CLAUDE.md**

Replace admin terminology with:

- 用户认证。
- Cookie session。
- `app_user` / `user_identity`。
- 邮箱账号按 `user_id` 隔离。
- API client uses Cookie, not localStorage bearer token.

- [ ] **Step 3: Search for stale admin wording**

Run:

```powershell
rg -n "admin_user|AdminRepository|管理员登录|MAILDOCK_ADMIN|Bearer Token|localStorage" README.md CLAUDE.md backend frontend
```

Expected:

- No stale production documentation or source comments remain.
- Test names may mention old text only if file is being deleted in the same task. Prefer no matches.

- [ ] **Step 4: Run backend tests**

Run:

```powershell
mvn test
```

Workdir: `backend`

Expected:

- PASS.

- [ ] **Step 5: Run frontend tests**

Run:

```powershell
npm test
```

Workdir: `frontend`

Expected:

- PASS.

- [ ] **Step 6: Build backend**

Run:

```powershell
mvn package
```

Workdir: `backend`

Expected:

- PASS and `target/maildock-backend-fat.jar` exists.

- [ ] **Step 7: Build frontend**

Run:

```powershell
npm run build
```

Workdir: `frontend`

Expected:

- PASS and `dist/` exists.

- [ ] **Step 8: Final git status check**

Run:

```powershell
git status --short
```

Expected:

- Only intended documentation changes are unstaged before commit.
- No build artifacts such as `backend/target/` or `frontend/dist/` are tracked unless the repo already tracks them.

- [ ] **Step 9: 提交 Task 9**

Run:

```powershell
git add README.md CLAUDE.md docs/superpowers/specs/2026-06-12-linuxdo-oauth-user-isolation-design.md
git commit -m "docs: update auth and user isolation docs"
```

---

## 计划自检清单

实现完成后必须满足：

- 没有 `admin_user` 主流程。
- 没有 `MAILDOCK_ADMIN_USER` / `MAILDOCK_ADMIN_PASS` 文档化配置。
- `mail_account` 使用 `(user_id, email)` 唯一约束。
- 同一邮箱可被不同用户分别添加。
- `/auth/login` 使用 `{ email, password }`。
- `/auth/me` 通过 Cookie 返回当前用户。
- `/auth/linuxdo/start` 和 `/auth/linuxdo/callback` 存在。
- 前端不使用 localStorage token。
- 账号、邮件、附件跨用户访问返回 404 或被当作不存在。
- 后端 `mvn test`、前端 `npm test`、后端 `mvn package`、前端 `npm run build` 全部通过。

