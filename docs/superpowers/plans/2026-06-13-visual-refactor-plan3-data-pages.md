# 全站视觉重构 Plan 3: 数据管理页面重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按原型重构 AccountsPage（工具栏 + 表格）与 MailListPage（白色大卡片容器），并完成全局验证

**Architecture:** AccountsPage 改用白色卡片工具栏（搜索框带图标 + 按钮组 + 已选中提示条）、白色卡片表格（彩色头像 + 状态徽章带圆点 + 三点菜单），删除 grid/table 视图切换；MailListPage 改用单一白色大卡片容器（顶部工具栏 + divide-y 列表 + 发件人头像）

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react + vitest

**关联文档：** `docs/superpowers/specs/2026-06-12-full-visual-refactor-design.md` (Task F-I)

---

## 前置说明（执行前必读）

**1. 品牌色统一为 emerald**
当前 `AccountsPage.tsx` 与 `MailListPage.tsx` 仍大量使用 Tailwind 自定义色 `brand-*`（如 `bg-brand-500`、`ring-brand-300`、`text-brand-600`、`focus:ring-brand-500`、`bg-brand-50`、`text-brand-700`）。本计划要求全部替换为 `emerald-*` 对应色阶，与 Plan 1/2 已切换的主色保持一致。

**2. 保留核心功能**
原型未画出但属现有核心功能，**必须保留**：
- 导入账号（ImportModal）
- 状态筛选下拉（全部/待检测/正常/异常）
- 排序下拉（最近收信/最早收信/最近测活/最早测活）
- 分页器（含每页条数选择）
- 表头复选框全选、单行复选框

**3. 删除项**
- AccountsPage 的 `viewMode` grid/table 视图切换（含 `viewMode` state、切换按钮组、grid 分支整段渲染）
- 移动端单独卡片渲染分支可保留（响应式），但桌面表格为主改造对象

**4. 三点菜单（RowMenu）交互**
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

- [ ] **修改 `AccountsPage.test.tsx` 工具栏相关测试**

新增/调整以下测试（保留现有功能测试如搜索、批量操作、分页）：

```typescript
it('工具栏在白色卡片容器内', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const search = await screen.findByPlaceholderText('搜索邮箱地址...');
  const toolbar = search.closest('.rounded-2xl');
  expect(toolbar).toHaveClass('bg-white');
});

it('搜索框带 Search 图标', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const search = await screen.findByPlaceholderText('搜索邮箱地址...');
  // 输入框带左内边距给图标留位
  expect(search).toHaveClass('pl-10');
});

it('已选中时显示提示条与取消选择', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const checkboxes = await screen.findAllByRole('checkbox');
  // 第 0 个是全选，第 1 个是首行
  fireEvent.click(checkboxes[1]);
  expect(screen.getByText(/已选中 1 个账号/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
  expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();
});

it('不再渲染视图切换按钮', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  await screen.findByPlaceholderText('搜索邮箱地址...');
  // grid/table 切换已删除：通过其独有 aria 或结构断言不存在
  // （如旧切换按钮无 label，可断言 viewMode 相关 DOM 不存在）
});
```

**注意：** 现有 test 文件中若有断言 `placeholder="搜索邮箱..."`（旧文案）的测试，统一改为 `搜索邮箱地址...`。若有 viewMode 切换的测试，删除。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 新增的工具栏测试 FAIL（容器类名、placeholder、提示条尚不匹配）。

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
- 主色 brand 统一为 emerald
- 对齐 design-prototype.html section-5"
```

---

## Task G: AccountsPage 重构（表格部分）

**原型参考：** `design-prototypes/design-prototype.html` section-5 (448-556 行)

**目标：** 表格容器白色卡片 + 表头渐变 + 邮箱列彩色头像 + 状态徽章带圆点 + 操作列三点菜单（RowMenu）。

### Step 1: 调整测试（TDD）

- [ ] **修改 `AccountsPage.test.tsx` 表格相关测试**

```typescript
it('表格在白色卡片容器内', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('alice@163.com');
  const table = screen.getByRole('table');
  expect(table.closest('.rounded-2xl')).toHaveClass('bg-white');
});

