# 个人中心与头像下拉菜单设计

## 背景与目标

当前前端 header 中间展示当前用户名，右侧是一个独立的「登出」按钮。本次改动将其优化为右上角的**头像 + 下拉菜单**，并新增**个人中心页面**。

目标：

1. 删除 header 中间的用户名文本，header 仅保留左侧品牌区与右上角头像。
2. 右上角头像点击后展开下拉菜单，菜单包含：用户名/邮箱信息、个人资料、修改密码、退出登录。
3. 新增个人中心页面，支持：展示资料（只读）、编辑显示名、修改密码。

UI 风格参考用户提供的「个人设置」截图（资料与头像卡 + 编辑资料卡 + 头像首字母占位）。

## 范围

本期做：

- 头像首字母占位展示（有 `avatarUrl` 则显示图片，否则用显示名/邮箱首字母 + 主题色方块）。
- 头像下拉菜单。
- 个人中心页面：资料展示、改显示名、改密码。

本期**不做**（YAGNI，超出当前后端能力或属首期非目标）：

- 头像上传与图片压缩（后端无头像文件存储接口）。
- 登录方式绑定/解绑（多 provider 管理，属首期非目标）。
- 邮箱修改、API 密钥、通知、多语言等参考图中的其他元素。

## 用户身份背景

后端 `user_identity` 表区分登录身份：

- `email_password`：`secret_hash` 为 BCrypt 密码哈希，可修改密码。
- `linuxdo`：`secret_hash` 为 null，无密码，**不可修改密码**。

因此修改密码功能仅对邮箱密码用户开放；linux.do 用户在个人中心页看到禁用态与提示。

## 后端设计（`com.maildock`）

### 1. `hasPassword` 字段

`/auth/me` 与登录响应当前返回的用户 JSON 不含登录方式信息。新增布尔字段 `hasPassword`，供前端判断「修改密码」是否可用。

- `AuthService` 新增方法：`boolean hasPassword(long userId)`，查询该用户是否存在 `email_password` 身份且 `secret_hash` 非空。
- `IdentityRepository` 新增按 `userId + provider` 查询的方法（如 `findByUserAndProvider(long userId, String provider)`），供上面判断使用。
- `ApiRouter.userJson(User)` 增加 `.put("hasPassword", authService.hasPassword(user.id()))`。

> 注意：`userJson` 当前无 `AuthService` 依赖以外的查询，新增字段会引入一次 DB 读取。该序列化在 `/auth/me`、登录响应、改名响应中调用，频率低，可接受；统一在 `executeBlocking` 上下文中调用即可。

### 2. 更新显示名

新增路由 `PATCH /api/v1/users/me`：

- body：`{ "displayName": "<新显示名>" }`。
- 从 `ctx.get("currentUserId")` 取当前用户，仅允许修改自己。
- 仅更新 `display_name`，保留现有 `primary_email`、`avatar_url` 不被覆盖（读取当前 user 后用原值回填 `UserRepository.updateProfile`）。
- 校验：显示名非空、长度上限（如 ≤ 64）。空白则 400。
- 返回更新后的用户 JSON（含 `hasPassword`）。
- 走 `vertx.executeBlocking(..., false)` + `database.runWrite(...)`。

### 3. 修改密码

新增路由 `POST /api/v1/users/me/password`：

- body：`{ "oldPassword": "...", "newPassword": "..." }`。
- `AuthService` 新增方法：`boolean changePassword(long userId, String oldPassword, String newPassword)`。
  - 查当前用户 `email_password` 身份；不存在（如 linux.do 用户）→ 返回失败，handler 响应 403「当前账号未设置密码，无法修改」。
  - BCrypt 校验旧密码；不匹配 → 失败，handler 响应 400「原密码错误」。
  - 通过则 `BCrypt.hashpw` 新密码并 `IdentityRepository.updateSecretHash`。
- 校验：新密码最小长度（≥ 6），不满足 400。
- 成功返回 204（或 `{ "ok": true }`）。
- 走 `vertx.executeBlocking(..., false)` + `database.runWrite(...)`。

### 4. 路由注册

