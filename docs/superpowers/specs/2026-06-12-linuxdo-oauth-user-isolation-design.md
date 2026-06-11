# MailDock linux.do OAuth 与用户隔离设计

- 日期：2026-06-12
- 状态：已确认，待实施计划

## 1. 背景

MailDock 当前是单管理员模型：一个管理员用户名密码账号管理全局邮箱账号池。这个模型已经不符合新的产品形态。

新的模型是：

- MailDock 用户就是普通用户，不是管理员。
- 用户可以使用预制的邮箱 + 密码账号登录。
- 用户可以使用 linux.do OAuth 登录。
- 任意 linux.do 用户都可以登录，首次登录自动创建 MailDock 用户。
- 每个 MailDock 用户都有自己的邮箱列表。
- 邮箱账号、邮件、附件都必须按用户隔离。
- 不需要迁移旧数据库数据。

本设计用普通用户与登录身份模型替换 `admin_user` 概念。

## 2. 目标

- 移除管理员语义，使用普通用户语义。
- 支持预制邮箱 + 密码登录。
- 支持 linux.do OAuth 登录，并在首次登录时自动创建用户。
- 使用 HttpOnly Cookie 会话，替代 localStorage Bearer Token。
- 让 `mail_account` 与用户建立归属关系。
- 确保账号、邮件、附件相关操作都被当前用户隔离。
- 允许同一个邮箱地址被不同 MailDock 用户分别添加。
- 为后续邮箱验证码注册和账号绑定预留清晰模型。

## 3. 非目标

- 不迁移旧数据库。旧的 `admin_user` 和全局 `mail_account` 数据不保留。
- 本次不做公开注册。
- 本次不做邮箱验证码登录。
- 本次不做账号绑定 UI 或绑定 API。
- 不引入 Redis 或外部会话存储。
- 不引入角色或管理员权限系统。

部署本次改造时，应使用新的 SQLite 数据库，或明确删除并重建旧数据库。

## 4. 架构边界

后端按四个概念边界拆分：

```text
Auth / Session
  邮箱密码登录、linux.do OAuth 回调、Cookie 会话、当前用户识别。

User / Identity
  app_user 与 user_identity 持久化。
  用户是产品账号；identity 是一种登录方式。

Account / Mail
  邮箱账号、邮件、附件。
  所有操作都按 app_user.id 隔离。

Frontend
  登录页、会话恢复、用户展示、登出。
```

建议的后端类：

```text
UserRepository
IdentityRepository
AuthService
LinuxDoOAuthService
SessionStore
```

`AuthService` 可以保留名字，但语义从“管理员认证”改成“用户认证与会话签发”。

所有受保护请求都经过认证中间件：

```text
Request
  -> 读取 maildock_session Cookie
  -> SessionStore 将 token 解析为 currentUserId
  -> 路由处理器把 currentUserId 传给 Service
```

业务服务不能从客户端参数推断用户归属。路由层必须传入 `currentUserId`，Repository 查询必须按它约束数据范围。

## 5. 数据模型

### 5.1 用户表

```sql
CREATE TABLE app_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    primary_email TEXT,
    display_name  TEXT,
    avatar_url    TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    last_login_at INTEGER
);
```

`primary_email` 不做全局唯一。这样邮箱密码用户、linux.do 用户、未来邮箱验证码用户在显式绑定前可以保持独立。

### 5.2 登录身份表

```sql
CREATE TABLE user_identity (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    provider     TEXT NOT NULL,
    provider_uid TEXT NOT NULL,
    secret_hash  TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES app_user(id),
    UNIQUE (provider, provider_uid)
);
```

本次支持两个 provider：

```text
email_password
linuxdo
```

`email_password` 的 `provider_uid` 是规范化后的邮箱地址，小写并去掉首尾空白；`secret_hash` 保存 BCrypt 密码哈希。

`linuxdo` 的 `provider_uid` 是 linux.do 返回的稳定用户 ID，不能使用可变昵称。

未来邮箱验证码注册可以增加 `email_otp` identity，也可以复用邮箱身份流程；无论哪种方式，都不需要改 `mail_account` 的归属模型。

### 5.3 邮箱账号表

```sql
CREATE TABLE mail_account (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    email           TEXT NOT NULL,
    auth_code_enc   TEXT NOT NULL,
    imap_host       TEXT NOT NULL DEFAULT 'imap.163.com',
    imap_port       INTEGER NOT NULL DEFAULT 993,
    last_uid        INTEGER DEFAULT 0,
    uid_validity    INTEGER DEFAULT 0,
    last_sync_at    INTEGER,
    last_test_at    INTEGER,
    last_test_ok    INTEGER,
    last_test_msg   TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES app_user(id),
    UNIQUE (user_id, email)
);
```

同一个邮箱地址可以被不同用户分别添加。这样不会泄露“这个邮箱已经被别人添加过”。

