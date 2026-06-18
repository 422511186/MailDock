# 批量收信 + 聚合邮件管理页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MailDock 新增两个能力：(1) 批量收信——在账号管理页与聚合邮件页一次对多个账号触发增量同步；(2) 聚合邮件管理页——跨当前用户所有账号聚合查询已收邮件，支持关键词全文检索（FTS5，含正文）、账号 / 已读 / 附件 / 时间范围过滤、排序与分页。

**Architecture:** 后端 Vert.x + SQLite，自底向上：`Database.initSchema()` 增加 FTS5 虚拟表 + 同步触发器 + 启动回填 → `MessageRepository.searchForUser` / `countSearchForUser` + `MessageFilter` record → `MailQueryService.search` → `MailApiHandler` 新增 `GET /messages`。批量收信不新增后端接口，前端串行 `await api.refresh(id)`。前端：`api/client.ts` 增 `searchMessages`；`pages/accountsPageModel.ts` 增纯函数 `runBatchRefresh`（两页共用）；新增 `pages/AggregateMailPage.tsx` + `pages/aggregateMailPageModel.ts`；`App.tsx` 增 `/messages` 路由；`UserMenu` 的「邮件列表」指向 `/messages`；`AccountsPage` 工具栏增「批量收信」。

**Tech Stack:** JDK 21 + Vert.x + sqlite-jdbc 3.47.1.0（含 FTS5 + trigram）+ JUnit 5 + GreenMail；React + Vite + TypeScript + react-router-dom + Tailwind 3.4.19 + lucide-react + vitest + @testing-library/react。

**关键约束（每个任务都必须遵守）：**
- 强制 TDD：先写失败测试 → 最小实现 → 重构。不得跳过先写测试。
- 事件循环不可阻塞：所有阻塞操作包在 `vertx.executeBlocking(..., false)`。
- SQLite 写串行化：所有写经 `database.runWrite(...)`；聚合查询为只读不加锁。
- 用户隔离：所有新查询强制 `a.user_id = ?`，跨用户资源按不存在处理。
- 授权码不外泄：聚合查询只返回邮件摘要，不含授权码。
- SQL 注入防护：过滤值全部参数化；排序字段 / 方向用白名单；FTS 关键词包裹双引号作为短语。

**提交节奏：** 每个任务（测试 + 实现 + 重构通过后）单独提交一次，提交信息用 `feat` / `test` / `refactor` 前缀并说明范围。后端测试 `cd backend && mvn test`，前端测试 `cd frontend && npm test`。

---

## Task 1：FTS5 虚拟表 + 同步触发器（Database.initSchema）

**目标：** 在 schema 中幂等创建 external-content FTS5 表 `mail_message_fts` 与三个同步触发器，使邮件入库 / 删除 / 更新时全文索引自动维护。

- [ ] **写失败测试** `backend/src/test/java/com/maildock/repository/DatabaseFtsTest.java`（新建）。用临时文件库（参照 `MessageRepositoryTest` 的临时库写法：`Files.createTempFile` → `jdbc:sqlite:` + `db.initSchema()`），插入一封 `body_text` 含中文（如「这是一封测试邮件正文」）的邮件，断言：
  - FTS 表存在且可查询：`SELECT count(*) FROM mail_message_fts` 返回 1（INSERT 触发器生效）。
  - 中文子串命中：`SELECT m.id FROM mail_message m JOIN mail_message_fts f ON f.rowid = m.id WHERE mail_message_fts MATCH '"测试邮件"'` 能查到该邮件。
  - 删除同步：`DELETE FROM mail_message WHERE id=?` 后 `SELECT count(*) FROM mail_message_fts` 归零（DELETE 触发器生效）。
  - 测试需直接用 `db.connection()` 执行 SQL，写操作经 `db.runWrite(...)`。先运行确认编译失败 / 断言失败（FTS 表尚不存在）。