在 `ApiRouter.build()` 中新增 `registerUserRoutes(router)`，两条路由位于 `authMiddleware` 之后（需登录）。`WebVerticle` 无需新增 Service（复用 `AuthService`、`UserRepository`）。

## 前端设计（`frontend/src`）

### 1. API 客户端（`api/client.ts`）

- `CurrentUser` 接口新增 `hasPassword: boolean`。
- 新增方法：
  - `updateDisplayName(displayName: string): Promise<CurrentUser>` → `PATCH /users/me`。
  - `changePassword(oldPassword: string, newPassword: string): Promise<void>` → `POST /users/me/password`（raw）。

### 2. `UserMenu` 组件（`pages/` 或新建 `components/`）

替换 `App.tsx` header 中间的用户名 span 与右侧登出按钮，置于右上角：

- 头像：有 `avatarUrl` 显示 `<img>`；否则显示首字母方块（取 `displayName` 或 `primaryEmail` 首字符，大写，主题绿底）。
- 点击头像切换下拉面板：
  - 顶部：显示名 + 邮箱。
  - 菜单项：**个人资料**（进入 profile 页）、**修改密码**（进入 profile 页，linux.do 用户仍可进入但页面内改密区为禁用态）、**退出登录**（红色，调用现有 `handleLogout`）。
- 交互：点击外部关闭、Esc 关闭、键盘可达、`aria-haspopup`/`aria-expanded`/`role="menu"` 等完整。

### 3. `ProfilePage` 页面（`pages/ProfilePage.tsx`）

布局参考截图：

- **资料卡**：左侧大头像（首字母占位）+ 只读信息（邮箱、登录方式、最后登录时间）。右侧「编辑个人资料」：显示名输入框 + 「更新资料」按钮，提交调用 `updateDisplayName`，成功后更新顶层 user 状态并提示。
- **修改密码卡**：旧密码 / 新密码 / 确认新密码三个输入 + 提交按钮。
  - 前端校验：新密码与确认一致、最小长度。
  - 仅 `hasPassword === true` 时可用；否则整卡禁用并提示「当前账号通过 linux.do 登录，未设置密码」。
  - 提交调用 `changePassword`，成功后清空表单并提示。
- 顶部提供返回（回到 accounts 视图）。

### 4. `App.tsx` 状态机

- `View` 联合类型新增 `{ name: 'profile'; user: CurrentUser }`。
- header（accounts 视图）渲染 `UserMenu`，下拉菜单回调切换到 profile 视图 / 触发登出。
- profile 视图渲染 `ProfilePage`，并把更新后的 user 写回 view 状态（改名后保持一致）。
- 由于 `mailList` / `mailDetail` 视图当前无 header，本期个人中心入口仅在 accounts 视图的 header 提供（与现有登出按钮位置一致）。

## 测试策略（TDD）

后端：

- `AuthServiceTest`：
  - `hasPassword`：邮箱密码用户 true、linux.do 用户 false。
  - `changePassword`：成功改密、旧密码错误返回失败、linux.do 用户（无密码身份）返回失败。
- API 测试（`ApiRouterTest` 或对应类）：
  - `PATCH /users/me`：未登录 401、空显示名 400、成功返回新 JSON 且含 `hasPassword`。
  - `POST /users/me/password`：未登录 401、新密码过短 400、旧密码错 400、linux.do 用户 403、成功 204。
  - `/auth/me` 响应含 `hasPassword`。

前端（vitest + testing-library）：

- `UserMenu.test.tsx`：首字母渲染、展开/收起、点击「个人资料」回调、点击「退出登录」回调、Esc 关闭。
- `ProfilePage.test.tsx`：渲染只读资料、改名提交调用 API、改密表单校验（两次不一致 / 过短）、`hasPassword=false` 时改密卡禁用与提示。

## 错误处理

- 后端统一走现有 `failureHandler` 与 `fail(ctx, status, msg)` 模式，返回 `{ message }`。
- 前端 API 客户端沿用现有非 2xx 抛错（携带后端 message），页面捕获后在对应卡片内展示错误文案。

## 数据隔离

所有新路由位于 `authMiddleware` 之后，操作对象固定为 `ctx.get("currentUserId")` 对应的当前用户，不接受路径/ body 中的他人 userId，符合用户数据隔离约束。
