# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 项目概览

MailDock 是一个邮箱一站式服务，首期仅支持 163 邮箱（IMAP + 授权码）。用户登录后管理自己的多个邮箱账号，手动触发增量同步，把完整邮件（头、正文、附件）落地存储。前后端分离：后端 JDK 21 + Vert.x + SQLite，前端 React + Vite + TypeScript。

基础设计见 `docs/superpowers/specs/2026-06-11-maildock-design.md`。linux.do OAuth、普通用户体系和用户数据隔离设计见 `docs/superpowers/specs/2026-06-12-linuxdo-oauth-user-isolation-design.md`，认证与数据隔离以该文档为准。个人中心与头像下拉菜单见 `docs/superpowers/specs/2026-06-12-user-profile-center-design.md`。全站视觉重构与后续 UI 修复见 `docs/superpowers/specs/2026-06-12-full-visual-refactor-design.md`、`docs/superpowers/specs/2026-06-13-ui-fixes-design.md`。

## 常用命令

后端（在 `backend/` 下，需要 JDK 21 + Maven）：

```bash
mvn test                                          # 跑全部测试
mvn test -Dtest=MailSyncServiceTest               # 跑单个测试类
mvn test -Dtest=MailSyncServiceTest#methodName    # 跑单个测试方法
mvn package                                        # 构建 fat-jar → target/maildock-backend-fat.jar
MAILDOCK_SECRET_KEY='<32字节密钥>' MAILDOCK_DEFAULT_EMAIL='you@example.com' MAILDOCK_DEFAULT_PASSWORD='密码' java -jar target/maildock-backend-fat.jar   # 运行
```

前端（在 `frontend/` 下）：

```bash
npm run dev          # 开发服务器，端口 5173，/api 代理到后端 8080
npm run build        # tsc -b && vite build → dist/
npm test             # vitest run（跑全部测试）
npm run test:watch   # vitest watch 模式
npx vitest run src/pages/LoginPage.test.tsx   # 跑单个测试文件
```

运行后端必须设置环境变量 `MAILDOCK_SECRET_KEY`（必须正好 32 字节，AES-256）。或将配置写在项目根目录的 `maildock.properties` 文件中（环境变量优先级更高）。可选配置：`MAILDOCK_DEFAULT_EMAIL`、`MAILDOCK_DEFAULT_PASSWORD`（两者同时配置才创建预制邮箱密码用户）、`MAILDOCK_LINUXDO_CLIENT_ID`、`MAILDOCK_LINUXDO_CLIENT_SECRET`、`MAILDOCK_LINUXDO_AUTH_URL`、`MAILDOCK_LINUXDO_TOKEN_URL`、`MAILDOCK_LINUXDO_USERINFO_URL`、`MAILDOCK_LINUXDO_SCOPE`、`MAILDOCK_LINUXDO_USER_ID_FIELD`、`MAILDOCK_LINUXDO_EMAIL_FIELD`、`MAILDOCK_LINUXDO_NAME_FIELD`、`MAILDOCK_LINUXDO_AVATAR_FIELD`、`MAILDOCK_PUBLIC_BASE_URL`（OAuth callback 基础 URL）、`MAILDOCK_FRONTEND_URL`（OAuth 成功后的前端跳转地址，默认 `/`）、`MAILDOCK_SESSION_COOKIE_SECURE`、`MAILDOCK_SESSION_TTL_HOURS`、`MAILDOCK_HTTP_PROXY_HOST`、`MAILDOCK_HTTP_PROXY_PORT`、`MAILDOCK_HTTP_PORT`（默认 8080）、`MAILDOCK_DB_PATH`（默认 `data/maildock.db`）、`MAILDOCK_ATTACHMENTS_DIR`（默认 `data/attachments`）。

## 架构要点

请求流向：React 前端（react-router）→ REST API（前缀 `/api/v1`）→ Vert.x Web Router（`ApiRouter`）→ Handler → Service 层 → Repository（DAO）→ SQLite。

**分层职责（后端 `com.maildock`）**
- `MainVerticle` → `WebVerticle`：`WebVerticle` 只负责启动 / 停止 HTTP 服务；依赖装配已下沉到 `bootstrap/AppWiring`，新增 Repository / Service / Router 接线时优先改 `bootstrap/`。
- `bootstrap/`：应用装配层。`AppWiring` 手动 new 出 Repository / Service / Router / StaticHandler，并返回 `AppRuntime`；这里是后端无 DI 框架时的装配中心。
- `web/ApiRouter`：只负责拼路由表、挂公共中间件与 failureHandler，不再内联具体接口实现。
- `web/handler/`：按领域拆分 HTTP handler（`AuthApiHandler`、`SessionApiHandler`、`AccountApiHandler`、`MailApiHandler`、`UserApiHandler`）。Handler 只做参数校验、鉴权上下文提取、`executeBlocking` 包装与 JSON / 文件响应封装。
- `web/support/`：Handler 共享的小型工具（请求体读取、统一 JSON 响应、Cookie 读写、当前用户 / 路径参数提取、用户 JSON 序列化）。
- `service/`：`AuthService`、`LinuxDoOAuthService`、`AccountService`、`MailSyncService`、`MailQueryService` 为主服务；账号领域又拆出 `AccountConnectionTester`、`AccountImporter`、`AccountDeletionService`，避免 `AccountService` 继续膨胀。
- `repository/`：DAO 封装 SQLite 读写。
- `mail/`：IMAP 收取与 MIME 解析。
- `security/`：`CryptoUtil`（AES-GCM）、`SessionStore`（进程内存 Session）。
- `storage/`：`AttachmentStorage` 负责附件落盘路径解析、读取与删除，不把文件系统细节散落在 Service 中。

