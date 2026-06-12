# 全站视觉重构 Plan 3: 数据管理页面重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按原型重构 AccountsPage（工具栏 + 表格）与 MailListPage（白色大卡片容器），并完成全局验证

**Architecture:** AccountsPage 改用白色卡片工具栏（搜索框带图标 + 按钮组 + 已选中提示条）、白色卡片表格（彩色头像 + 状态徽章带圆点 + 三点菜单），删除 grid/table 视图切换；MailListPage 改用单一白色大卡片容器（顶部工具栏 + divide-y 列表 + 发件人头像）

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react + vitest

**关联文档：** `docs/superpowers/specs/2026-06-12-full-visual-refactor-design.md` (Task F-I)

---

## 前置说明（执行前必读）

**1. 不做 brand→emerald 迁移（重要纠正）**
`brand-*` 不是需要清除的蓝色残留。`frontend/tailwind.config.js` 已把 `brand` 调色板定义为 emerald 的别名（`brand-500`=`#10b981`=emerald-500、`brand-600`=`#059669`、`brand-50`=`#ecfdf5`），且 `frontend/src/theme.test.ts` 有守护测试断言这一映射。也就是说 `bg-brand-500` 渲染出来就是绿色，与 `bg-emerald-500` 视觉一致。

因此：
- **保留现有所有 `brand-*` 类名**，不要改成 `emerald-*`。改了会让 `theme.test.ts`（3 处）和 `MailListPage.test.tsx`（`ring-brand-300` 共 6 处）失败。
- 新增元素用 `emerald-*` 即可（与 `brand-*` 同色，本计划正文 JSX 统一用 `emerald-*`），不强制改回 `brand-*`，也不要去动现有的 `brand-*`。两者可在同一文件共存，因为渲染同色。
- **唯一真蓝色例外**：`AccountsPage.tsx` 复选框用的是**内联 style 硬编码蓝色** `rgb(59, 130, 246)`（不走 Tailwind），这才是真蓝色，需改为 emerald `rgb(16, 185, 129)`（见 Task G Step 3）。

**2. 视觉断言 vs 行为断言（重要原则）**
现有测试分两类，改动策略不同：
- **行为断言**（必须保留不动）：API 调用参数（如 `testBatch([1])`、`onOpenAccount(7)`）、回调触发、可访问名语义。
- **视觉/结构断言**（随重构同步重写）：placeholder 文案、容器类名、未读高亮类名等。

本计划凡涉及改可访问名（如把「删除」「测活」按钮收进三点菜单）或改文案（placeholder）的，都**必须同步重写对应测试**，且保留其中的行为断言部分。

**3. 保留核心功能**
原型未画出但属现有核心功能，**必须保留**：
- 导入账号（ImportModal）
- 状态筛选下拉（全部/待检测/正常/异常）
- 排序下拉（最近收信/最早收信/最近测活/最早测活）
- 分页器（含每页条数选择）
- 表头复选框全选、单行复选框

**4. 删除项**
- AccountsPage 的 `viewMode` grid/table 视图切换（含 `viewMode` state、切换按钮组、grid 分支整段渲染）
- 移动端单独卡片渲染分支可保留（响应式），但桌面表格为主改造对象

**5. 三点菜单（RowMenu）交互**
原型操作列用三点菜单（`MoreVertical` 图标）展开「测活 / 删除」。需新建 `RowMenu` 子组件，复用 UserMenu 的点击外部关闭 + Esc 关闭模式。

---

## 文件改动清单

**Task F（AccountsPage 工具栏）：**
- Modify: `frontend/src/pages/AccountsPage.tsx` — 工具栏部分
- Modify: `frontend/src/pages/AccountsPage.test.tsx` — 工具栏测试

**Task G（AccountsPage 表格）：**
- Modify: `frontend/src/pages/AccountsPage.tsx` — 表格部分 + RowMenu 子组件 + 头像/徽章辅助函数
- Modify: `frontend/src/pages/AccountsPage.test.tsx` — 表格测试

**Task H（MailListPage）：**
- Modify: `frontend/src/pages/MailListPage.tsx` — 白色卡片容器
- Modify: `frontend/src/pages/MailListPage.test.tsx` — 容器测试

**Task I（全局验证）：**
- 全量测试 + 构建 + 人工核对

---

## Task F: AccountsPage 重构（工具栏部分）

