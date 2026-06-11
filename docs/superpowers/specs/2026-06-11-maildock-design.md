# MailDock 邮箱一站式服务 — 设计文档

- 日期：2026-06-11
- 状态：已评审，待实施

## 1. 概述

MailDock 是一个邮箱一站式服务，首期支持 163 邮箱接入。管理员登录后可管理多个 163 邮箱账号，手动刷新某个账号以增量收取 INBOX 收件箱的邮件，存储完整邮件（邮件头、正文、附件）到本地。

技术栈：

- 后端：JDK 21 + Vert.x（异步事件驱动），Jakarta Mail 收取 IMAP，SQLite 持久化。
- 前端：React + Vite，前后端分离，通过 REST API 通信。
- 不接入 Redis，会话 Token 使用进程内存存储。

## 2. 需求摘要

| 维度 | 决策 |
| --- | --- |
| 刷新方式 | 手动点击刷新 |
| 前端形态 | Web 应用，前后端分离（React） |
| 后端技术栈 | JDK 21 + Vert.x |
| 存储范围 | 完整邮件（头、正文 text/html、附件） |
| 账号模式 | 多账号：管理员可添加多个 163 邮箱 |
| 用户体系 | 单租户管理员登录 |
| 163 接入 | IMAP + 授权码 |
| 附件存储 | 文件落盘 + SQLite 存路径与元数据 |
| 同步范围 | 仅 INBOX 收件箱 |
| 刷新行为 | 增量同步（基于 UID） |
| 批量能力 | txt 批量导入（`账号 授权码`）、批量测活，测活状态持久化 |
| 数据库 | SQLite，不接入 Redis |

## 3. 整体架构

```
┌────────────────────────────────────────────┐
│              React 前端 (Vite)                │
│   登录页 / 邮箱账号管理 / 邮件列表 / 邮件详情     │
└───────────────────────┬─────────────────────┘
                        │ REST API (JSON)
┌───────────────────────▼─────────────────────┐
│              Vert.x Web (事件循环)             │
│   AuthHandler / AccountHandler / MailHandler  │
└──────────┬──────────────────────┬────────────┘
           │ executeBlocking       │ executeBlocking
┌──────────▼───────────┐  ┌────────▼─────────────┐
│   MailSyncService     │  │     持久层 (DAO)       │
│   JavaMail IMAP       │  │   Vert.x JDBC + SQLite │
│   增量收取 / 落盘      │  │   单写串行化            │
└───────────────────────┘  └──────────────────────┘
```

### 3.1 模块划分（后端）

- `WebVerticle` — 启动 HTTP 服务、注册路由、统一异常与鉴权中间件。
- `AuthService` — 管理员登录、会话 Token 校验。
- `AccountService` — 163 邮箱账号增删改查、授权码加密存储、连接测试、批量导入、批量测活。
- `MailSyncService` — IMAP 连接、增量收取、邮件解析、附件落盘（阻塞操作隔离在 worker）。
- `MailQueryService` — 邮件列表分页查询、邮件详情、附件下载、标记已读。
- 持久层 DAO — 封装 SQLite 读写，写操作串行化。

设计原则：每个 Service 单一职责，通过接口暴露；Handler 只负责参数校验和响应封装，业务逻辑下沉到 Service。阻塞操作（JavaMail、JDBC）通过 `executeBlocking` 或 Worker 隔离，避免阻塞事件循环。

## 4. 数据库设计（SQLite）