- [ ] **最小实现**：在 `Database.initSchema()` 的 `ddl` 数组中，**在 `mail_attachment` 表之后、各 `CREATE INDEX` 之前**追加以下条目（保持数组内顺序：先建 FTS 表，再建触发器）：
  ```java
  """
  CREATE VIRTUAL TABLE IF NOT EXISTS mail_message_fts USING fts5(
      subject, from_addr, body_text,
      content='mail_message', content_rowid='id',
      tokenize='trigram'
  )
  """,
  """
  CREATE TRIGGER IF NOT EXISTS mail_message_ai AFTER INSERT ON mail_message BEGIN
      INSERT INTO mail_message_fts(rowid, subject, from_addr, body_text)
      VALUES (new.id, new.subject, new.from_addr, new.body_text);
  END
  """,
  """
  CREATE TRIGGER IF NOT EXISTS mail_message_ad AFTER DELETE ON mail_message BEGIN
      INSERT INTO mail_message_fts(mail_message_fts, rowid, subject, from_addr, body_text)
      VALUES ('delete', old.id, old.subject, old.from_addr, old.body_text);
  END
  """,
  """
  CREATE TRIGGER IF NOT EXISTS mail_message_au AFTER UPDATE ON mail_message BEGIN
      INSERT INTO mail_message_fts(mail_message_fts, rowid, subject, from_addr, body_text)
      VALUES ('delete', old.id, old.subject, old.from_addr, old.body_text);
      INSERT INTO mail_message_fts(rowid, subject, from_addr, body_text)
      VALUES (new.id, new.subject, new.from_addr, new.body_text);
  END
  """,
  ```
  注意：external-content FTS5 的 delete 必须带 old 的列值，否则索引漂移；故 DELETE/UPDATE 触发器都写全列。
- [ ] **运行测试** `cd backend && mvn test -Dtest=DatabaseFtsTest`，确认通过。
- [ ] **回归** `cd backend && mvn test`，确认既有测试（含 `MessageRepositoryTest`、`MailApiHandlerTest`）不受影响——insert 触发器会随既有插入自动跑。
- [ ] **提交**：`feat(db): 新增 mail_message_fts FTS5 表与同步触发器`

## Task 2：启动回填守卫（Database 重建已有邮件的 FTS 索引）

**目标：** 已有数据库（升级前已存邮件、FTS 为空）首次启动时，一次性重建 FTS 索引；正常情况下不重复重建。

- [ ] **写失败测试**（追加到 `DatabaseFtsTest.java`）：模拟「FTS 缺索引」场景——`initSchema()` 后插入邮件，再手动 `db.runWrite` 执行 `DELETE FROM mail_message_fts`（清空 FTS 但保留邮件），断言此时 FTS 行数为 0；调用新方法 `db.backfillFtsIfNeeded()` 后，断言 FTS 行数恢复为邮件行数且中文子串可检索。再次调用 `backfillFtsIfNeeded()` 应为 no-op（不报错、计数不变）。
- [ ] **最小实现**：在 `Database` 新增 `public void backfillFtsIfNeeded()`：读取 `SELECT count(*) FROM mail_message` 与 `SELECT count(*) FROM mail_message_fts`，仅当两者不相等时，经 `runWrite` 执行 `INSERT INTO mail_message_fts(mail_message_fts) VALUES('rebuild')`。计数比对作守卫，避免每次启动都重建。
- [ ] **接线**：在 `bootstrap/AppWiring` 中 `database.initSchema()` 之后调用 `database.backfillFtsIfNeeded()`（用 Grep 定位 `initSchema()` 调用点；若在 `MainVerticle`/`WebVerticle` 则就近加在其后）。
- [ ] **运行测试** `mvn test -Dtest=DatabaseFtsTest`，再 `mvn test` 回归。
- [ ] **提交**：`feat(db): 启动时按需回填 FTS 索引`

## Task 3：MessageFilter 值对象 + MessageRepository 跨账号搜索

**目标：** 新增 `MessageFilter` record 承载过滤参数；`MessageRepository` 新增 `searchForUser` / `countSearchForUser`，跨用户所有账号查询，参数化 + 用户隔离 + FTS/LIKE 关键词 + 排序白名单。

- [ ] **新建** `backend/src/main/java/com/maildock/model/MessageFilter.java`（package `com.maildock.model`）。所有字段可空表示「不过滤」：
  ```java
  package com.maildock.model;

  /**
   * 聚合邮件查询的过滤条件。所有字段为 null 表示对应维度不过滤。
   * keyword 长度 >= 3 走 FTS5（含正文），< 3 回退主题/发件人 LIKE。
   * sortBy / sortOrder 在 Repository 内用白名单校验，默认 received_at DESC。
   */
  public record MessageFilter(
          String keyword,
          Long accountId,
          Boolean isRead,
          Boolean hasAttach,
          Long startDate,
          Long endDate,
          String sortBy,
          String sortOrder) {
  }
  ```