**原型参考：** `design-prototypes/design-prototype.html` section-5 (393-445 行)

**目标：** 把现有顶部操作栏 + 搜索过滤栏，重构为单个白色卡片工具栏（搜索框带 Search 图标 + 按钮组 + 已选中提示条）。删除 viewMode 切换。

### Step 1: 调整测试（TDD）

- [ ] **先重读现有测试，定位需同步修改的断言**

```bash
cd frontend && grep -n "搜索邮箱\|批量测活\|name: '删除'\|name: '测活'\|getByLabelText('排序方式')\|状态过滤" src/pages/AccountsPage.test.tsx
```

已知现有断言（必须心里有数，下面会逐一处理）：
- 第 314/315 行：`getByPlaceholderText('搜索邮箱...')` —— **本任务改文案，需同步改为 `搜索邮箱地址...`**
- 第 193/212/244 行：`name: /批量测活 \(N\)/`（带数量）—— 本任务工具栏保留「批量测活」文案，但**去掉了数量后缀**（数量改由已选中提示条展示）。这几处断言要改为不带数量的 `name: /批量测活/`，数量断言改为查提示条文本 `已选中 N 个账号`。
- 删除/测活按钮（`name: '删除'`/`name: '测活'`）属 Task G 范畴，本步不动。

- [ ] **修改 `AccountsPage.test.tsx` 工具栏相关断言**

**① 改搜索文案**（第 314、315 行两处 `搜索邮箱...` → `搜索邮箱地址...`）：

```typescript
fireEvent.change(screen.getByPlaceholderText('搜索邮箱地址...'), { target: { value: 'alic' } });
fireEvent.submit(screen.getByPlaceholderText('搜索邮箱地址...').closest('form')!);
```

> 注意：工具栏重构后搜索框可能不再包在 `<form>` 里（改为 onKeyDown Enter 触发）。若去掉 form，把这条测试的 `fireEvent.submit(...closest('form'))` 改为 `fireEvent.keyDown(input, { key: 'Enter' })`。详见 Step 3 决策。

**② 改批量测活断言去掉数量后缀**（第 176-218、220-245 行三处）：
把 `screen.findByRole('button', { name: /批量测活 \(3\)/ })` 改为先断言提示条数量、再断言按钮存在：

```typescript
// 原：expect(await screen.findByRole('button', { name: /批量测活 \(3\)/ })).toBeInTheDocument();
// 改为：
expect(await screen.findByText('已选中 3 个账号')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /批量测活/ })).toBeInTheDocument();
```

「全选后再次点击取消」「取消某行」两处同理：数量断言改查提示条文本（`已选中 N 个账号` / 取消后 `queryByText(/已选中/)` 为 null）。

**③ 新增工具栏结构测试**：

```typescript
it('工具栏在白色卡片容器内', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const search = await screen.findByPlaceholderText('搜索邮箱地址...');
  const toolbar = search.closest('.rounded-2xl');
  expect(toolbar).toHaveClass('bg-white');
});

it('搜索框带左内边距给 Search 图标留位', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const search = await screen.findByPlaceholderText('搜索邮箱地址...');
  expect(search).toHaveClass('pl-10');
});

it('选中账号后显示已选中提示条，可取消选择', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findAllByText('a@163.com');
  // 用稳定的可访问名选中首行（桌面表格），避免 checkbox 索引歧义
  fireEvent.click(screen.getByRole('checkbox', { name: '选择 a@163.com' }));
  expect(await screen.findByText('已选中 1 个账号')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
  await waitFor(() => expect(screen.queryByText(/已选中/)).not.toBeInTheDocument());
});
```

> 不新增「不再渲染视图切换」测试：旧切换按钮无可访问名，无法稳定断言其不存在。删除 viewMode 代码即可，由全量测试和人工核对保证。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 新增的工具栏测试 FAIL（容器类名、placeholder、提示条尚不匹配）。改文案的现有测试此时也会因实现未改而 FAIL（正常）。

### Step 2: 删除 viewMode 相关代码

- [ ] **删除 viewMode state 与 grid 分支**

在 `AccountsPage.tsx` 中：
- 删除 `const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');`
- 删除顶部操作栏里的「视图切换」按钮组（`<div className="hidden sm:flex gap-1 rounded-lg bg-slate-100 p-1">...</div>` 整段）
- 删除 `{viewMode === 'table' ? (...) : (<div className="grid ...">...</div>)}` 的三元，保留表格分支（含移动端卡片），去掉 grid 分支整段