### 5.4 邮件与附件

`mail_message` 继续归属于 `mail_account`。

`mail_attachment` 继续归属于 `mail_message`。

用户归属链路是：

```text
app_user -> mail_account -> mail_message -> mail_attachment
```

查询邮件和附件时，必须 join 到 `mail_account` 或先校验所属账号。不能只按裸 `messageId` 或 `attachmentId` 查询后直接返回。

建议附件路径改成：

```text
attachments/{userId}/{accountId}/{messageId}/{filename}
```

这样按用户清理和排查文件更直观。

## 6. 配置

新的预制邮箱账号配置：

```text
MAILDOCK_DEFAULT_EMAIL
MAILDOCK_DEFAULT_PASSWORD
```

两个值都存在时，启动流程创建或更新该邮箱对应的 `email_password` identity。这个用户是普通用户，不是管理员。

如果任一值缺失，启动时不创建默认邮箱密码用户。邮箱密码登录接口仍然存在，但在未来增加注册或手工种子数据前，没有预制用户可以通过它登录。

旧配置名不再作为别名：

```text
MAILDOCK_ADMIN_USER
MAILDOCK_ADMIN_PASS
```

这些配置应从文档中移除，并且不进入新的认证主流程。

linux.do 应用信息尚未确认，因此 OAuth 相关信息全部配置化：

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

userinfo 字段配置负责把 linux.do 响应映射成内部结构：

```text
OAuthUser {
  providerUid
  email
  displayName
  avatarUrl
}
```

如果配置的稳定用户 ID 字段不存在，linux.do 登录必须失败关闭。

会话配置：

```text
MAILDOCK_SESSION_COOKIE_SECURE
MAILDOCK_SESSION_TTL_HOURS
```

`MAILDOCK_SESSION_COOKIE_SECURE` 在 HTTPS 部署时应设置为 true；本地开发可以为 false。

`MAILDOCK_SESSION_TTL_HOURS` 默认 24。

## 7. 认证流程

### 7.1 邮箱密码登录

```text
POST /api/v1/auth/login
Body: { email, password }
```

流程：

```text
邮箱去首尾空白并转小写
  -> 查找 user_identity(provider=email_password, provider_uid=email)
  -> 校验 BCrypt 密码
  -> 签发 session token
  -> Set-Cookie: maildock_session=<token>
  -> 返回当前用户摘要
```

失败时返回 401，并使用通用错误：“邮箱或密码错误”。

### 7.2 linux.do OAuth 登录

```text
GET /api/v1/auth/linuxdo/start
```

流程：

```text
校验 OAuth 配置
  -> 生成 state 与 PKCE verifier
  -> 将 OAuth state 存入内存，TTL 为 10 分钟
  -> 跳转到配置的 linux.do 授权地址
```

```text
GET /api/v1/auth/linuxdo/callback
```

流程：

```text
校验 state
  -> 用 code 换 access token
  -> 拉取 userinfo
  -> 规范化为 OAuthUser
  -> 查找或创建 user_identity(provider=linuxdo, providerUid)
  -> 更新 app_user 资料字段
  -> 签发 session cookie
  -> 重定向回前端首页
```

任意有效 linux.do 用户都可以登录。没有白名单，也没有管理员角色。

### 7.3 会话解析

登录后，浏览器 Cookie 里只保存随机 token。

```text
Set-Cookie:
  maildock_session=random-token;
  HttpOnly;
  SameSite=Lax;
  Path=/;
  Max-Age=<session ttl>
```

服务端内存 SessionStore 保存：

```text
random-token -> userId, expiresAt
```

受保护接口通过 session 得到 `currentUserId`。用户 ID 不直接存进 Cookie。

Session 只存在进程内存里。后端重启后，所有用户需要重新登录。

### 7.4 会话 API

```text
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

`/auth/me` 返回当前用户摘要；未登录时返回 401。

`/auth/logout` 删除服务端 session，并清除 Cookie。

## 8. API 与服务隔离

REST 路径可以基本保持现状，但行为必须全部使用 `currentUserId`。

账号接口：

```text
GET    /api/v1/accounts
POST   /api/v1/accounts
POST   /api/v1/accounts/import
POST   /api/v1/accounts/test-batch
POST   /api/v1/accounts/delete-batch
POST   /api/v1/accounts/:id/test
DELETE /api/v1/accounts/:id
```

Service 方法必须显式接收用户 ID：

```java
queryAccounts(userId, ...)
createAccount(userId, email, authCode)
importFromText(userId, text, test, overwrite)
testConnection(userId, accountId)
testBatch(userId, ids)
deleteAccount(userId, accountId)
deleteBatch(userId, ids)
```

邮件接口：

```text
POST  /api/v1/accounts/:id/refresh
GET   /api/v1/accounts/:id/messages
GET   /api/v1/messages/:id
GET   /api/v1/messages/:id/attachments/:attId
PATCH /api/v1/messages/:id/read
```

Service 方法必须显式接收用户 ID：

```java
refresh(userId, accountId)
list(userId, accountId, page, size)
getDetail(userId, messageId)
loadAttachment(userId, messageId, attachmentId)
markRead(userId, messageId, read)
```

越权访问与资源不存在保持一致：

```text
资源不存在
资源属于其他用户
账号、邮件、附件关系不匹配
=> 404
```

批量操作只在当前用户范围内解释。传入其他用户的 ID 时，当作不存在处理。

## 9. 前端设计

前端不再把 token 存到 localStorage。

所有 API 请求都带 Cookie：

```ts
fetch(url, { credentials: 'include' })
```

应用启动时：

```text
GET /api/v1/auth/me
  200 -> 展示账号页
  401 -> 展示登录页