```sql
-- 管理员（单租户，首期可只有一条记录）
CREATE TABLE admin_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,        -- BCrypt
    created_at    INTEGER NOT NULL
);

-- 163 邮箱账号
CREATE TABLE mail_account (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE,
    auth_code_enc   TEXT NOT NULL,       -- 授权码 AES-GCM 加密存储
    imap_host       TEXT NOT NULL DEFAULT 'imap.163.com',
    imap_port       INTEGER NOT NULL DEFAULT 993,
    last_uid        INTEGER DEFAULT 0,   -- INBOX 上次同步的最大 UID（增量依据）
    uid_validity    INTEGER DEFAULT 0,   -- IMAP UIDVALIDITY，变化时需重置 last_uid
    last_sync_at    INTEGER,
    last_test_at    INTEGER,             -- 最后测活时间
    last_test_ok    INTEGER,             -- 最后测活结果：1 成功 / 0 失败
    last_test_msg   TEXT,                -- 最后测活信息（失败原因）
    created_at      INTEGER NOT NULL
);

-- 邮件
CREATE TABLE mail_message (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER NOT NULL,
    uid          INTEGER NOT NULL,        -- IMAP UID
    message_id   TEXT,                    -- 邮件头 Message-ID
    subject      TEXT,
    from_addr    TEXT,
    to_addr      TEXT,                    -- 多个用分号拼接
    cc_addr      TEXT,
    sent_at      INTEGER,
    received_at  INTEGER,
    body_text    TEXT,                    -- 纯文本正文
    body_html    TEXT,                    -- HTML 正文
    has_attach   INTEGER DEFAULT 0,
    is_read      INTEGER DEFAULT 0,       -- 已读标记
    raw_size     INTEGER,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mail_account(id),
    UNIQUE (account_id, uid)             -- 同账号 UID 唯一，防重复导入
);

-- 附件
CREATE TABLE mail_attachment (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id    INTEGER NOT NULL,       -- 关联 mail_message.id
    filename      TEXT,
    content_type  TEXT,
    size          INTEGER,
    file_path     TEXT NOT NULL,          -- 落盘相对路径
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES mail_message(id)
);

CREATE INDEX idx_msg_account_received ON mail_message(account_id, received_at DESC);
CREATE INDEX idx_attach_message ON mail_attachment(message_id);
```

关键点：

- 增量同步依据 UID：`last_uid` 记录上次同步到的最大 UID，下次只拉 `UID > last_uid` 的邮件。同时记录 `uid_validity`，若 163 返回的 UIDVALIDITY 变化（邮箱重建等），重置 `last_uid` 重新全量。
- 防重复：`UNIQUE(account_id, uid)` 保证同一封邮件不重复入库。
- 附件落盘路径结构：`attachments/{account_id}/{message_id}/{filename}`。
- 授权码加密：AES-GCM 对称加密，密钥从环境变量读取，不明文存库。

## 5. REST API 设计

所有接口前缀 `/api`，除登录外都需要校验管理员会话 Token（请求头 `Authorization: Bearer <token>`）。

### 5.1 认证

```
POST /api/auth/login      { username, password } → { token }
POST /api/auth/logout     → 204
```

### 5.2 邮箱账号管理

```
GET    /api/accounts                → 账号列表（含测活状态，不返回授权码）
POST   /api/accounts                { email, authCode } → 创建（自动测试 IMAP 连接）
POST   /api/accounts/:id/test       → 测试连接 { ok, message }（更新测活状态）
DELETE /api/accounts/:id            → 删除账号及其邮件 / 附件
```

### 5.3 批量能力

```
POST /api/accounts/import
     Content-Type: multipart/form-data 或 text/plain
     文件内容，每行一个账号：  账号 授权码
     （分隔符支持空格 / Tab，忽略空行和 # 开头的注释行）
     可选查询参数：?test=true（导入时顺带测活，默认 false）
                  ?overwrite=true（已存在邮箱覆盖授权码，默认跳过）
     → { total, success, failed, results: [ { email, status, message } ] }

POST /api/accounts/test-batch
     { ids: [1,2,3] }   // 不传 ids 则测试全部账号
     → { results: [ { id, email, ok, message, latencyMs } ] }
```

### 5.4 邮件收取与查询

```
POST   /api/accounts/:id/refresh             → 触发增量同步 { newCount, syncedAt }
GET    /api/accounts/:id/messages            ?page=1&size=20 → 邮件列表（分页，摘要字段）
GET    /api/messages/:id                     → 邮件详情（含正文、附件列表）
GET    /api/messages/:id/attachments/:attId  → 下载附件（二进制流）
PATCH  /api/messages/:id/read                { read: true } → 标记已读
```

设计要点：

