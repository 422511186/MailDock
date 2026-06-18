# 批量收信 + 聚合邮件管理页 设计文档

日期：2026-06-19

## 背景

MailDock 目前邮件能力局限于单账号：

- 收信只能在邮件列表页对单个账号点「收取邮件」触发 `POST /accounts/:id/refresh`。
- 邮件查询只能按账号分页（`MessageRepository.listByAccountForUser`），没有跨账号聚合查询，也没有对邮件的搜索 / 过滤。

本次新增两个功能：

1. **批量收信**：一次对多个账号触发增量同步。
2. **聚合邮件管理页**：对当前用户所有已收邮件做聚合查询，支持搜索与多条件过滤。

## 功能一：批量收信

### 设计决策

- **复用现有单账号接口，不新增后端接口。** 前端逐个 `await api.refresh(id)` 串行调用，实时展示进度。
  - 理由：单账号同步是阻塞 IMAP I/O，已包在 `executeBlocking` 里；前端串行调用天然限制了对 163 的并发压力，也复用了既有的服务端编排与错误处理，复杂度最低。
- **两处入口**：账号管理页和聚合邮件页都提供批量收信。

### 账号管理页（AccountsPage）

- 复用已有的复选框多选机制，工具栏新增「批量收信」按钮，与现有「批量测活」并列。
- 作用范围语义与 `testBatch` 一致：**选中账号则收选中的；未选中则收当前用户全部账号**。
- 执行：逐个 `await api.refresh(id)`；期间禁用相关按钮，展示进度文案（如「正在收取 3/10」）。
- 完成后弹汇总 Toast：成功账号数、累计新增邮件数、失败账号及原因。
- 纯逻辑放进 `pages/accountsPageModel.ts`；弹窗 / 交互沿用 `pages/accounts/` 拆分约定，不把新职责塞回页面文件。

### 聚合邮件页

- 工具栏放「收取全部」按钮，对当前用户全部账号逐个收信，逻辑同上；完成后刷新聚合列表。

## 功能二：聚合邮件管理页

### 后端

均遵循 TDD，逐层从下往上实现。

**MessageRepository**（新增方法）

- `searchForUser(userId, filter, page, size)`：跨该用户所有账号 `JOIN mail_account` 查询。
- `countSearchForUser(userId, filter)`：对应总数。
- 过滤条件（全部参数化，按需拼接）：
  - 关键词：`(subject LIKE ? OR from_addr LIKE ?)`，仅主题 + 发件人。
  - 所属账号：可选 `m.account_id = ?`。
  - 已读：可选 `m.is_read = ?`。
  - 有无附件：可选 `m.has_attach = ?`。
  - 时间范围：可选 `m.received_at BETWEEN ? AND ?`（起始 / 结束任一可缺省）。
  - 排序：字段白名单（`received_at` / `sent_at`），方向白名单（`asc` / `desc`），默认 `received_at DESC`，防 SQL 注入。
  - 用户隔离强制：`a.user_id = ?`。

**MailQueryService**

- 新增 `search(userId, filter, page, size)` 薄封装，返回复用现有 `PagedMessages` 记录。
- 引入一个 `MessageFilter` 值对象（record）承载过滤参数，避免方法参数过长。

**MailApiHandler**

- 新增 `GET /messages`（注意与已有的 `GET /messages/:id` 不冲突，路由顺序上 `/messages` 列表在前）。
- query 参数：`keyword` / `accountId` / `isRead` / `hasAttach` / `startDate` / `endDate` / `sortBy` / `sortOrder` / `page` / `size`，全部可选。
- 包在 `vertx.executeBlocking(..., false)` 中。
- 返回结构 `{ total, items }`，item 复用现有 `messageSummaryJson`（已含 `accountId`）。

### 前端

均遵循 TDD，page / 模块旁置同名测试文件。

- `api/client.ts`：新增 `MessageQuery` 类型与 `searchMessages(query): Promise<PagedMessages>`，按现有 `listAccounts` 拼 query 的写法构造 `URLSearchParams`。
- 新增 `pages/AggregateMailPage.tsx`，纯逻辑拆到 `pages/aggregateMailPageModel.ts`（沿用账号页拆分约定）。
- 路由：`App.tsx` 新增受保护路由 `/messages`（带 Header）；`components/UserMenu.tsx` 现有「邮件列表」项指向 `/messages`。
- 工具栏：关键词输入框、账号下拉（全部 / 某账号）、已读三态（全部 / 已读 / 未读）、附件三态（全部 / 有 / 无）、时间范围、排序，并配「收取全部」按钮。
- 列表复用 `MailListPage` 的卡片 / 桌面表格视觉与分页；每行额外显示所属账号徽章（邮箱用 `truncateEmail` 中间省略，完整值保留在 `title`）。
- 点单封邮件 → 跳转 `/accounts/${m.accountId}/messages/${m.id}`（复用现有详情页，每封邮件用自身 `accountId`）。
- 详情页返回需能回到来源聚合页：通过浏览器返回（`navigate(-1)`）或来源判断，使从 `/messages` 进入的详情返回到 `/messages`，从账号列表进入的返回到对应账号列表。

### 测试策略

- Repository：临时 SQLite 文件库，造多账号、多邮件样本，验证各过滤条件组合、用户隔离（不返回他人邮件）、分页、排序白名单拒绝非法字段。
- API：Vert.x WebClient 直打 `GET /messages`，验证鉴权、参数校验、过滤行为、跨账号只返回本人邮件、响应格式。
- 前端：vitest + @testing-library/react，验证过滤交互触发查询、批量收信进度与汇总 Toast、聚合列表渲染与跳转。

## 关键约束遵循

- 事件循环不可阻塞：新增 `GET /messages` 与批量收信均经 `executeBlocking` / 复用既有异步接口。
- SQLite 写串行化：本次聚合查询为只读，不加锁；批量收信复用既有写路径（`runWrite`）。
- 授权码不外泄：聚合查询只返回邮件摘要，不涉及账号授权码。
- 用户数据隔离：所有新查询强制 `a.user_id = ?`，跨用户邮件按不存在处理。
- SQL 注入防护：过滤值参数化，排序字段 / 方向用白名单。

## 非目标（本次不做）

- 正文全文搜索（FTS5）。
- 聚合页内嵌详情面板 / 抽屉（仍跳转复用现有详情页）。
- 后端并发收信（前端串行逐个调用）。
- 定时 / 自动收信、实时推送。