### Step 3: 重构工具栏为白色卡片

- [ ] **替换顶部操作栏 + 搜索过滤栏为单个白色卡片工具栏**

参考设计文档 section-5。结构要点：

```tsx
{/* 页标题 */}
<div className="mb-6 flex items-center justify-between">
  <h2 className="text-2xl font-bold text-slate-900">邮箱账号</h2>
</div>

{error && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">{error}</p>}

{/* 白色卡片工具栏 */}
<div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex flex-wrap items-center gap-3">
    {/* 搜索框（带 Search 图标） */}
    <div className="relative min-w-[240px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="text"
        placeholder="搜索邮箱地址..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </div>

    {/* 状态筛选（保留核心功能） */}
    <select
      aria-label="状态过滤"
      value={status}
      onChange={(e) => handleStatusChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
    >
      <option value="">全部状态</option>
      <option value="pending">待检测</option>
      <option value="ok">正常</option>
      <option value="fail">异常</option>
    </select>

    {/* 排序（保留核心功能） */}
    <select
      aria-label="排序方式"
      value={`${sortBy}-${sortOrder}`}
      onChange={(e) => {
        const [field, order] = e.target.value.split('-');
        setSortBy(field);
        setSortOrder(order as 'asc' | 'desc');
      }}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
    >
      <option value="lastSyncAt-desc">最近收信</option>
      <option value="lastSyncAt-asc">最早收信</option>
      <option value="lastTestAt-desc">最近测活</option>
      <option value="lastTestAt-asc">最早测活</option>
    </select>

    {/* 按钮组 */}
    <div className="flex gap-2">
      <button
        type="button"
        disabled={selectedIds.length === 0 || busy}
        onClick={handleTestBatch}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">批量测活</span>
      </button>
      <button
        type="button"
        disabled={selectedIds.length === 0 || busy}
        onClick={handleDeleteBatch}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">批量删除</span>
      </button>
      <button
        type="button"
        onClick={() => setShowImport(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">导入</span>
      </button>
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">添加账号</span>
      </button>
    </div>
  </div>

  {/* 已选中提示条 */}
  {selectedIds.length > 0 && (
    <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        <span className="font-medium text-emerald-800">已选中 {selectedIds.length} 个账号</span>
      </div>
      <button
        type="button"
        onClick={() => setSelectedIds([])}
        className="text-emerald-600 transition hover:text-emerald-700"
      >
        取消选择
      </button>
    </div>
  )}
</div>
```

- [ ] **更新 import**

在 `AccountsPage.tsx` 顶部 lucide 导入中补充：`Search`、`CheckCircle`、`MoreVertical`（MoreVertical 给 Task G 用）。保留 `Plus`、`Upload`、`Trash2`、`Mail`、`Clock`。

```typescript
import { Plus, Upload, Trash2, Mail, Clock, Search, CheckCircle, MoreVertical } from 'lucide-react';
```

- [ ] **运行测试确认工具栏测试通过**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 工具栏相关测试 PASS（表格相关可能仍有调整中的测试，Task G 处理）。

### Step 4: 提交

- [ ] **提交**

```bash
cd frontend && git add src/pages/AccountsPage.tsx src/pages/AccountsPage.test.tsx
git commit -m "refactor(frontend): 重构 AccountsPage 工具栏（白色卡片）

- 顶部操作栏 + 搜索栏合并为单个白色卡片工具栏
- 搜索框带 Search 图标，placeholder 改为 搜索邮箱地址...
- 新增已选中提示条（emerald），支持取消选择
- 删除 grid/table 视图切换
- 对齐 design-prototype.html section-5"
```

---

## Task G: AccountsPage 重构（表格部分）

**原型参考：** `design-prototypes/design-prototype.html` section-5 (448-556 行)

**目标：** 表格容器白色卡片 + 表头渐变 + 邮箱列彩色头像 + 状态徽章带圆点 + 操作列三点菜单（RowMenu）。

### Step 1: 调整测试（TDD）

> **关键：三点菜单会破坏现有可访问名为「测活」「删除」的按钮查询。** 现有 `AccountsPage.test.tsx` 有多处依赖这些直接按钮，改三点菜单后**必须同步重写**。下面分「需重写的现有测试」与「新增结构测试」两部分。