**关键约束（改动时务必遵守）**
- **事件循环不可阻塞**：所有阻塞操作（JavaMail IMAP、JDBC、磁盘 I/O）必须包在 `vertx.executeBlocking(..., false)` 里。现在这个约束主要落实在 `web/handler/*`，新增接口时照抄对应 handler 的现有写法。
- **SQLite 写串行化**：`Database` 持有单连接 + 一把 `ReentrantLock`。所有写操作必须经 `database.runWrite(() -> ...)` 执行，否则会触发 `SQLITE_BUSY`。读操作不加锁。
- **授权码绝不外泄**：`mail_account.auth_code_enc` 是 AES-GCM 密文。`accountToJson()` 刻意不含授权码字段；序列化账号时不要加回去。授权码也不得出现在日志中。
- **用户数据必须隔离**：`app_user` / `user_identity` 是用户与登录身份模型；`mail_account.user_id` 决定账号归属，邮件与附件必须经账号关系限制到当前用户。新增账号、邮件、附件查询或写入时都要显式传入 `currentUserId`，跨用户资源返回 404 或按不存在处理。
- **增量同步基于 UID**：用 IMAP UID（稳定）而非邮件序号做增量依据。`last_uid` 记录上次最大 UID，下次拉 `UID > last_uid`。同时校验 `uid_validity`，变化时重置 `last_uid` 全量重拉。`UNIQUE(account_id, uid)` 防重复入库。
- **163 ID 命令**：连接 163 IMAP 登录后必须发送 RFC 2971 ID 命令（`ImapClient.sendId()`），否则报 "Unsafe Login"。对不支持 ID 的服务器（如测试用 GreenMail）容错忽略。
- **IMAP 超时设置**：`connectiontimeout=15000`、`timeout=30000`、`writetimeout=10000`（毫秒），防止批量测活时线程长时间阻塞。
- **账号列表排序**：默认按 `lastSyncAt` 倒序，前端通过工具栏下拉切换排序字段（`lastTestAt`/`lastSyncAt`）和方向（asc/desc）。Repository 使用字段白名单防止 SQL 注入。
- **当前用户资料**：`PATCH /api/v1/users/me` 只允许更新当前用户 `displayName`；`POST /api/v1/users/me/password` 只对邮箱密码用户可用，linux.do 用户返回 403。`/auth/me` 和登录响应包含 `hasPassword`。
- **API 前缀是 `/api/v1`**（`ApiRouter.API` 常量）。设计文档里有些地方写 `/api`，以代码常量为准。

**依赖注入测试缝**：Service 通过 `ImapClientFactory` 函数式接口接收 IMAP 客户端工厂，生产用 `ImapClient::new`，测试注入假实现或指向 GreenMail——新增涉及外部 IO 的 Service 时沿用此模式。

**前端结构**：前端已使用 `react-router-dom`，入口在 `App.tsx`，通过 `BrowserRouter + Routes + ProtectedRoute` 管理 `/login`、`/auth/callback`、`/accounts`、`/accounts/:accountId/messages`、`/accounts/:accountId/messages/:messageId`、`/profile`。网络请求走 `api/client.ts` 封装的 `fetch`，所有请求使用 `credentials: 'include'` 依赖 HttpOnly Cookie Session，不在浏览器持久存储里保存登录令牌。除登录与 OAuth callback 外，各主视图统一渲染 `components/Header.tsx` 顶栏，右侧 `UserMenu` 提供个人中心、邮件列表入口与退出登录。账号页仍由 `pages/AccountsPage.tsx` 承载主流程，但纯逻辑已拆到 `pages/accountsPageModel.ts`，弹窗与行菜单拆到 `pages/accounts/`；新增账号页相关交互时优先沿用这个拆分方式，不要把新职责重新塞回页面文件。UI 使用 Tailwind CSS 3.4.19 + `lucide-react` 图标；账号管理支持白色卡片工具栏、桌面表格、移动端卡片、复选框批量选择、批量删除、批量测活、导入/新增弹窗，删除操作有二次确认。`utils/email.ts` 的 `truncateEmail` 用于长邮箱中间省略，必须保留完整邮箱在 `title` 中。收信刷新无论是否有新邮件都会显示 Toast。

## 开发策略

**强制要求：必须使用技能 `superpowers:test-driven-development` 进行开发和需求变更，不得绕过 TDD。** 任何新增功能、修改功能或修复 bug，都必须遵循 TDD 流程（先写失败测试 → 写最小实现让测试通过 → 重构），不允许跳过先写测试这一步。

## 测试策略

- Service 层用 JUnit 5；邮件解析用真实 MIME 样本测试，不依赖网络。
- 持久层用临时 SQLite 文件库测 CRUD 与事务。
- IMAP 同步用 GreenMail（内嵌邮件服务器）模拟，不依赖真实 163 账号。
- API 测试用 Vert.x WebClient 直打路由，验证鉴权、参数校验、响应格式。
- 前端用 vitest + @testing-library/react（jsdom）。每个 page/模块旁边有同名 `.test.tsx`/`.test.ts`。

新增功能或修 bug 时补对应层的测试，遵循上述就近放置的约定。

## 非目标（首期不做）

邮件发送（SMTP）、自动定时刷新/实时推送、INBOX 以外的文件夹、163 以外的邮箱服务商。