- [ ] **写失败测试**（追加到 `backend/src/test/java/com/maildock/repository/MessageRepositoryTest.java`，复用其用户 A/B 隔离与 `sample`/`sampleForAccount` 辅助）。覆盖：
  - 无过滤：`searchForUser(userA, new MessageFilter(null,null,null,null,null,null,null,null), 1, 20)` 只返回 A 的邮件，不含 B 的（**用户隔离**）。`countSearchForUser` 与之一致。
  - 关键词 ≥3 全文命中正文：插入 `body_text` 含「季度报表」的邮件，`keyword="季度报表"` 能命中；不含该词的邮件不返回。
  - 关键词 <3 回退 LIKE：`keyword="hi"`（2 字符）时按 subject/from_addr LIKE 匹配，不扫正文（正文含「hi」但主题/发件人不含的邮件不应返回）。
  - 账号过滤：`accountId` 指定时只返回该账号邮件。
  - 已读过滤：`isRead=false` 只返回未读。
  - 附件过滤：`hasAttach=true` 只返回有附件。
  - 时间范围：`startDate`/`endDate` 任一可缺省，`received_at BETWEEN` 行为正确。
  - 排序白名单：`sortBy="received_at"` `sortOrder="asc"` 升序；非法 `sortBy="body_text; DROP"` 回退默认 `received_at DESC`（断言不抛异常且按默认序）。
  - FTS 语法字符安全：`keyword` 含 `"` 或 `*`（≥3 字符，如 `a"b*`）不应抛 SQLite 语法异常。
  - 分页：插入多封，验证 `page`/`size` 切片正确。
- [ ] **最小实现**：在 `MessageRepository` 新增两方法（导入 `com.maildock.model.MessageFilter`）。共用一个私有 `buildWhere(MessageFilter, List<Object> params)` 拼 `WHERE`（首段 `a.user_id = ?`），与一个 `keywordClause` 决策 FTS vs LIKE。骨架：
  ```java
  public List<Message> searchForUser(long userId, MessageFilter f, int page, int size) {
      List<Object> params = new ArrayList<>();
      String join = ftsJoin(f);                  // keyword>=3 时返回 " JOIN mail_message_fts fts ON fts.rowid = m.id"，否则 ""
      String where = buildWhere(userId, f, params);
      String orderBy = orderBy(f);               // 白名单
      int safePage = Math.max(1, page), safeSize = Math.max(1, size);
      String sql = "SELECT m.* FROM mail_message m JOIN mail_account a ON a.id = m.account_id"
              + join + where + orderBy + " LIMIT ? OFFSET ?";
      params.add(safeSize);
      params.add((safePage - 1) * safeSize);
      // prepare、bindParams（参照 AccountRepository.bindParams 用 setObject）、map(rs) 收集
  }

  public long countSearchForUser(long userId, MessageFilter f) {
      List<Object> params = new ArrayList<>();
      String join = ftsJoin(f);
      String where = buildWhere(userId, f, params);
      String sql = "SELECT COUNT(*) FROM mail_message m JOIN mail_account a ON a.id = m.account_id"
              + join + where;
      // prepare、bind、getLong(1)
  }
  ```
  `buildWhere` 规则（全部参数化，`params` 依次 add）：
  - 起始 `" WHERE a.user_id = ?"`，`params.add(userId)`。
  - keyword 非空白且 `strip().length() >= 3`：`" AND fts.mail_message_fts MATCH ?"`，`params.add(ftsPhrase(keyword))`——`ftsPhrase` = `"\"" + kw.strip().replace("\"", "\"\"") + "\""`（包裹双引号成短语 + 转义内部双引号，防 FTS 语法注入）。
  - keyword 非空白且长度 `< 3`：`" AND (m.subject LIKE ? OR m.from_addr LIKE ?)"`，两次 `params.add("%" + kw.strip() + "%")`。
  - `accountId != null`：`" AND m.account_id = ?"`。
  - `isRead != null`：`" AND m.is_read = ?"`，`params.add(isRead ? 1 : 0)`。
  - `hasAttach != null`：`" AND m.has_attach = ?"`，`params.add(hasAttach ? 1 : 0)`。
  - `startDate != null`：`" AND m.received_at >= ?"`。`endDate != null`：`" AND m.received_at <= ?"`。
  - `orderBy`：字段白名单 `received_at`(默认) / `sent_at`，其余回退 `received_at`；方向 `"asc".equalsIgnoreCase(sortOrder) ? "ASC" : "DESC"`（默认 DESC）。返回 `" ORDER BY m." + field + " " + dir`。
  - 复用现有 `map(ResultSet)`、`bindParams` 思路（`MessageRepository` 暂无 `bindParams`，新增一个等价私有方法）。
