# AccountsPage 视觉重构设计文档

> 创建日期：2026-06-12  
> 状态：已批准  
> 范围：纯视觉重构，保持所有现有功能不变

## 背景

AccountsPage 功能已完整实现（搜索、筛选、批量操作、排序、分页、测活、删除、导入），主色已切换为 emerald，图标已统一为 lucide-react。但视觉结构与 `design-prototype.html` section-5 原型差距较大。本次工作是按原型完整重构视觉，不改变任何功能行为。

## 目标与非目标

**目标**
- 工具栏放入白色卡片容器，添加已选中提示条
- 搜索框添加 Search 图标（左侧绝对定位）
- 保留状态筛选功能，设计为小型 chip 组
- 按钮样式升级（渐变 + 阴影）
- 表格放入白色卡片容器，表头用渐变背景
- 邮箱列添加彩色圆形头像（根据邮箱哈希生成颜色）
- 状态徽章添加圆点指示器
- 操作列改为三点菜单（测活、查看邮件、删除）
- 移除视图切换功能（grid/table），只保留表格视图
- 保持所有现有功能行为完全不变
- 保持所有测试通过（或仅微调查询方式）

**非目标**
- 不改变后端、API、数据模型
- 不改变业务逻辑、state 管理、事件处理函数
- 不改变模态框（新增/导入/删除确认）的实现
- 不新增功能

## 架构与改动范围

采用**渐进式重构**策略：保持现有 JSX 结构，逐步替换样式类和添加新元素（卡片容器、头像、下拉菜单）。

**改动文件**
- `frontend/src/pages/AccountsPage.tsx` — 主要改动
- `frontend/src/pages/AccountsPage.test.tsx` — 补充视觉不变量测试

**保持不变**
- 所有 state 管理（`accounts`、`selectedIds`、`searchInput`、`status`、`sortBy` 等）
- 所有事件处理函数（`handleSearch`、`handleTest`、`handleDelete`、`reload` 等）
- 所有 API 调用逻辑
- 模态框组件（新增/导入/删除确认）

**新增内容**
1. **工具栏白色卡片容器** — 包裹搜索框、按钮、状态筛选、已选中提示条
2. **表格白色卡片容器** — 包裹整个 `<table>`
3. **`emailToAvatarGradient(email)` 函数** — 根据邮箱地址哈希生成 6 种渐变色之一
4. **`renderStatusBadge(account)` 函数** — 返回带圆点的状态徽章 JSX
5. **`RowMenu` 组件** — 每行的三点菜单下拉（测活、查看邮件、删除）

## 设计细节

### 1. 工具栏白色卡片容器

**容器样式**
```tsx
<div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
```