it('邮箱列有彩色头像', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('alice@163.com');
  const row = screen.getByText('alice@163.com').closest('tr');
  const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
  expect(avatar).toBeInTheDocument();
  expect(avatar).toHaveTextContent('A');
});

it('状态徽章带圆点', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  const badge = (await screen.findByText('正常')).closest('span');
  const dot = badge?.querySelector('span.rounded-full');
  expect(dot).toBeInTheDocument();
});

it('操作列三点菜单展开测活与删除', async () => {
  render(<AccountsPage api={stubApi() as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('alice@163.com');
  const menuButtons = screen.getAllByRole('button', { name: '更多操作' });
  fireEvent.click(menuButtons[0]);
  expect(screen.getByRole('menuitem', { name: /测活/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /删除/ })).toBeInTheDocument();
});
```

**注意：** 若现有测试通过「测活」「删除」按钮文本直接查询，需改为先点开三点菜单再查 menuitem。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/AccountsPage.test.tsx
```

Expected: 表格相关测试 FAIL。

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

- [ ] **复选框改为 emerald 配色**

表头与行内复选框 `style` 中蓝色 `rgb(59, 130, 246)` 改为 emerald `rgb(16, 185, 129)`，hover 边框 `rgb(96, 165, 250)` 改为 `rgb(52, 211, 153)`。

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

- [ ] **修改 `MailListPage.test.tsx`**

```typescript
it('列表在白色大卡片容器内', async () => {
  render(<MailListPage api={stubApi() as never} accountId={1} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  const heading = await screen.findByRole('heading', { name: /收件箱|收取邮件/ });
  const container = heading.closest('.rounded-2xl');
  expect(container).toHaveClass('bg-white');
});

it('发件人有头像', async () => {
  render(<MailListPage api={stubApi() as never} accountId={1} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  const subject = await screen.findByText('测试邮件');
  const row = subject.closest('.cursor-pointer');
  const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
  expect(avatar).toBeInTheDocument();
});

it('未读邮件有 emerald 高亮背景', async () => {
  render(<MailListPage api={stubApi() as never} accountId={1} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
  // stubApi 需提供一条 isRead=false 的邮件
  const subject = await screen.findByText('未读邮件');
  const row = subject.closest('[class*="bg-emerald-50"]');
  expect(row).toBeInTheDocument();
});
```

**注意：** 确认 `MailListPage.test.tsx` 的 stubApi mock 数据里有已读 + 未读各一条，主题分别为「测试邮件」「未读邮件」（若现有 mock 数据主题不同，按现有数据调整断言文本）。

- [ ] **运行测试确认失败**

```bash
cd frontend && npx vitest run src/pages/MailListPage.test.tsx
```

Expected: 容器/头像/高亮测试 FAIL。

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
- 未读邮件 emerald 高亮背景 + 圆点
- 分页移入卡片底部
- 主色 brand 统一为 emerald
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

1. **brand → emerald 色彩迁移** — Plan 1 已切主色，但 AccountsPage/MailListPage 内仍残留 `brand-*`，本计划顺带统一为 `emerald-*`
2. **保留核心功能** — 导入、状态筛选、排序、分页虽不在原型工具栏，但属现有核心功能，保留并对齐样式
3. **删除 viewMode** — grid/table 视图切换非原型设计，删除以对齐
4. **三点菜单溢出** — 表格容器用 `overflow-visible` 避免裁切 RowMenu 弹层
5. **头像函数重复** — AccountsPage 与 MailListPage 各放一份 `emailToAvatarGradient`，可后续抽共享模块
6. **移动端卡片** — AccountsPage 移动端卡片渲染保留（响应式），主要改造桌面表格