- [ ] **运行测试** `mvn test -Dtest=MessageRepositoryTest`，再 `mvn test` 回归。
- [ ] **提交**：`feat(repo): MessageRepository 跨账号搜索 searchForUser/countSearchForUser`

## Task 4：MailQueryService.search 薄封装

**目标：** 服务层暴露 `search`，复用现有 `PagedMessages`。

- [ ] **写失败测试**（追加到 `backend/src/test/java/com/maildock/service/MailQueryServiceTest.java`，参照其装配 `MessageRepository`+`AttachmentRepository`+`AttachmentStorage` 的写法）。造多账号多邮件，断言 `search(userId, filter, page, size)` 返回 `PagedMessages`，`items` 与 `total` 同时遵循过滤与用户隔离。
- [ ] **最小实现**：在 `MailQueryService` 新增（导入 `com.maildock.model.MessageFilter`）：
  ```java
  public PagedMessages search(long userId, MessageFilter filter, int page, int size) {
      List<Message> items = messageRepo.searchForUser(userId, filter, page, size);
      long total = messageRepo.countSearchForUser(userId, filter);
      return new PagedMessages(items, total);
  }
  ```
- [ ] **运行测试** `mvn test -Dtest=MailQueryServiceTest`，再 `mvn test` 回归。
- [ ] **提交**：`feat(service): MailQueryService 新增聚合搜索 search`

## Task 5：MailApiHandler 新增 GET /messages

**目标：** 新增聚合搜索接口，参数全部可选，复用现有 `messageSummaryJson`，包在 `executeBlocking`，遵守用户隔离。

- [ ] **写失败测试**（追加到 `backend/src/test/java/com/maildock/web/handler/MailApiHandlerTest.java`，复用其临时库 + GreenMail + cookie session 中间件 + WebClient 装配；session 中间件已把 `currentUserId`/`currentUser` 写入 ctx）。覆盖：
  - `GET /api/v1/messages` 无参：200，`{total, items}`，items 含本用户跨账号邮件，每条含 `accountId`。
  - 带 `keyword`（≥3，命中正文）：只返回命中邮件。
  - 带 `accountId` / `isRead` / `hasAttach` / `startDate` / `endDate` / `sortBy` / `sortOrder` / `page` / `size`：过滤与分页生效。
  - **用户隔离**：用另一个用户的 session 查询，看不到第一个用户的邮件。
  - 未登录（无 cookie）：401（由既有 session 中间件保证；参照同文件其他用例的断言方式）。
- [ ] **最小实现**：在 `MailApiHandler.registerRoutes` 中，**在 `GET /messages/:id` 之前**注册列表路由（避免 `/messages` 被 `:id` 误匹配——Vert.x 按注册顺序匹配，精确无参路径放前面最稳妥）：
  ```java
  router.get(apiPrefix + "/messages").handler(this::handleSearchMessages);
  ```
  新增 handler（导入 `com.maildock.model.MessageFilter`，用 `RouteValues.parseIntOr` 与 `ctx.request().getParam(...)`）：
  ```java
  private void handleSearchMessages(RoutingContext ctx) {
      long userId = currentUserId(ctx);
      MessageFilter filter = new MessageFilter(
              ctx.request().getParam("keyword"),
              parseLongOrNull(ctx.request().getParam("accountId")),
              parseBoolOrNull(ctx.request().getParam("isRead")),
              parseBoolOrNull(ctx.request().getParam("hasAttach")),
              parseLongOrNull(ctx.request().getParam("startDate")),
              parseLongOrNull(ctx.request().getParam("endDate")),
              ctx.request().getParam("sortBy"),
              ctx.request().getParam("sortOrder"));
      int page = parseIntOr(ctx.request().getParam("page"), 1);
      int size = parseIntOr(ctx.request().getParam("size"), 20);
      vertx.executeBlocking(() -> mailQueryService.search(userId, filter, page, size), false)
              .onComplete(ar -> {
                  if (ar.failed()) { ctx.fail(ar.cause()); return; }
                  MailQueryService.PagedMessages paged = ar.result();
                  JsonArray items = new JsonArray();
                  for (Message message : paged.items()) items.add(messageSummaryJson(message));
                  json(ctx, 200, new JsonObject().put("total", paged.total()).put("items", items));
              });
  }
  ```
  新增两个私有静态辅助 `parseLongOrNull(String)` / `parseBoolOrNull(String)`（空白或解析失败返回 null；bool 接受 `"true"`/`"false"`）。放在 `MailApiHandler` 内即可，无需进 `RouteValues`（除非已有等价方法——先 Grep `RouteValues` 确认是否已有 `parseLong`/`parseBool`，有则复用）。