**第一行布局**
```tsx
<div className="flex flex-wrap items-center gap-3">
  {/* 搜索框 */}
  <div className="relative flex-1 min-w-[240px]">
    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    <input 
      type="text"
      placeholder="搜索邮箱地址..."
      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
    />
  </div>
  
  {/* 状态筛选 chip 组 */}
  <div className="flex gap-2">
    <button 
      onClick={() => handleStatusChange('')}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        status === '' 
          ? 'bg-emerald-50 border border-emerald-500 text-emerald-700' 
          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
      }`}
    >
      全部状态
    </button>
    {/* 待检测、正常、异常类似 */}
  </div>
  
  {/* 批量操作按钮 */}
  <div className="flex gap-2">
    <button 
      disabled={selectedIds.length === 0}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CheckCircle className="h-4 w-4" aria-hidden="true" />
      批量测活
    </button>
    <button 
      disabled={selectedIds.length === 0}
      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      批量删除
    </button>
    <button 
      onClick={() => setShowImport(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
    >
      <Upload className="h-4 w-4" aria-hidden="true" />
      导入
    </button>
    <button 
      onClick={() => setShowAdd(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      添加账号
    </button>
  </div>
</div>
```

**第二行：已选中提示条**（条件渲染）
```tsx
{selectedIds.length > 0 && (
  <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm">
    <div className="flex items-center gap-2">
      <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden="true" />
      <span className="font-medium text-emerald-800">已选中 {selectedIds.length} 个账号</span>
    </div>
    <button 
      onClick={() => setSelectedIds([])}
      className="text-emerald-600 transition hover:text-emerald-700"
    >
      取消选择
    </button>
  </div>
)}
```

**关键点**
- 搜索框 Search 图标绝对定位在 `left-3`，输入框 `pl-10` 留出空间
- 状态筛选用小型 chip，未选中灰色边框，选中 emerald 背景
- 批量操作按钮根据 `selectedIds.length` 控制 `disabled`
- 添加/导入用渐变 + emerald 阴影（`shadow-lg shadow-emerald-500/30`）
- 已选中提示条在 `selectedIds.length > 0` 时显示

### 2. 表格白色卡片容器与表头

**容器**
```tsx
<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <table className="w-full text-sm">
```

**表头**
```tsx
<thead>
  <tr className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
    <th className="px-4 py-3 text-center">
      <input 
        type="checkbox" 
        checked={allSelected} 
        onChange={toggleSelectAll}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-2 focus:ring-emerald-100"
        aria-label="全选"
      />
    </th>
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      邮箱地址
    </th>
    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
      状态
    </th>
    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
      最近测活
    </th>
    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
      最近收信
    </th>
    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
      操作
    </th>
  </tr>
</thead>
```

**关键点**
- 表格容器用 `rounded-2xl border bg-white shadow-sm` 白色卡片
- 表头用渐变背景 `bg-gradient-to-br from-slate-50 to-white`
- 列标题用 `text-xs font-semibold uppercase tracking-wide text-slate-500`
- 全选复选框 `text-emerald-600`

### 3. 邮箱列头像与颜色哈希

**颜色哈希函数**
```typescript
// 预设 6 种渐变色
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

**邮箱列渲染**
```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-3">
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(account.email)} text-sm font-semibold text-white shadow-md`}>
      {account.email.charAt(0).toUpperCase()}
    </div>
    <span className="font-medium text-slate-800">{account.email}</span>
  </div>
</td>
```

**关键点**
- 头像圆形 `h-10 w-10 rounded-full`，渐变背景 + `shadow-md`
- 根据邮箱哈希选择 6 种渐变色之一（稳定、可重现）
- 首字母大写居中显示

### 4. 状态徽章带圆点

**渲染函数**
```typescript
function renderStatusBadge(account: Account) {
  const status = statusOf(account); // 现有函数
  
  let dotColor = 'bg-slate-500';
  let badgeClass = 'bg-slate-100 text-slate-700';
  
  if (status.label === '正常') {
    dotColor = 'bg-emerald-500';
    badgeClass = 'bg-emerald-100 text-emerald-700';
  } else if (status.label === '待检测') {
    dotColor = 'bg-amber-500';
    badgeClass = 'bg-amber-100 text-amber-700';
  } else if (status.label === '异常') {
    dotColor = 'bg-rose-500';
    badgeClass = 'bg-rose-100 text-rose-700';
  }
  
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`}></span>
      {status.label}
    </span>
  );
}
```

**状态列渲染**
```tsx
<td className="px-4 py-3 text-center">
  {renderStatusBadge(account)}
</td>
```

**关键点**
- 徽章 `rounded-full px-2.5 py-1`，用 `inline-flex items-center gap-1` 对齐圆点
- 圆点 `h-1.5 w-1.5 rounded-full`
- 正常=emerald、待检测=amber、异常=rose

### 5. 表格行样式与复选框

**行渲染**
```tsx
<tr 
  className={`cursor-pointer border-b border-slate-50 transition ${
    selectedIds.includes(account.id) 
      ? 'bg-emerald-50/50 hover:bg-emerald-50' 
      : 'hover:bg-emerald-50/50'
  }`}
  onClick={() => onOpenAccount(account.id)}
>
  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
    <input 
      type="checkbox"
      checked={selectedIds.includes(account.id)}
      onChange={() => toggleSelect(account.id)}
      className={`h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-emerald-100 ${
        selectedIds.includes(account.id) ? 'text-emerald-600' : 'text-blue-600'
      }`}
      aria-label={`选择 ${account.email}`}
    />
  </td>
  {/* 其他列 */}
</tr>
```

**关键点**
- 选中行背景 `bg-emerald-50/50 hover:bg-emerald-50`
- 未选中行 `hover:bg-emerald-50/50`
- 复选框：已选中用 `text-emerald-600`，未选中用 `text-blue-600`（设计文档特例）
- 复选框列 `stopPropagation` 防止触发行点击

### 6. 三点菜单组件（RowMenu）

**组件定义**
```typescript
interface RowMenuProps {
  account: Account;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenAccount: (id: number) => void;
}

function RowMenu({ account, onTest, onDelete, onOpenAccount }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);
  
  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-slate-400 transition hover:text-slate-600"
        aria-label={`操作菜单 ${account.email}`}
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            onClick={(e) => { e.stopPropagation(); onTest(account.id); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            测活
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenAccount(account.id); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            查看邮件
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(account.id); setOpen(false); }}
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

**操作列渲染**
```tsx
<td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
  <RowMenu 
    account={account} 
    onTest={handleTest} 
    onDelete={handleDelete} 
    onOpenAccount={onOpenAccount} 
  />
</td>
```

**关键点**
- MoreVertical 图标触发下拉
- 下拉菜单 `absolute right-0 top-full z-10` 定位
- 三个菜单项：测活（RefreshCw）、查看邮件（Mail）、删除（Trash2，红色）
- 点击菜单项后关闭下拉
- 点击外部自动关闭（useEffect + addEventListener）
- 所有点击事件 `stopPropagation` 防止触发行点击

### 7. 移除视图切换

删除以下代码块：
- `viewMode` state
- 视图切换按钮组（列表/网格图标按钮）
- 网格视图的渲染分支

保留表格视图即可。

## 测试策略

遵循强制 TDD 约束：先写测试锁定视觉结构，再改代码让测试通过。

### 新增视觉不变量测试

在 `AccountsPage.test.tsx` 追加：

```typescript
it('工具栏在白色卡片容器内', () => {
  const api = stubApi();
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  const searchInput = screen.getByPlaceholderText('搜索邮箱地址...');
  const toolbar = searchInput.closest('div.rounded-2xl');
  expect(toolbar).toHaveClass('bg-white', 'border-slate-200', 'shadow-sm');
});

it('表格在白色卡片容器内', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('a@163.com');
  const table = screen.getByRole('table');
  const container = table.parentElement;
  expect(container).toHaveClass('rounded-2xl', 'bg-white', 'shadow-sm');
});

it('邮箱列每行有头像圆形', async () => {
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
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com', lastTestAt: Date.now(), lastTestOk: true })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('正常');
  const badge = screen.getByText('正常').closest('span');
  const dot = badge?.querySelector('.h-1\\.5.w-1\\.5.rounded-full');
  expect(dot).toBeInTheDocument();
});

it('已选中时显示提示条', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[1]); // 选中第一个账号（checkboxes[0] 是全选）
  expect(screen.getByText(/已选中 1 个账号/)).toBeInTheDocument();
});

it('三点菜单包含测活、查看邮件、删除', async () => {
  const api = stubApi({
    listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
  });
  render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
  await screen.findByText('a@163.com');
  const menuButton = screen.getByLabelText(/操作菜单 a@163.com/);
  fireEvent.click(menuButton);
  expect(screen.getByText('测活')).toBeInTheDocument();
  expect(screen.getByText('查看邮件')).toBeInTheDocument();
  expect(screen.getByText('删除')).toBeInTheDocument();
});
```

### 调整现有测试

部分现有测试可能需要微调：

1. **搜索测试** — placeholder 从 `搜索邮箱...` 改为 `搜索邮箱地址...`
2. **删除测试** — 删除操作改为：先点三点菜单，再点"删除"菜单项
3. **按钮查询** — 批量操作按钮文本可能需要调整（如"批量测活"而非"测活全部"）

### TDD 步骤

1. **Step 1**: 写上述 6 个视觉不变量测试 → 全部 FAIL
2. **Step 2**: 添加工具栏白色卡片容器 + Search 图标 → 第 1 个测试 PASS
3. **Step 3**: 添加表格白色卡片容器 + 渐变表头 → 第 2 个测试 PASS
4. **Step 4**: 添加邮箱列头像（emailToAvatarGradient 函数）→ 第 3 个测试 PASS
5. **Step 5**: 添加状态徽章圆点（renderStatusBadge 函数）→ 第 4 个测试 PASS
6. **Step 6**: 添加已选中提示条（条件渲染）→ 第 5 个测试 PASS
7. **Step 7**: 实现 RowMenu 组件 → 第 6 个测试 PASS
8. **Step 8**: 调整现有测试（删除操作改为通过三点菜单）
9. **Step 9**: 移除视图切换相关代码（viewMode state、按钮组、网格渲染）
10. **Step 10**: 全量测试 → 全部 PASS
11. **Step 11**: 构建验证 → 成功
12. **Step 12**: 提交

## 实施检查点

完成标准：
1. 视觉完全对齐 design-prototype.html section-5 原型
2. 所有测试通过（新增 6 个 + 现有 17 个调整后）
3. 构建成功
4. 所有功能行为保持不变（搜索、筛选、批量操作、排序、分页、测活、删除、导入）
5. Git commit 格式：`refactor(frontend): 完整重构 AccountsPage 视觉（对齐原型）`

## 已知偏差

无。本次按原型完整重构，移除了网格视图（原型未展示），保留了状态筛选和导入功能（原型未展示但属核心功能）。