- [ ] **A. 重写受三点菜单影响的现有测试**

以下现有测试用 `getByRole('button', { name: '删除'|'测活' })` 直接查询行内按钮，三点菜单后这些按钮被收进弹层。新增一个辅助函数，并改写这些测试为「先点开该行三点菜单，再点 menuitem」。

在 `describe('AccountsPage', ...)` 内顶部加辅助函数：

```typescript
/** 打开指定邮箱所在行的三点菜单，返回该行作用域。 */
async function openRowMenu(emailText: string) {
  const row = (await screen.findByText(emailText)).closest('tr') as HTMLElement;
  const moreBtn = within(row).getByRole('button', { name: '更多操作' });
  fireEvent.click(moreBtn);
  return row;
}
```

> 记得在文件顶部 import 补充 `within`：`import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';`

逐个改写（保留各自的**行为断言**不变，只改触发方式）：

1. **「确认后删除账号并从列表移除」**（原直接点删除按钮）改为：
```typescript
await openRowMenu('del@163.com');
fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));
expect(confirmSpy).toHaveBeenCalled();
await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith(3));
```

2. **「取消确认时不删除账号」** 改为：
```typescript
await openRowMenu('del@163.com');
fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));
expect(confirmSpy).toHaveBeenCalled();
expect(api.deleteAccount).not.toHaveBeenCalled();
```

3. **「单个账号测活后刷新列表」** 改为：
```typescript
await openRowMenu('one@163.com');
fireEvent.click(screen.getByRole('menuitem', { name: /测活/ }));
await waitFor(() => expect(api.testConnection).toHaveBeenCalledWith(5));
```

4. **「删除按钮内嵌图标且可访问名保持「删除」」** —— 此测试断言已不再成立（删除进了菜单）。改为断言三点菜单内删除项带图标：
```typescript
it('三点菜单内删除项带图标', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await openRowMenu('a@163.com');
  const delItem = screen.getByRole('menuitem', { name: /删除/ });
  expect(delItem.querySelector('svg')).toBeInTheDocument();
});
```

> **注意 `getByRole('button', { name: '测活' })` 全局查询**：「批量测活后刷新列表」测试里用 `findByRole('button', { name: /批量测活/ })` 不受影响（批量测活仍在工具栏）。只有**行内**单个测活/删除受影响。逐一核对 `cat` 出的实际测试，凡命中行内「测活」「删除」直接按钮的都按上面改。

- [ ] **B. 新增结构测试**

```typescript
it('表格在白色卡片容器内', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('alice@163.com');
  const table = screen.getByRole('table');
  expect(table.closest('.rounded-2xl')).toHaveClass('bg-white');
});

it('邮箱列有彩色头像', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('alice@163.com');
  const row = screen.getByText('alice@163.com').closest('tr');
  const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
  expect(avatar).toBeInTheDocument();
  expect(avatar).toHaveTextContent('A');
});

it('状态徽章带圆点', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'ok@163.com', lastTestOk: true })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  const badge = (await screen.findByText('正常')).closest('span');
  const dot = badge?.querySelector('span.rounded-full');
  expect(dot).toBeInTheDocument();
});

it('操作列三点菜单展开测活与删除', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await openRowMenu('alice@163.com');
  expect(screen.getByRole('menuitem', { name: /测活/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /删除/ })).toBeInTheDocument();
});
```

> **移动端卡片同步**：现有测试中部分 `getAllByRole('button', { name: '删除' })` 取的是桌面+移动两套。改三点菜单后，移动端卡片若仍保留直接按钮，会导致 `getByRole('menuitem')` 之外还存在同名 button，引发歧义。**决策：移动端卡片操作区也改用同款 RowMenu**（或在移动端卡片内复用 RowMenu），保证全局只有三点菜单一种入口。Step 3 会一并处理移动端卡片。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 表格相关测试 FAIL（RowMenu 尚未实现）。

### Step 2: 新增辅助函数与 RowMenu 组件

- [ ] **在 `AccountsPage.tsx` 顶部（组件外）新增头像渐变函数**

```typescript
/** 头像渐变色板：按邮箱 hash 取色，保证同一邮箱稳定同色。 */
const AVATAR_GRADIENTS = [
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-rose-500 to-rose-600',
  'from-blue-500 to-blue-600',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-600',
];

function emailToAvatarGradient(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
```