- [ ] **运行测试** `mvn test -Dtest=MailApiHandlerTest`，再 `mvn test` 全量回归。
- [ ] **提交**：`feat(api): 新增 GET /messages 聚合邮件搜索接口`

## Task 6：前端 api/client.ts 新增 searchMessages

**目标：** 增 `MessageQuery` 类型与 `searchMessages(query): Promise<PagedMessages>`，按 `listAccounts` 的 `URLSearchParams` 写法构造 query。

- [ ] **写失败测试**（追加到 `frontend/src/api/client.test.ts`，复用其 `vi.stubGlobal('fetch', ...)` 断言 URL/method 的写法）：
  - 空 query：请求 `/api/v1/messages?page=1&size=20`，method GET，带 `credentials:'include'`。
  - 含全部字段：断言 `keyword` / `accountId` / `isRead` / `hasAttach` / `startDate` / `endDate` / `sortBy` / `sortOrder` 都出现在 query string；布尔以 `'true'`/`'false'` 字符串传递；空 `keyword` 不出现。
  - 返回值解析为 `{ total, items }`。
- [ ] **最小实现**：在 `client.ts` 增类型与方法：
  ```ts
  /** 聚合邮件查询条件，全部可选。 */
  export interface MessageQuery {
    keyword?: string;
    accountId?: number;
    isRead?: boolean;
    hasAttach?: boolean;
    startDate?: number;
    endDate?: number;
    sortBy?: 'receivedAt' | 'sentAt' | string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    size?: number;
  }
  ```
  （注意：后端排序字段是 `received_at`/`sent_at`，但 API query 参数 `sortBy` 直接透传字符串；前端用 `receivedAt`/`sentAt` 则需映射——**统一约定**：前端 `sortBy` 直接传后端识别的值。为简洁，前端下拉用 `receivedAt`/`sentAt` 文案但发送 `sortBy=received_at`/`sent_at`。在 `searchMessages` 内不做映射，由调用方（aggregateMailPageModel）传后端值。）方法：
  ```ts
  searchMessages(query: MessageQuery = {}): Promise<PagedMessages> {
    const params = new URLSearchParams();
    if (query.keyword && query.keyword.trim()) params.set('keyword', query.keyword.trim());
    if (query.accountId != null) params.set('accountId', String(query.accountId));
    if (query.isRead != null) params.set('isRead', String(query.isRead));
    if (query.hasAttach != null) params.set('hasAttach', String(query.hasAttach));
    if (query.startDate != null) params.set('startDate', String(query.startDate));
    if (query.endDate != null) params.set('endDate', String(query.endDate));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    params.set('page', String(query.page ?? 1));
    params.set('size', String(query.size ?? 20));
    return this.request<PagedMessages>(`/messages?${params.toString()}`, { method: 'GET' });
  }
  ```
- [ ] **运行测试** `cd frontend && npx vitest run src/api/client.test.ts`，通过后 `npm test` 回归。
- [ ] **提交**：`feat(frontend): api client 新增 searchMessages`

## Task 7：批量收信纯逻辑 runBatchRefresh（accountsPageModel）

**目标：** 抽出可被两个页面共用的串行收信编排函数，纯逻辑、可单测，返回汇总；逐个上报进度。

