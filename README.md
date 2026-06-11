# MailDock

MailDock 是一个邮箱一站式服务，首期支持 163 邮箱（IMAP + 授权码）。管理员登录后可管理多个邮箱账号，手动触发增量同步，将完整邮件（头、正文、附件）落地存储。

## 技术栈

**后端**
- JDK 21 + Vert.x 4.5.11
- SQLite（数据存储）
- JavaMail（IMAP 收取）
- AES-256-GCM（授权码加密）

**前端**
- React 18 + TypeScript 5
- Vite 6 + Tailwind CSS 3.4
- Vitest（测试）

## 快速开始

### 前置要求

- JDK 21+
- Maven 3.8+
- Node.js 18+

### 配置

在项目根目录创建 `maildock.properties`：

```properties
# 必需：AES-256 密钥（必须 32 字节）
MAILDOCK_SECRET_KEY=12345678901234567890123456789012

# 可选：管理员用户名（默认 admin）
MAILDOCK_ADMIN_USER=admin

# 可选：管理员密码（未提供则自动生成并打印到日志）
MAILDOCK_ADMIN_PASS=your_password

# 可选：HTTP 端口（默认 8080）
MAILDOCK_HTTP_PORT=8080

# 可选：数据库路径（默认 data/maildock.db）
MAILDOCK_DB_PATH=data/maildock.db

# 可选：附件目录（默认 data/attachments）
MAILDOCK_ATTACHMENTS_DIR=data/attachments
```

### 启动后端

```bash
cd backend
mvn package
cd ..
java -jar backend/target/maildock-backend-fat.jar
```

后端将在 `http://localhost:8080` 启动。首次启动会自动创建数据库和管理员账号。

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器将在 `http://localhost:5173` 启动，自动代理 API 请求到后端。

### 生产部署

**构建前端**
```bash
cd frontend
npm run build
# 产物在 dist/ 目录
```

**运行后端**
```bash
# 使用配置文件
java -jar backend/target/maildock-backend-fat.jar

# 或使用环境变量
MAILDOCK_SECRET_KEY='your-32-byte-key' \
MAILDOCK_ADMIN_PASS='your-password' \
java -jar backend/target/maildock-backend-fat.jar
```

## 功能特性

### 账号管理
- ✅ 新增账号（邮箱 + 授权码）
- ✅ 批量导入（文本 / 文件上传）
- ✅ 账号列表（分页、搜索、过滤、排序）
- ✅ 单个 / 批量测活
- ✅ 单个 / 批量删除（二次确认）
- ✅ 三态状态显示（待检测 / 正常 / 异常）
- ✅ 复选框批量选择
- ✅ 可点击表头排序（上次测活时间 / 上次收信时间）

### 邮件管理
- ✅ 手动增量同步（基于 IMAP UID）
- ✅ 邮件列表（分页、未读标记）
- ✅ 邮件详情（头信息、正文、附件列表）
- ✅ 附件下载

### 认证与安全
- ✅ 管理员登录（用户名 + 密码）
- ✅ Token 认证（进程内存存储）
- ✅ 授权码加密存储（AES-256-GCM）
- ✅ API 统一鉴权中间件

### UI/UX
- ✅ 现代化响应式设计（Tailwind CSS）
- ✅ 品牌标识与渐变背景
- ✅ Toast 通知提示
- ✅ 表格居中对齐
- ✅ 页大小选择（10/20/50/100）

## 测试

### 后端测试

```bash
cd backend
mvn test                                          # 运行全部测试
mvn test -Dtest=MailSyncServiceTest               # 运行单个测试类
mvn test -Dtest=MailSyncServiceTest#methodName    # 运行单个测试方法
```

**测试覆盖**
- ✅ 122 个测试全部通过
- Service 层单元测试
- Repository 层 CRUD 测试
- IMAP 同步测试（GreenMail）
- API 路由测试（WebClient）

### 前端测试

```bash
cd frontend
npm test                                          # 运行全部测试
npm run test:watch                                # watch 模式
npx vitest run src/pages/LoginPage.test.tsx      # 运行单个测试文件
```

**测试覆盖**
- ✅ 47 个测试全部通过
- 组件渲染测试
- 用户交互测试
- API 调用测试

## 项目结构

```
MailDock/
├── backend/                    # 后端（Java + Vert.x）
│   ├── src/main/java/com/maildock/
│   │   ├── config/            # 配置加载
│   │   ├── mail/              # IMAP 客户端与邮件解析
│   │   ├── model/             # 数据模型
│   │   ├── repository/        # 数据访问层
│   │   ├── security/          # 加密与认证
│   │   ├── service/           # 业务逻辑层
│   │   └── web/               # HTTP 路由与 Verticle
│   └── src/test/              # 测试
├── frontend/                   # 前端（React + TypeScript）
│   ├── src/
│   │   ├── api/               # API 客户端
│   │   ├── pages/             # 页面组件
│   │   ├── styles.css         # Tailwind 样式
│   │   └── main.tsx           # 入口
│   └── vitest.config.ts       # 测试配置
├── docs/                       # 设计文档
├── maildock.properties         # 配置文件（需手动创建）
├── CLAUDE.md                   # Claude Code 开发指南
└── README.md                   # 本文件
```

## API 端点

**认证**
- `POST /api/v1/auth/login` - 管理员登录
- `POST /api/v1/auth/logout` - 登出

**账号管理**
- `GET /api/v1/accounts` - 账号列表（支持搜索、过滤、排序、分页）
- `POST /api/v1/accounts` - 创建账号
- `DELETE /api/v1/accounts/:id` - 删除账号
- `POST /api/v1/accounts/:id/test` - 单个测活
- `POST /api/v1/accounts/test-batch` - 批量测活
- `POST /api/v1/accounts/delete-batch` - 批量删除
- `POST /api/v1/accounts/import` - 批量导入

**邮件管理**
- `POST /api/v1/accounts/:id/sync` - 手动同步
- `GET /api/v1/messages` - 邮件列表
- `GET /api/v1/messages/:id` - 邮件详情
- `GET /api/v1/attachments/:id` - 下载附件

## 注意事项

1. **授权码获取**：登录 163 邮箱 → 设置 → POP3/SMTP/IMAP → 开启 IMAP 服务 → 获取授权码
2. **密钥长度**：`MAILDOCK_SECRET_KEY` 必须正好 32 字节（用于 AES-256 加密）
3. **首次启动**：未设置 `MAILDOCK_ADMIN_PASS` 时会自动生成密码并打印到控制台
4. **数据存储**：所有数据（数据库 + 附件）默认存储在 `data/` 目录
5. **线程模型**：Vert.x 事件循环 + Worker 线程池，所有阻塞操作必须在 `executeBlocking` 中执行

## 开发指南

详见 [CLAUDE.md](./CLAUDE.md)，包含：
- 架构约束与最佳实践
- 测试策略
- 常用命令
- 非功能性目标

## 许可证

MIT License