```

登录页：

```text
邮箱
密码
[登录]

[使用 linux.do 登录]
```

邮箱密码登录调用：

```text
POST /api/v1/auth/login
```

linux.do 登录按钮执行：

```text
window.location.href = "/api/v1/auth/linuxdo/start"
```

OAuth callback 完成后，后端重定向回前端首页。前端调用 `/auth/me` 恢复登录态并进入账号页。

顶部栏展示当前用户邮箱或显示名，并保留登出操作。

附件下载可以继续使用普通链接，因为浏览器会自动携带 session Cookie。

## 10. 错误处理

| 场景 | 状态码 | 行为 |
| --- | --- | --- |
| 缺少 session 或 session 过期 | 401 | 前端回到登录页 |
| 邮箱或密码错误 | 401 | 展示通用登录错误 |
| OAuth 配置缺失 | 500 | 返回明确配置错误 |
| OAuth state 不匹配 | 400 | 拒绝 callback |
| OAuth token 或 userinfo 请求失败 | 502 | 登录失败，服务端记录细节 |
| linux.do 响应缺少稳定用户 ID | 502 | 登录失败关闭 |
| 资源属于其他用户 | 404 | 不暴露资源存在性 |
| 当前用户重复添加同一邮箱 | 409 | 提示该邮箱已在当前用户列表中 |
| 其他用户已添加同一邮箱 | 201 | 允许当前用户继续添加 |

以下敏感值不得进入日志：

- 邮箱授权码
- OAuth access token
- Session token
- 密码

## 11. 测试策略

Repository 测试：

- `app_user` 创建、查询、更新。
- `user_identity` 按 provider 和 provider UID 创建、查询。
- `(provider, provider_uid)` 唯一约束。
- `mail_account` 的 `(user_id, email)` 唯一约束。
- 不同用户可以添加同一个邮箱地址。

认证测试：

- 启动时创建配置的邮箱密码用户。
- 配置密码变化时，启动流程更新该邮箱用户的密码哈希。
- 邮箱密码登录成功与失败。
- linux.do 首次登录创建用户和 identity。
- linux.do 再次登录复用已有 identity。
- linux.do 响应缺少稳定用户 ID 时失败关闭。

Session 与中间件测试：

- 有效 Cookie 可以解析出当前用户。
- 缺少 Cookie 返回 401。
- 无效或过期 Cookie 返回 401。
- 登出后 session 失效并清除 Cookie。

API 隔离测试：

- 用户 A 只能看到用户 A 的邮箱账号。
- 用户 A 不能测活、刷新、删除或导入覆盖用户 B 的邮箱账号。
- 用户 A 不能查看用户 B 的邮件列表。
- 用户 A 不能读取用户 B 的邮件详情。
- 用户 A 不能下载用户 B 的附件。
- 用户 A 不能标记用户 B 的邮件已读或未读。
- 批量操作会忽略当前用户范围外的 ID。

前端测试：

- 启动时调用 `/auth/me`。
- `/auth/me` 返回 401 时展示登录页。
- 邮箱密码登录成功后进入账号页。
- linux.do 按钮跳转到 `/api/v1/auth/linuxdo/start`。
- 登出后回到登录页。
- API 请求使用 `credentials: 'include'`。

OAuth 测试必须使用假的 OAuth client 注入固定 userinfo，不能依赖真实 linux.do 网络请求。

## 12. 实施备注

- 将 `Admin` 模型和 `AdminRepository` 从主流程移除或重命名为用户语义。
- README、代码注释、配置文档都要替换管理员表达。
- 保留 `CryptoUtil` 用于邮箱授权码加密。
- 将 `TokenStore` 替换或改造成 `SessionStore`，保存 `userId` 而不是用户名。
- 增加短期内存 OAuth state store，用于保存 state 与 PKCE verifier。
- 初始化新表结构。由于旧数据迁移不在范围内，实施时可以假设使用全新 SQLite 数据库。
- 不增加角色判断。系统只有用户，没有管理员。