- [ ] **写失败测试**（追加到 `frontend/src/pages/accountsPageModel.test.ts`）。用一个假 `refresh` 函数（`vi.fn`）：
  - 串行：依次对每个 id 调用 `refresh`，顺序与传入 ids 一致（断言调用次数 = ids 长度）。
  - 进度回调：每个 id 完成后调用 `onProgress(done, total)`，`done` 递增。
  - 汇总：返回 `{ successCount, failCount, newTotal, failures: [{id, message}] }`；一个 id 的 refresh reject 时计入 `failCount` 与 `failures` 且**不中断**后续 id。
  - `newTotal` 累加每个成功结果的 `newCount`。
- [ ] **最小实现**：在 `accountsPageModel.ts` 增（不依赖 React）：
  ```ts
  /** 批量收信单项失败记录。 */
  export interface BatchRefreshFailure { id: number; message: string; }

  /** 批量收信汇总。 */
  export interface BatchRefreshSummary {
    successCount: number;
    failCount: number;
    newTotal: number;
    failures: BatchRefreshFailure[];
  }

  /**
   * 串行对一组账号触发收信。逐个 await，单个失败不中断其余；
   * 每完成一个调用 onProgress 上报进度。纯逻辑，便于单测与两页共用。
   */
  export async function runBatchRefresh(
    refresh: (id: number) => Promise<{ newCount: number }>,
    ids: number[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchRefreshSummary> {
    const summary: BatchRefreshSummary = { successCount: 0, failCount: 0, newTotal: 0, failures: [] };
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const res = await refresh(id);
        summary.successCount += 1;
        summary.newTotal += res.newCount ?? 0;
      } catch (e) {
        summary.failCount += 1;
        summary.failures.push({ id, message: (e as Error).message });
      }
      onProgress?.(i + 1, ids.length);
    }
    return summary;
  }
  ```
- [ ] **运行测试** `cd frontend && npx vitest run src/pages/accountsPageModel.test.ts`，再 `npm test` 回归。
- [ ] **提交**：`feat(frontend): 抽出批量收信纯逻辑 runBatchRefresh`

## Task 8：聚合页纯逻辑 aggregateMailPageModel

**目标：** 把聚合页的纯逻辑（过滤态默认值、UI 选项 → `MessageQuery` 映射、时间日期 → 时间戳、账号徽章用 `truncateEmail`）放进可单测模块，沿用账号页拆分约定。

- [ ] **写失败测试** `frontend/src/pages/aggregateMailPageModel.test.ts`（新建）。覆盖：
  - `DEFAULT_FILTER`：keyword 空、accountId 'all'、readState 'all'、attachState 'all'、起止日期空、`sortBy='received_at'`、`sortOrder='desc'`。
  - `toMessageQuery(filter, page, size)`：把 UI 态映射为 `MessageQuery`——
    - `readState='read'→isRead:true`，`'unread'→isRead:false`，`'all'→isRead 不传`（undefined）。
    - `attachState='with'→hasAttach:true`，`'without'→hasAttach:false`，`'all'→undefined`。
    - `accountId='all'→accountId undefined`，否则数字。
    - 日期字符串 `'2026-06-01'` → `startDate` 当日 00:00:00 毫秒；`endDate` 取当日 23:59:59.999 毫秒（含当天）。空日期不传。
    - keyword 透传 trim 后值；空串不传。
- [ ] **最小实现** `frontend/src/pages/aggregateMailPageModel.ts`（新建，导入 `MessageQuery` 类型）：定义 `AggregateFilterState` 接口（`keyword: string; accountId: 'all' | number; readState: 'all'|'read'|'unread'; attachState: 'all'|'with'|'without'; startDate: string; endDate: string; sortBy: string; sortOrder: 'asc'|'desc'`）、`DEFAULT_FILTER` 常量、`toMessageQuery(filter, page, size): MessageQuery`、以及 `dateToStartMs(s)` / `dateToEndMs(s)` 辅助（用本地时区 `new Date(`${s}T00:00:00`)` / `T23:59:59.999`，空串返回 undefined）。可复用 `MailListPage` 的 `formatTime` 思路，但本模块只放纯函数。
- [ ] **运行测试** `npx vitest run src/pages/aggregateMailPageModel.test.ts`，再 `npm test` 回归。
- [ ] **提交**：`feat(frontend): 新增聚合邮件页纯逻辑 aggregateMailPageModel`

## Task 9：AggregateMailPage 页面 + 路由 + UserMenu 入口

