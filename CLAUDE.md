# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

MailDock 是一个邮箱一站式服务，首期仅支持 163 邮箱（IMAP + 授权码）。管理员登录后管理多个邮箱账号，手动触发增量同步，把完整邮件（头、正文、附件）落地存储。前后端分离：后端 JDK 21 + Vert.x + SQLite，前端 React + Vite + TypeScript。

完整设计见 `docs/superpowers/specs/2026-06-11-maildock-design.md`，它是需求与架构的权威来源。

## 常用命令

后端（在 `backend/` 下，需要 JDK 21 + Maven）：

```bash
mvn test                                          # 跑全部测试
mvn test -Dtest=MailSyncServiceTest               # 跑单个测试类
mvn test -Dtest=MailSyncServiceTest#methodName    # 跑单个测试方法
mvn package                                        # 构建 fat-jar → target/maildock-backend-fat.jar
MAILDOCK_SECRET_KEY='<32字节密钥>' java -jar target/maildock-backend-fat.jar   # 运行
```

前端（在 `frontend/` 下）：

```bash
npm run dev          # 开发服务器，端口 5173，/api 代理到后端 8080
npm run build        # tsc -b && vite build → dist/
npm test             # vitest run（跑全部测试）
npm run test:watch   # vitest watch 模式
npx vitest run src/pages/LoginPage.test.tsx   # 跑单个测试文件
```

运行后端必须设置环境变量 `MAILDOCK_SECRET_KEY`（必须正好 32 字节，AES-256）。或将配置写在项目根目录的 `maildock.properties` 文件中（环境变量优先级更高）。可选配置：`MAILDOCK_ADMIN_USER`（默认 `admin`）、`MAILDOCK_ADMIN_PASS`（未提供则自动生成并打印到启动日志）、`MAILDOCK_HTTP_PORT`（默认 8080）、`MAILDOCK_DB_PATH`（默认 `data/maildock.db`）、`MAILDOCK_ATTACHMENTS_DIR`（默认 `data/attachments`）。

## 架构要点

请求流向：React 前端 → REST API（前缀 `/api/v1`）→ Vert.x Web Router（`ApiRouter`）→ Service 层 → Repository（DAO）→ SQLite。

**分层职责（后端 `com.maildock`）**
- `MainVerticle` → `WebVerticle`：`WebVerticle.start()` 是依赖装配中心，手动 new 出所有 Repository/Service 并接线（无 DI 框架）。新增 Service 时在此注册。
- `web/ApiRouter`：构建路由表 + Token 鉴权中间件 + 统一 failureHandler。Handler 只做参数校验与 JSON 封装，业务逻辑全部下沉到 Service。
- `service/`：`AuthService`、`AccountService`、`MailSyncService`、`MailQueryService`，单一职责。
- `repository/`：DAO 封装 SQLite 读写。
- `mail/`：IMAP 收取与 MIME 解析。
- `security/`：`CryptoUtil`（AES-GCM）、`TokenStore`（进程内存 Token）。

**关键约束（改动时务必遵守）**
- **事件循环不可阻塞**：所有阻塞操作（JavaMail IMAP、JDBC、磁盘 I/O）必须包在 `vertx.executeBlocking(..., false)` 里。`ApiRouter` 的每个 handler 都遵循这个模式——照抄现有写法。`ordered=false` 允许并行执行。
- **SQLite 写串行化**：`Database` 持有单连接 + 一把 `ReentrantLock`。所有写操作必须经 `database.runWrite(() -> ...)` 执行，否则会触发 `SQLITE_BUSY`。读操作不加锁。
- **授权码绝不外泄**：`mail_account.auth_code_enc` 是 AES-GCM 密文。`accountToJson()` 刻意不含授权码字段；序列化账号时不要加回去。授权码也不得出现在日志中。
- **增量同步基于 UID**：用 IMAP UID（稳定）而非邮件序号做增量依据。`last_uid` 记录上次最大 UID，下次拉 `UID > last_uid`。同时校验 `uid_validity`，变化时重置 `last_uid` 全量重拉。`UNIQUE(account_id, uid)` 防重复入库。
- **163 ID 命令**：连接 163 IMAP 登录后必须发送 RFC 2971 ID 命令（`ImapClient.sendId()`），否则报 "Unsafe Login"。对不支持 ID 的服务器（如测试用 GreenMail）容错忽略。
- **IMAP 超时设置**：`connectiontimeout=15000`、`timeout=30000`、`writetimeout=10000`（毫秒），防止批量测活时线程长时间阻塞。
- **账号列表排序**：默认按 `lastSyncAt` 倒序，支持点击表头切换排序字段（`lastTestAt`/`lastSyncAt`）和方向（asc/desc）。Repository 使用字段白名单防止 SQL 注入。
- **API 前缀是 `/api/v1`**（`ApiRouter.API` 常量）。设计文档里有些地方写 `/api`，以代码常量为准。

**依赖注入测试缝**：Service 通过 `ImapClientFactory` 函数式接口接收 IMAP 客户端工厂，生产用 `ImapClient::new`，测试注入假实现或指向 GreenMail——新增涉及外部 IO 的 Service 时沿用此模式。

**前端结构**：无 react-router（虽然 package.json 装了，但 `App.tsx` 用自带状态机 `View` 联合类型在 login/accounts/mailList/mailDetail 间切换）。网络请求走 `api/client.ts` 封装的 `fetch`，Token 由 client 管理。新增页面在 `App.tsx` 的 `View` 类型和渲染分支里挂载。UI 使用 Tailwind CSS 3.4.19，表格列默认居中对齐。账号管理支持复选框批量选择、批量删除、批量测活，删除操作有二次确认。

## 测试策略

- Service 层用 JUnit 5；邮件解析用真实 MIME 样本测试，不依赖网络。
- 持久层用临时 SQLite 文件库测 CRUD 与事务。
- IMAP 同步用 GreenMail（内嵌邮件服务器）模拟，不依赖真实 163 账号。
- API 测试用 Vert.x WebClient 直打路由，验证鉴权、参数校验、响应格式。
- 前端用 vitest + @testing-library/react（jsdom）。每个 page/模块旁边有同名 `.test.tsx`/`.test.ts`。

新增功能或修 bug 时补对应层的测试，遵循上述就近放置的约定。

## 非目标（首期不做）

邮件发送（SMTP）、自动定时刷新/实时推送、INBOX 以外的文件夹、多用户/权限分级、163 以外的邮箱服务商。