- [ ] **在文件底部新增 RowMenu 子组件（三点菜单）**

```tsx
/** 行操作三点菜单：展开「测活 / 删除」，点击外部或 Esc 关闭。 */
function RowMenu({
  onTest,
  onDelete,
  testing,
}: {
  onTest: () => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            disabled={testing}
            onClick={() => { setOpen(false); onTest(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {testing ? '测活中…' : '测活'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
```

### Step 3: 重构表格容器与行

- [ ] **表格容器改为白色卡片 + 表头渐变**

桌面端表格外层容器改为：
```tsx
<div className="hidden overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
  <table className="w-full">
    <thead className="bg-gradient-to-br from-slate-50 to-white text-left text-xs font-medium uppercase tracking-wider text-slate-500">
```

**注意：** 容器用 `overflow-visible`（不要 `overflow-hidden`），否则三点菜单弹层会被裁切。

- [ ] **邮箱列改为彩色头像 + 邮箱地址**

```tsx
<td className="px-6 py-4">
  <div className="flex items-center gap-3">
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(a.email)} text-sm font-semibold text-white shadow-sm`}>
      {a.email.charAt(0).toUpperCase()}
    </div>
    <button
      type="button"
      className="text-sm font-medium text-slate-800 transition hover:text-emerald-600"
      onClick={() => onOpenAccount(a.id)}
    >
      {a.email}
    </button>
  </div>
</td>
```

- [ ] **状态徽章改为带圆点（emerald/amber/rose）**

复用现有 `statusOf`，徽章渲染：
```tsx
<td className="px-6 py-4">
  <div className="flex justify-center">
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
      title={a.lastTestMsg || ''}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${
        st.label === '正常' ? 'bg-emerald-500' : st.label === '异常' ? 'bg-rose-500' : 'bg-amber-500'
      }`} />
      {st.label}
    </span>
  </div>
</td>
```

- [ ] **操作列改为 RowMenu**

```tsx
<td className="px-6 py-4">
  <div className="flex justify-center">
    <RowMenu
      testing={testingId === a.id}
      onTest={() => void handleTestOne(a.id)}
      onDelete={() => void handleDelete(a.id)}
    />
  </div>
</td>
```

- [ ] **移动端卡片操作区也改用 RowMenu（消除可访问名歧义）**

现有移动端卡片（`sm:hidden` 分支）的操作区有直接的「测活」「删除」按钮。若桌面改三点菜单而移动端保留直接按钮，`getByRole('menuitem', { name: /删除/ })` 之外还存在同名 `button`，jsdom 下两套都渲染会导致查询歧义。

把移动端卡片底部的两个操作按钮替换为同款 RowMenu（放在卡片右上角或操作区）：

```tsx
{/* 移动端卡片操作区：用三点菜单替代原「测活 / 删除」两个按钮 */}
<div className="flex justify-end">
  <RowMenu
    testing={testingId === a.id}
    onTest={() => void handleTestOne(a.id)}
    onDelete={() => void handleDelete(a.id)}
  />
</div>
```

> 这样全局只有「更多操作」三点菜单一种入口，`openRowMenu` 辅助函数对桌面/移动统一生效（测试用 `closest('tr')` 仅命中桌面表格行，移动端卡片用 `closest('div')`，但因 jsdom 不区分视口，两套 DOM 同时存在——确保两处 RowMenu 的 `aria-label` 都是「更多操作」，且测试 `openRowMenu` 用 `getAllByRole('button', { name: '更多操作' })[0]` 取第一个即可）。

> **同步修正 `openRowMenu` 辅助函数**（Step 1.A）：因桌面+移动两套 DOM 并存，按 `closest('tr')` 限定行作用域可能取不到移动端，改为取全局第一个匹配行的三点菜单更稳妥。若执行时发现歧义，将 `openRowMenu` 改为：
> ```typescript
> async function openRowMenu(emailText: string) {
>   await screen.findAllByText(emailText);
>   // 桌面表格行优先
>   const moreBtns = screen.getAllByRole('button', { name: '更多操作' });
>   fireEvent.click(moreBtns[0]);
> }
> ```
> 注意：多行场景下 `moreBtns[0]` 未必对应目标邮箱。仅含单账号的测试用例不受影响；多账号用例（如需点特定行菜单）仍用 `within(row)` 限定。