**目标：** 新增聚合邮件页（工具栏过滤 + 列表 + 分页 + 「收取全部」），接 `/messages` 受保护路由，UserMenu「邮件列表」改指 `/messages`。

- [ ] **写失败测试** `frontend/src/pages/AggregateMailPage.test.tsx`（新建，参照 `MailListPage` 测试与 `@testing-library/react` + `MemoryRouter` 用法）。用 mock `ApiClient`（`searchMessages` / `refresh` / `listAccounts` 为 `vi.fn`）：
  - 初次渲染调用 `searchMessages`，渲染返回的邮件（主题、发件人、所属账号徽章）。
  - 输入关键词并提交 → 以 `keyword` 再次调用 `searchMessages`。
  - 切换已读 / 附件 / 账号下拉 → 对应 `MessageQuery` 字段进入调用参数。
  - 点某封邮件 → `navigate` 到 `/accounts/${accountId}/messages/${id}`（断言用 mock 的 navigate 或路由变化）。
  - 点「收取全部」→ 先 `listAccounts` 取全部 id（或用已加载账号列表），串行 `refresh` 后重新 `searchMessages`；展示汇总 Toast。
- [ ] **最小实现** `frontend/src/pages/AggregateMailPage.tsx`（新建）：
  - props `{ api: ApiClient }`。state：`items`/`total`/`page`/`pageSize`、`filter`（`AggregateFilterState`，初值 `DEFAULT_FILTER`）、`accounts`（用于账号下拉与「收取全部」的 id 集合）、`error`/`busy`/`progress`。
  - `useEffect` 进页加载账号下拉（`api.listAccounts({ size: 100 })`）与首页邮件。
  - `load(page)`：`api.searchMessages(toMessageQuery(filter, page, pageSize))`，写入 `items`/`total`。
  - 工具栏：关键词输入（占位「搜索主题 / 发件人 / 正文」）+ 账号下拉（全部 / 各账号 email，用 `truncateEmail`，完整值进 `title`）+ 已读三态 + 附件三态 + 起止日期 `<input type="date">` + 排序下拉（最新接收 `received_at-desc` / 最早接收 `received_at-asc` / 发送时间 `sent_at-desc`）+ 「收取全部」按钮。视觉沿用 `AccountsPage`/`MailListPage` 的 Tailwind 卡片风格（含 dark: 变体）。
  - 列表：复用 `MailListPage` 的卡片 / 桌面行视觉，每行额外渲染所属账号徽章（由 `m.accountId` 在 `accounts` 中查 email，`truncateEmail` 显示、完整值进 `title`）。点击行 `navigate(`/accounts/${m.accountId}/messages/${m.id}`)`。
  - 「收取全部」：`ids = accounts.map(a => a.id)`；`setBusy(true)`，`runBatchRefresh(api.refresh.bind(api), ids, (done,total)=>setProgress(`正在收取 ${done}/${total}`))`；完成后 Toast 汇总（成功数 / 累计新增 / 失败数），再 `load(1)`。Toast 沿用 `MailListPage` 的 DOM Toast 或 `AccountsPage` 的 `showToast` 风格（二选一，保持本页一致）。
  - 分页：复用 `MailListPage` 分页结构（页大小 `[10,20,50,100]`）。
  - 导入 `truncateEmail`（`utils/email.ts`，先 Grep 确认签名）、`runBatchRefresh`、`DEFAULT_FILTER`/`toMessageQuery`/`AggregateFilterState`。
- [ ] **接路由** `frontend/src/App.tsx`：导入 `AggregateMailPage`，在受保护路由组内新增（与其他页同样包 `Header`）：
  ```tsx
  <Route path="/messages" element={
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header />
      <AggregateMailPage api={api} />
    </div>
  } />
  ```