- 刷新是同步阻塞调用：点击刷新后等待同步完成返回 `newCount`。首期只同步 INBOX 且为增量，耗时可控；若邮件量大，后续可改为返回任务 ID 轮询进度。
- 邮件列表只返回摘要：主题、发件人、时间、是否已读、是否有附件，不含正文。
- 删除账号级联：同步删除其邮件记录与落盘附件。
- 批量导入：逐行解析，单行失败隔离不影响其他行；默认跳过已存在邮箱；默认不测活，导入后由用户主动调批量测活。
- 批量测活：在 worker 线程池里限制并发（如 5）执行，返回连通性与延迟；完成后更新 `mail_account` 的 `last_test_*` 字段。
- 测活状态持久化：单个 / 批量测活完成后写入 `last_test_at` / `last_test_ok` / `last_test_msg`，账号列表接口一并返回，前端展示存活标识。

## 6. 邮件增量同步流程

运行在 Worker 线程（阻塞操作隔离）：

```
用户点击刷新某账号
      │
      ▼
1. 加载账号信息，解密授权码
      │
      ▼
2. 建立 IMAP 连接 (imap.163.com:993, SSL)
   ⚠️ 163 特殊要求：连接后需发送 ID 命令标识客户端，否则报 Unsafe Login 错误
      │
      ▼
3. 打开 INBOX（只读模式）
      │
      ▼
4. 校验 UIDVALIDITY
   ├─ 与库中一致   → 增量：拉取 UID > last_uid 的邮件
   └─ 不一致 / 首次 → 重置 last_uid=0，全量拉取
      │
      ▼
5. 用 UID 范围搜索新邮件 (UIDFetch last_uid+1:*)
      │
      ▼
6. 逐封解析：
   ├─ 邮件头：subject / from / to / cc / date / message-id
   ├─ 正文：递归解析 multipart，提取 text/plain 和 text/html
   ├─ 附件：检测 disposition=attachment 部分，落盘到
   │         attachments/{accountId}/{messageId}/{filename}
   └─ 入库：mail_message + mail_attachment（一个事务）
      │
      ▼
7. 更新 last_uid = 本次最大 UID，last_sync_at = now
      │
      ▼
8. 关闭连接，返回 newCount
```

关键技术点：

- 163 的 ID 命令：163 IMAP 服务器要求客户端登录后发送 `ID` 命令（IMAP ID extension, RFC 2971）声明客户端信息，否则返回 `Unsafe Login` 错误。需用 Jakarta Mail 的 `IMAPStore.id()` 方法发送。
- UID vs 序号：必须用 UID（稳定标识）而非邮件序号（会变化）做增量依据。
- 事务粒度：每封邮件入库（消息 + 附件）作为一个事务，单封失败不影响整体；附件先落盘再记录路径，入库失败时清理已落盘文件。
- 附件文件名安全：清洗文件名（去除路径分隔符、非法字符），防止路径穿越。
- 编码处理：163 邮件常见 GB2312/GBK 编码与 MIME 编码头，用 `MimeUtility.decodeText()` 正确解码主题和文件名。
- SQLite 写串行化：所有写操作通过单一写入通道串行执行，避免 `SQLITE_BUSY` 锁冲突。

## 7. 安全、错误处理与测试策略

### 7.1 安全

- 授权码加密：AES-GCM 对称加密，密钥从环境变量 `MAILDOCK_SECRET_KEY` 读取，启动时校验密钥存在；授权码绝不出现在 API 响应和日志中。
- 管理员密码：BCrypt 哈希存储；首次启动若无管理员账号，从环境变量初始化默认管理员并提示首登修改。
- 会话 Token：登录返回随机 Token，服务端校验；用进程内存 Map 存活跃 Token + 过期时间（不接 Redis）。代价：服务重启后所有登录失效需重新登录；单租户场景可接受。
- 附件下载鉴权：校验 Token 且确认附件归属，防止越权访问。
- 路径穿越防护：附件文件名清洗 + 落盘路径用内部生成的 ID 结构，不信任原始文件名。

### 7.2 错误处理