- [ ] **复选框改为 emerald 配色**

表头与行内复选框 `style` 中蓝色 `rgb(59, 130, 246)` 改为 emerald `rgb(16, 185, 129)`，hover 边框 `rgb(96, 165, 250)` 改为 `rgb(52, 211, 153)`。移动端卡片内的复选框用的是 Tailwind 类 `border-brand-500 bg-brand-500`（已是绿色，保留不动）。

- [ ] **statusOf 的 cls 改为不含 ring 的徽章底色**

把 `bg-amber-100 text-amber-700 ring-amber-200` 等简化为 `bg-amber-100 text-amber-700`（圆点已单独着色）。

### Step 4: 运行测试

- [ ] **运行 AccountsPage 测试**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 全部 PASS。

### Step 5: 提交

- [ ] **提交**

```bash
cd frontend && git add src/pages/AccountsPage.tsx src/pages/AccountsPage.test.tsx
git commit -m "refactor(frontend): 重构 AccountsPage 表格（头像+徽章+三点菜单）

- 表格改为白色卡片容器 + 渐变表头
- 邮箱列加彩色头像（按邮箱 hash 取色）
- 状态徽章带圆点（emerald/amber/rose）
- 操作列改为 RowMenu 三点菜单（测活/删除）
- 复选框配色改为 emerald
- 对齐 design-prototype.html section-5"
```

---

## Task H: MailListPage 调整（白色大卡片容器）

**原型参考：** `design-prototypes/design-prototype.html` section-6 (560-629 行)

**目标：** 整页用单个白色大卡片包裹（顶部工具栏在卡片内 + divide-y 列表 + 发件人头像 + 未读 emerald 高亮）。

### Step 1: 调整测试（TDD）

> **关键：现有测试有 2 处硬断言 `ring-brand-300` 验证未读高亮**，本任务把未读高亮从「整卡 `ring-2 ring-brand-300`」改为「行背景 `bg-emerald-50/30` + 圆点」，这两个旧测试会失效，**必须重写**。同时现有 mock 主题是「第一封/第二封/未读」等，不是「测试邮件」，断言文本要对齐真实 mock。
>
> 现有 `summary()` 工厂默认 `fromAddr: 'alice@163.com'`、`isRead: false`，可直接复用。

- [ ] **A. 重写受未读高亮改动影响的现有测试**

现有两个测试断言 `ring-brand-300`（「未读邮件以醒目方式标识」「未读样式类 ring-brand-300 在图标替换后仍保留」）。改写为断言新的 emerald 行背景：

```typescript
it('未读邮件以 emerald 背景高亮', async () => {
  const api = stubApi({
    listMessages: vi.fn().mockResolvedValue({
      total: 2,
      items: [
        summary({ id: 1, subject: '未读邮件', isRead: false }),
        summary({ id: 2, subject: '已读邮件', isRead: true }),
      ],
    }),
  });
  render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  const unread = await screen.findByText('未读邮件');
  // 行容器带 bg-emerald-50/30（Tailwind 转义为 bg-emerald-50\/30，用属性选择器避免转义问题）
  const row = unread.closest('[class*="bg-emerald-50"]');
  expect(row).toBeInTheDocument();
});
```

> 第二个 `ring-brand-300` 测试（「未读样式类…仍保留」）属于图标重构期的临时守护，已无意义，**直接删除**。

- [ ] **B. 新增结构测试**

```typescript
it('列表在白色大卡片容器内', async () => {
  const api = stubApi({
    listMessages: vi.fn().mockResolvedValue({ total: 1, items: [summary({ id: 1, subject: '某封' })] }),
  });
  render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  const heading = await screen.findByRole('heading', { name: /收件箱/ });
  const container = heading.closest('.rounded-2xl');
  expect(container).toHaveClass('bg-white');
});

it('发件人有彩色头像', async () => {
  const api = stubApi({
    listMessages: vi.fn().mockResolvedValue({
      total: 1,
      items: [summary({ id: 1, subject: '某封', fromAddr: 'alice@163.com' })],
    }),
  });
  render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  const subject = await screen.findByText('某封');
  const row = subject.closest('.cursor-pointer');
  const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
  expect(avatar).toBeInTheDocument();
  expect(avatar).toHaveTextContent('A');
});
```

- [ ] **C. 核对受按钮文案影响的现有测试**