- [ ] **改 UserMenu** `frontend/src/components/UserMenu.tsx`：把「邮件列表」项的 `navigate('/accounts')` 改为 `navigate('/messages')`（行 130 附近）。若有 `UserMenu.test.tsx` 断言旧目标，同步更新。
- [ ] **详情页返回来源**（spec 要求从 `/messages` 进入能返回 `/messages`）：检查 `MailDetailPage` 当前「返回」逻辑。最简实现——返回按钮用 `navigate(-1)`（浏览器历史），天然回到来源页；若现状是硬编码 `navigate('/accounts/:id/messages')`，改为 `navigate(-1)` 并补一条测试。若改动影响既有 MailDetailPage 测试，同步更新。（先 Read `MailDetailPage.tsx` 确认现状再决定改法。）
- [ ] **运行测试** `npx vitest run src/pages/AggregateMailPage.test.tsx`，再 `npm test`；并 `npm run build`（`tsc -b && vite build`）确保类型 / 构建通过。
- [ ] **提交**：`feat(frontend): 新增聚合邮件管理页与 /messages 路由`

## Task 10：AccountsPage 工具栏「批量收信」

**目标：** 账号页工具栏新增「批量收信」按钮（桌面 + 移动端），语义「选中收选中、不选收全部」，串行收信 + 进度 + 汇总 Toast。

- [ ] **写失败测试**（追加到 `frontend/src/pages/AccountsPage.test.tsx`，复用其 mock api 与查询渲染套路）：
  - 选中若干账号点「批量收信」→ 对选中 id 串行调用 `refresh`，完成后 `reload`（重新 `listAccounts`）并清空选择、弹汇总 Toast。
  - 未选中点「批量收信」→ 对当前用户全部账号收信。语义与 `testBatch` 一致（用全部已加载账号 id，或与现有 `handleTestBatch` 一致的「全部」语义）。
  - 收信期间相关按钮 `disabled`（`busy`）。
- [ ] **最小实现** `frontend/src/pages/AccountsPage.tsx`：
  - 导入 `runBatchRefresh`、加一个 `RefreshCw`（lucide）图标与 `progress` state（可选，用于按钮文案）。
  - 新增 `handleRefreshBatch`：`const ids = selectedIds.length > 0 ? selectedIds : accounts.map(a => a.id)`（与 testBatch 的「不选=全部」对齐；若要严格「全部账号」而非「当前页」，可改为先 `api.listAccounts({size:100})` 取全量 id——按 spec「当前用户全部账号」语义，**取全量**更准确，实现时用一次性拉全量 id）。`setBusy(true)`，`await runBatchRefresh(api.refresh.bind(api), ids, (done,total)=>...)`，完成后 `await reload()`、`setSelectedIds([])`、`showToast` 汇总（如 `✓ 收信完成：成功 N，新增 M 封${失败 K}`）。`finally setBusy(false)`。
  - 桌面工具栏按钮组：在「批量测活」按钮**之后**插入「批量收信」按钮（样式仿批量测活的次要按钮，图标 `RefreshCw`，文案 `批量收信{selectedIds.length>0?` (${n})`:''}`，`disabled={busy}`）。
  - 移动端工具栏「操作按钮行」同样加一个等价按钮（`aria-label="移动端批量收信"`）。
- [ ] **运行测试** `npx vitest run src/pages/AccountsPage.test.tsx`，再 `npm test`，并 `npm run build`。
- [ ] **提交**：`feat(frontend): 账号页新增批量收信`

---

## 收尾验证

- [ ] **后端全量**：`cd backend && mvn test`，全绿。
- [ ] **前端全量**：`cd frontend && npm test`，全绿；`npm run build` 通过（tsc 类型检查 + vite 构建）。
- [ ] **手动冒烟**（可选，需真实 / GreenMail 环境）：登录 → 聚合页关键词（中文正文）检索命中 → 各过滤组合 → 点邮件进详情再返回回到 `/messages` → 账号页「批量收信」与聚合页「收取全部」进度与汇总正常。
- [ ] **约束自查**：聚合接口只读未加锁；FTS 写随 `mail_message` 在写锁内；新查询均带 `a.user_id=?`；排序字段 / 方向白名单；FTS 关键词包裹双引号；授权码未出现在任何新响应 / 日志。
- [ ] **文档**：如有必要，在 `CLAUDE.md` 架构要点补一句聚合查询 + FTS 的约束（保持简洁）。

## 实现顺序说明

严格自底向上、逐任务 TDD：Task 1→2（FTS schema + 回填）→ 3→4（repository + service）→ 5（API）→ 6（client）→ 7（批量收信纯逻辑）→ 8（聚合页纯逻辑）→ 9（聚合页 UI + 路由）→ 10（账号页批量收信）。每个 Task 内先写失败测试，再最小实现，跑测试 + 回归，单独提交。