- 统一异常处理：Vert.x Web 全局 failureHandler，业务异常映射为 HTTP 状态码 + JSON 错误体 `{ error, message }`。
- IMAP 连接失败：区分认证失败（授权码错误）、网络超时、163 安全限制等，返回明确错误信息。
- 同步部分失败：单封邮件解析失败记录日志并跳过，不中断整个同步；返回成功数和失败数。
- 批量操作容错：导入 / 测活单项失败隔离，返回每项明细。

### 7.3 测试策略

- 单元测试：Service 层逻辑用 JUnit 5；邮件解析用真实 MIME 样本文件测试，不依赖网络。
- 持久层测试：用临时 SQLite 文件库测试 DAO 的增删改查与事务回滚。
- IMAP 集成测试：用 GreenMail（内嵌邮件服务器）模拟 IMAP，测试增量同步逻辑，避免依赖真实 163 账号。
- API 测试：用 Vert.x `WebClient` + JUnit 测试 REST 接口的鉴权、参数校验、响应格式。

## 8. 项目结构与部署

### 8.1 目录结构

```
MailDock/
├── backend/                          # JDK 21 + Vert.x (Maven)
│   ├── pom.xml
│   └── src/main/java/com/maildock/
│       ├── MainVerticle.java         # 启动入口
│       ├── web/                      # HTTP 层
│       │   ├── WebVerticle.java
│       │   ├── AuthHandler.java
│       │   ├── AccountHandler.java
│       │   └── MailHandler.java
│       ├── service/                  # 业务逻辑
│       │   ├── AuthService.java
│       │   ├── AccountService.java
│       │   ├── MailSyncService.java
│       │   └── MailQueryService.java
│       ├── repository/               # 持久层 DAO
│       │   ├── Database.java          # SQLite 连接 + 写串行化
│       │   ├── AccountRepository.java
│       │   ├── MessageRepository.java
│       │   └── AttachmentRepository.java
│       ├── mail/                     # IMAP 收取与解析
│       │   ├── ImapClient.java        # 163 连接 + ID 命令
│       │   └── MailParser.java        # MIME 解析、附件提取
│       ├── security/                 # 加密、Token
│       │   ├── CryptoUtil.java        # AES-GCM
│       │   └── TokenStore.java        # 内存 Token
│       └── model/                     # 数据模型 / DTO
│   └── src/test/java/...             # JUnit + GreenMail 测试
│
├── frontend/                         # React + Vite
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── api/                      # API 客户端封装
│       ├── pages/                    # 登录 / 账号管理 / 邮件列表 / 详情
│       └── components/
│
├── data/                             # 运行时数据（git 忽略）
│   ├── maildock.db                   # SQLite 数据库文件
│   └── attachments/                  # 附件落盘目录
│
├── docs/superpowers/specs/           # 设计文档
└── README.md
```

### 8.2 关键依赖

- 后端：`vertx-web`、`vertx-jdbc-client`、`sqlite-jdbc`、`jakarta.mail`、`jbcrypt`、`greenmail`(test)、`junit5`。
- 前端：`react`、`react-router`、`axios`、`vite`。

### 8.3 部署

- 开发：前端 `vite dev`（端口 5173，代理 `/api` 到后端 8080）；后端 `mvn exec` 或 IDE 启动。
- 生产：前端 `vite build` 产出静态文件，由 Vert.x Web 的 `StaticHandler` 托管（同一端口，免跨域）；后端打成 fat-jar，`java -jar` 启动。
- 配置（环境变量）：`MAILDOCK_SECRET_KEY`（加密密钥）、`MAILDOCK_ADMIN_USER` / `MAILDOCK_ADMIN_PASS`（初始管理员）、数据库路径等。
- 运行要求：仅需 JDK 21，无需 Redis、无需外部数据库；SQLite 文件随应用走，部署极简。

## 9. 非目标（首期不做）

- 邮件发送（SMTP）。
- 自动定时刷新 / 实时推送。
- INBOX 之外的文件夹同步。
- 多用户体系与权限分级。
- 其他邮箱服务商接入（首期仅 163）。