新设计刷新按钮文案改为「收取邮件」（移动端隐藏文字），但现有测试用 `getByRole('button', { name: /刷新/ })` 和 `name: '刷新'`（共 2 处）。**决策：刷新按钮的可访问名保留含「刷新」**——做法是给按钮加 `aria-label="刷新"`（即便可见文字是「收取邮件」），这样现有刷新行为测试无需改动。返回按钮现有测试用 `name: /返回/`，新设计可见文字仍是「返回」，不受影响。

> 即：刷新按钮 `<button aria-label="刷新" ...>`，可见 `<span className="hidden sm:inline">收取邮件</span>`。`getByRole('button', { name: '刷新' })` 仍可命中。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/MailListPage.test.tsx
```

Expected: 新增结构测试与重写的未读高亮测试 FAIL（白卡容器/头像/emerald 背景尚未实现）。其余行为测试应保持 PASS。

### Step 2: 新增头像渐变函数

- [ ] **在 `MailListPage.tsx` 复用同款头像函数**

把 Task G 的 `AVATAR_GRADIENTS` + `emailToAvatarGradient` 复制到 `MailListPage.tsx` 顶部（组件外）。

> 备选：抽到 `frontend/src/lib/avatar.ts` 共享。本计划为降低改动面，采用各文件各放一份；如执行者愿意可重构为共享模块并补单测。

### Step 3: 重构为白色大卡片

- [ ] **替换整个 return 的列表部分**

参考设计文档 section-6。结构要点：

```tsx
return (
  <div className="app-main">
    {error && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">{error}</p>}

    <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 顶部工具栏（卡片内） */}
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Mail className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            收件箱
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{busy ? '刷新中…' : '收取邮件'}</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回
            </button>
          </div>
        </div>
      </div>

      {/* 邮件列表 */}
      <div className="divide-y divide-slate-50">
        {items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300" aria-hidden="true" />
            <p className="text-slate-400">暂无邮件</p>
          </div>
        ) : (
          items.map((m) => (
            <div
              key={m.id}
              onClick={() => onOpenMessage(m.id)}
              className={`group cursor-pointer px-6 py-4 transition ${
                m.isRead ? 'hover:bg-slate-50' : 'bg-emerald-50/30 hover:bg-emerald-50/50'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* 发件人头像 */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(m.fromAddr)} text-sm font-semibold text-white shadow-md`}>
                  {m.fromAddr.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {!m.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                      <span className={`truncate text-sm ${m.isRead ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>
                        {m.fromAddr}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {m.hasAttach && <Paperclip className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                      <span className="text-xs text-slate-400">{formatTime(m.receivedAt)}</span>
                    </div>
                  </div>
                  <div className={`truncate ${m.isRead ? 'text-slate-600' : 'font-medium text-slate-800'}`}>
                    {m.subject}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分页（卡片内底部） */}
      <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        {/* 保留现有分页结构，按钮加边框样式 */}
        ...
      </div>
    </div>
  </div>
);
```

- [ ] **更新 import**

```typescript
import { RefreshCw, Paperclip, Mail, ArrowLeft } from 'lucide-react';
```

（删除不再使用的 `User`；保留 `Paperclip`。）

- [ ] **分页器样式微调**

把分页区移入卡片底部（`border-t border-slate-100 px-6 py-4`），上一页/下一页按钮加边框：
```tsx
className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
```

### Step 4: 运行测试

- [ ] **运行 MailListPage 测试**

```bash
cd frontend && npx vitest run src/pages/MailListPage.test.tsx
```

Expected: 全部 PASS。

### Step 5: 提交

- [ ] **提交**

```bash
cd frontend && git add src/pages/MailListPage.tsx src/pages/MailListPage.test.tsx
git commit -m "refactor(frontend): 调整 MailListPage 为白色大卡片容器

- 整页用单个白色大卡片包裹（max-w-5xl）
- 顶部工具栏在卡片内（收取邮件 + 返回），渐变背景
- 列表改为 divide-y，发件人加彩色头像
- 未读邮件 emerald 高亮背景 + 圆点（替换旧的 ring-brand-300 整卡高亮）
- 分页移入卡片底部
- 同步重写未读高亮相关测试，保留 brand-* 命名不动
- 对齐 design-prototype.html section-6"
```

---

## Task I: 全局验证与收尾

**目标：** 全量测试 + 构建 + 人工核对，确认全站视觉重构完成且功能无回归。

### Step 1: 全量测试

- [ ] **运行前端全量测试**

```bash
cd frontend && npm test
```

Expected: 全部 PASS（Header / UserMenu / LoginPage / ProfilePage / AccountsPage / MailListPage 及其余测试）。

**特别确认 `theme.test.ts`（brand 调色板守护）与 `styles.test.ts` 仍 PASS** —— 这是「未误删 brand 别名」的回归信号。若它们失败，说明误改了 `brand-*` 或 `tailwind.config.js`，回退相关改动。

如有失败，逐个修复后再继续。

### Step 2: 构建验证

- [ ] **构建前端**

```bash
cd frontend && npm run build
```

Expected: `tsc -b` 无类型错误，`vite build` 成功输出 `dist/`。

### Step 3: 人工核对（启动 dev server）

- [ ] **启动并逐页对比原型**

```bash
cd frontend && npm run dev
```

访问 http://localhost:5173，逐页对照 `design-prototypes/design-prototype.html`：

- [ ] 登录页：纯按钮式（LinuxDO + 邮箱），点击邮箱按钮显示密码表单，无独立表单残留
- [ ] Header 顶栏：品牌 logo + 副标题 + 用户菜单，sticky 固定
- [ ] UserMenu：富信息下拉（头像 + 用户名 + 邮箱头部，三个菜单项）
- [ ] 个人中心：圆角方形头像，渐变卡片头部
- [ ] 账号列表：白色卡片工具栏（搜索框带图标 + 已选中提示条），白色卡片表格（彩色头像 + 徽章带圆点 + 三点菜单），无 grid/table 切换
- [ ] 邮件列表：白色大卡片，发件人头像，未读 emerald 高亮，顶部工具栏在卡片内

### Step 4: 功能回归核对

- [ ] **确认功能行为不变**

- [ ] 邮箱密码登录可用（经表单）
- [ ] LinuxDO 登录跳转可用
- [ ] 账号搜索、状态筛选、排序、分页可用
- [ ] 单个测活、批量测活、单个删除、批量删除可用
- [ ] 新增账号、批量导入可用
- [ ] 修改显示名、修改密码可用
- [ ] 邮件刷新、分页、进入详情可用

### Step 5: 最终提交

- [ ] **提交收尾（如有遗留改动）**

```bash
cd frontend && git add -A
git commit -m "refactor(frontend): 全站视觉重构完成

- 全量测试通过，构建成功
- 逐页对齐 design-prototype.html
- 所有功能行为保持不变"
```

---

## Plan 3 完成检查点

- [ ] Task F: AccountsPage 工具栏重构完成
- [ ] Task G: AccountsPage 表格重构完成（头像 + 徽章 + 三点菜单）
- [ ] Task H: MailListPage 白色大卡片容器完成
- [ ] Task I: 全局验证通过（测试 + 构建 + 人工核对）

**全站视觉重构完成标准：**
1. Plan 1（基础设施）+ Plan 2（用户页面）+ Plan 3（数据页面）全部完成
2. 前端全量测试通过
3. 构建成功
4. 与原型逐页对比无明显差异
5. 所有功能行为保持不变

---

## 已知偏差与决策

1. **不做 brand → emerald 迁移** — `brand-*` 在 `tailwind.config.js` 中已是 emerald 别名（绿色），`theme.test.ts`、`MailListPage.test.tsx`（`ring-brand-300`）有守护测试。保留现有 `brand-*` 不动；新增元素用 `emerald-*`（同色）。唯一改色处是 AccountsPage 复选框的内联硬编码蓝色 `rgb(59,130,246)`。
2. **保留核心功能** — 导入、状态筛选、排序、分页虽不在原型工具栏，但属现有核心功能，保留并对齐样式
3. **删除 viewMode** — grid/table 视图切换非原型设计，删除以对齐
4. **三点菜单溢出** — 表格容器用 `overflow-visible` 避免裁切 RowMenu 弹层
5. **头像函数重复** — AccountsPage 与 MailListPage 各放一份 `emailToAvatarGradient`，可后续抽共享模块
6. **移动端卡片改用 RowMenu** — AccountsPage 移动端卡片操作区也改用同款三点菜单，与桌面端统一，避免「测活」「删除」可访问名在桌面+移动两套并存导致测试歧义
