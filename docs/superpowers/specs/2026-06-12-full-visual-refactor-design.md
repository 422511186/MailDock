# MailDock 全站视觉重构设计文档

> 创建日期：2026-06-12  
> 状态：待审批  
> 范围：推翻 Task 0-8，按 design-prototype.html 原型完全重做所有页面

## 背景

MailDock 前端功能已完整实现，Task 0-8 完成了主色切换（emerald）和图标统一（lucide-react），但视觉结构与 `design-prototype.html` 原型差距巨大。用户要求**全部推翻重来**，所有页面完全按原型重做。

## 原型对比分析

**design-prototype.html 包含的页面：**
1. **section-1**: 顶栏（Header/Topbar） — 全局导航 + 用户下拉菜单
2. **section-2**: 个人中心（ProfilePage）
3. **section-3**: 登录页（桌面端）
4. **section-4**: 登录页（移动端）
5. **section-5**: 账号列表（AccountsPage 桌面端）
6. **section-6**: 邮件列表（MailListPage 桌面端）
7. **section-7**: 账号列表（移动端）
8. **section-8**: 邮件列表（移动端）
9. **section-9**: SSO 加载动画
10. **section-10**: 分页器组件
11. **section-11**: Toast 通知
12. **section-12/12b/12c/12d**: 模态框（添加/导入/删除）

**当前代码 vs 原型核心差异：**

| 组件 | 当前实现 | 原型设计 | 差异程度 |
|------|---------|---------|---------|
| **LoginPage** | 邮箱密码表单 + OAuth 按钮 | **只有两个大按钮**：LinuxDO OAuth（主） + 邮箱登录（次），无表单 | 🔴 完全不同 |
| **Header/Topbar** | 不存在（无全局导航栏） | 左侧品牌 logo + 副标题，右侧用户菜单，白色背景 + backdrop-blur | 🔴 缺失 |
| **UserMenu** | 简单下拉，头像 + 两个菜单项 | 富信息头部（头像 + 用户名 + 邮箱），三个菜单项（个人中心/邮件列表/退出），emerald 强调色 | 🟡 结构接近但样式差异大 |
| **ProfilePage** | 语义 CSS 类，两张卡片 | 白色卡片 + 渐变表头，卡片标题有图标，头像圆角方形（非圆形） | 🟡 结构接近但样式差异大 |
| **AccountsPage** | 朴素工具栏 + 表格，无容器 | 白色卡片工具栏（搜索 + 按钮），白色卡片表格，邮箱列有彩色头像，状态徽章带圆点，三点菜单 | 🔴 完全不同 |
| **MailListPage** | 简单列表，卡片式布局 | 白色大卡片容器，顶部工具栏（返回 + 刷新 + 账号信息），未读邮件 emerald 高亮，发件人头像 | 🟡 结构接近但缺少容器 |
| **MailDetailPage** | 不在原型中 | 无 | 保持现状 |

## 目标与非目标

**目标**
- **全部推翻 Task 0-8 的视觉改动**，按原型完全重做
- LoginPage 改为纯按钮式（无表单）
- 添加全局 Header/Topbar（当前不存在）
- UserMenu 升级为富信息样式
- ProfilePage 按原型调整卡片样式
- AccountsPage 完全重构（白色卡片 + 头像 + 三点菜单）
- MailListPage 调整为白色卡片容器
- 保持所有现有功能行为不变
- 保持所有测试通过（或调整查询方式）

**非目标**
- 不改变后端、API、数据模型
- 不改变业务逻辑、state 管理
- 不新增功能
- 移动端适配保持现有方案（原型的移动端样式仅供参考）

## 架构决策

采用**完全重写 JSX 结构**策略（方案 B）：
- 参考原型从零重写各页面的 JSX
- 删除 `styles.css` 中的语义类（LoginPage/ProfilePage 相关）
- 全部改用 Tailwind 原子类（对齐 AccountsPage 现有模式）
- 新增 `Header.tsx` 组件（全局顶栏）

**理由：**
1. 差异太大，渐进式重构反而更复杂
2. 删除语义类，统一用 Tailwind 原子类，代码风格一致
3. 重写后的代码更干净，无历史包袱

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `frontend/src/components/Header.tsx` | **新增** | 全局顶栏组件 |
| `frontend/src/components/Header.test.tsx` | **新增** | Header 测试 |
| `frontend/src/components/UserMenu.tsx` | **重写** | 富信息下拉菜单 |
| `frontend/src/components/UserMenu.test.tsx` | **调整** | 适配新结构 |
| `frontend/src/pages/LoginPage.tsx` | **重写** | 纯按钮式登录 |
| `frontend/src/pages/LoginPage.test.tsx` | **调整** | 删除表单测试 |
| `frontend/src/pages/ProfilePage.tsx` | **重写** | 按原型调整样式 |
| `frontend/src/pages/ProfilePage.test.tsx` | **调整** | 适配新结构 |
| `frontend/src/pages/AccountsPage.tsx` | **重写** | 完全重构 |
| `frontend/src/pages/AccountsPage.test.tsx` | **调整** | 适配新结构 |
| `frontend/src/pages/MailListPage.tsx` | **调整** | 添加白色卡片容器 |
| `frontend/src/pages/MailListPage.test.tsx` | **调整** | 适配新结构 |
| `frontend/src/App.tsx` | **调整** | 引入 Header 组件 |
| `frontend/src/styles.css` | **删除部分** | 删除语义类 |

## 分页实施策略

按依赖顺序分 9 个任务（每个任务独立测试、提交）：

1. **Task A: 清理准备工作** — 删除 styles.css 语义类，git revert Task 2-4 的提交
2. **Task B: Header 组件** — 新增全局顶栏
3. **Task C: UserMenu 重构** — 富信息下拉
4. **Task D: LoginPage 重构** — 纯按钮式
5. **Task E: ProfilePage 重构** — 按原型调整
6. **Task F: AccountsPage 重构（工具栏）** — 白色卡片 + 搜索框
7. **Task G: AccountsPage 重构（表格）** — 头像 + 徽章 + 三点菜单
8. **Task H: MailListPage 调整** — 白色卡片容器
9. **Task I: 全局验证** — 测试 + 构建 + 人工核对

---

## Task A: 清理准备工作

**目标：** 删除旧的语义类样式，为全面重构做准备。

**操作步骤：**
1. 从 `styles.css` 删除以下语义类：
   - `.login-page` 相关（h1, .field, .error, .input-with-icon, .oauth-btn 等）
   - `.profile-*` 相关（.profile-card, .profile-form, .profile-note 等）
   - `.user-menu`、`.user-dropdown` 相关
2. 保留全局基础样式（body, .app-main, .btn-primary 等）
3. Git revert 以下提交（这些视觉改动将被完全重做）：
   - `8a97e2f` (Task 2: LoginPage)
   - `ab48771` (Task 3: UserMenu)
   - `79de341` (Task 4: ProfilePage)
4. 运行测试 → 预期大量失败（正常，后续任务会修复）
5. 提交：`refactor(frontend): 清理旧视觉样式，准备全面重构`

---

## Task B: Header 组件（全局顶栏）

**原型参考：** section-1 (107-170 行)

**设计要点：**
```tsx
// frontend/src/components/Header.tsx
export interface HeaderProps {
  user: CurrentUser | null;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function Header({ user, onOpenProfile, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-6 py-3 shadow-sm backdrop-blur-md">
      {/* 左侧品牌 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
          <Mail className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight text-slate-800">MailDock</span>
          <span className="text-xs text-slate-400">邮箱管理中心</span>
        </div>
      </div>

      {/* 右侧用户菜单（仅登录后显示） */}
      {user && (
        <UserMenu user={user} onOpenProfile={onOpenProfile} onLogout={onLogout} />
      )}
    </header>
  );
}
```

**关键样式类：**
- `sticky top-0 z-20` — 固定在顶部
- `bg-white/95 backdrop-blur-md` — 半透明白色 + 背景模糊
- `border-b border-slate-200/80` — 底部边框带透明度
- `shadow-sm` — 轻微阴影
- Logo 方形 `rounded-xl`（非圆形），渐变 `from-emerald-500 to-emerald-600`
- 副标题 `text-xs text-slate-400`

**测试：**
```typescript
// frontend/src/components/Header.test.tsx
it('显示 MailDock 品牌', () => {
  render(<Header user={null} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
  expect(screen.getByText('MailDock')).toBeInTheDocument();
  expect(screen.getByText('邮箱管理中心')).toBeInTheDocument();
});

it('未登录时不显示用户菜单', () => {
  render(<Header user={null} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '用户菜单' })).not.toBeInTheDocument();
});

it('登录后显示用户菜单', () => {
  const user = { id: 1, primaryEmail: 'a@example.com', displayName: 'Alice', avatarUrl: null, hasPassword: true };
  render(<Header user={user} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
  expect(screen.getByRole('button', { name: '用户菜单' })).toBeInTheDocument();
});
```

**App.tsx 集成：**
```tsx
// 在 App.tsx 的 return 最外层包裹
return (
  <div className="min-h-screen bg-slate-50">
    {view !== 'loading' && view !== 'login' && (
      <Header user={currentUser} onOpenProfile={goProfile} onLogout={handleLogout} />
    )}
    <main className="app-main">
      {/* 原有页面渲染 */}
    </main>
  </div>
);
```

**提交：** `feat(frontend): 添加全局 Header 顶栏组件`

---

## Task C: UserMenu 重构（富信息下拉）

**原型参考：** section-1 (133-167 行)

**设计要点：**
```tsx
// frontend/src/components/UserMenu.tsx 完全重写
export function UserMenu({ user, onOpenProfile, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 + Esc 关闭（保持现有逻辑）
  useEffect(() => { /* 同现有代码 */ }, [open]);

  const displayName = user.displayName || user.primaryEmail || 'MailDock 用户';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={rootRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:shadow-sm"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {user.avatarUrl ? (
          <img 
            src={user.avatarUrl} 
            alt="" 
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white" 
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-xs font-semibold text-white">
            {initial}
          </div>
        )}
        <span className="text-sm font-medium text-slate-700">{displayName}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50">
          {/* 富信息头部 */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img 
                  src={user.avatarUrl} 
                  alt="" 
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow-md" 
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-lg font-semibold text-white shadow-md">
                  {initial}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <div className="truncate font-semibold text-slate-800">{displayName}</div>
                {user.primaryEmail && (
                  <div className="truncate text-xs text-slate-500">{user.primaryEmail}</div>
                )}
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="p-2">
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenProfile(); }}
            >
              <UserCircle className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>个人中心</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => { setOpen(false); /* 跳转邮件列表逻辑 */ }}
            >
              <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>邮件列表</span>
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50"
              role="menuitem"
              onClick={() => { setOpen(false); onLogout(); }}
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**关键样式差异（vs 旧版）：**
- 触发按钮：`rounded-xl border px-3 py-2`（非纯头像按钮），显示用户名
- 下拉菜单：`rounded-2xl`（非 lg），`shadow-2xl shadow-slate-300/50`（更强阴影）
- 头部区域：`border-b bg-gradient-to-br from-slate-50 to-white p-4`，大头像 `h-12 w-12`
- 菜单项：`rounded-xl`（非无圆角），`gap-3`（更宽间距），图标 `h-5 w-5`

**测试调整：**
```typescript
// 保留现有测试，微调查询
it('点击按钮展开菜单并显示用户信息', () => {
  render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
  // 富信息头部的用户名（非菜单项）
  const header = screen.getByRole('menu').querySelector('.border-b');
  expect(header).toHaveTextContent('Alice');
  expect(header).toHaveTextContent('alice@example.com');
});

it('菜单包含三个菜单项', () => {
  render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
  expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '邮件列表' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeInTheDocument();
});
```

**提交：** `refactor(frontend): 重构 UserMenu 为富信息下拉样式`

---

## Task D: LoginPage 重构（纯按钮式）

**原型参考：** section-3 (279-330 行)

**核心变化：**
- **删除邮箱/密码表单**（当前实现有表单，原型无）
- 改为两个大按钮：LinuxDO OAuth（主按钮） + 邮箱登录（次按钮）
- "或"分隔线
- 底部"注册"链接（虽然功能未实现，但保留 UI）

**设计要点：**
```tsx
// frontend/src/pages/LoginPage.tsx 完全重写
export interface LoginPageProps {
  onLinuxDoLogin: () => void;
  onEmailLogin: () => void; // 新增：邮箱登录回调（点击后可能跳转到表单页，或弹窗）
}

export function LoginPage({ onLinuxDoLogin, onEmailLogin }: LoginPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      <div className="w-full max-w-md">
        {/* Logo + 站名 */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/40">
            <Mail className="h-8 w-8" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-800">MailDock</span>
        </div>

        {/* 登录卡片 */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-10 shadow-2xl shadow-slate-300/50 backdrop-blur-sm">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-800">登录</h2>

          <div className="space-y-4">
            {/* LinuxDO 登录（主按钮） */}
            <button
              type="button"
              onClick={onLinuxDoLogin}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-6 py-4 text-base font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
            >
              {/* LinuxDO SVG logo（inline） */}
              <svg className="inline-block" width="24" height="24" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <clipPath id="ld1"><circle cx="60" cy="60" r="47"></circle></clipPath>
                <circle fill="#1c1c1e" cx="60" cy="60" r="50"></circle>
                <rect fill="#1c1c1e" clipPath="url(#ld1)" x="10" y="10" width="100" height="30"></rect>
                <rect fill="#f0f0f0" clipPath="url(#ld1)" x="10" y="40" width="100" height="40"></rect>
                <rect fill="#ffb003" clipPath="url(#ld1)" x="10" y="80" width="100" height="30"></rect>
              </svg>
              <span>使用 LinuxDO 继续</span>
            </button>

            {/* 分隔线 */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-base">
                <span className="bg-white px-4 text-slate-500">或</span>
              </div>
            </div>

            {/* 邮箱登录（次按钮，emerald 渐变） */}
            <button
              type="button"
              onClick={onEmailLogin}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:from-emerald-700 hover:to-emerald-800 hover:shadow-xl"
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              <span>使用 邮箱或用户名 登录</span>
            </button>

            {/* 注册链接 */}
            <div className="mt-6 text-center text-sm text-slate-600">
              没有账户？
              <button type="button" className="font-medium text-emerald-600 hover:text-emerald-700">
                注册
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**关键样式：**
- 背景渐变：`bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50`
- Logo 圆形：`rounded-full h-14 w-14`，强阴影 `shadow-xl shadow-emerald-500/40`
- 卡片：`rounded-3xl border-slate-200/80 bg-white/95 backdrop-blur-sm`，超大阴影 `shadow-2xl shadow-slate-300/50`
- 按钮：`rounded-2xl px-6 py-4 text-base`（大尺寸），LinuxDO 白色边框，邮箱 emerald 渐变

**测试调整（删除表单测试）：**
```typescript
// 删除表单相关测试，改为按钮测试
it('显示 LinuxDO 和邮箱登录按钮', () => {
  render(<LoginPage onLinuxDoLogin={vi.fn()} onEmailLogin={vi.fn()} />);
  expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
});

it('点击 LinuxDO 按钮触发回调', () => {
  const onLinuxDoLogin = vi.fn();
  render(<LoginPage onLinuxDoLogin={onLinuxDoLogin} onEmailLogin={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /使用 LinuxDO 继续/ }));
  expect(onLinuxDoLogin).toHaveBeenCalled();
});

it('点击邮箱按钮触发回调', () => {
  const onEmailLogin = vi.fn();
  render(<LoginPage onLinuxDoLogin={vi.fn()} onEmailLogin={onEmailLogin} />);
  fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
  expect(onEmailLogin).toHaveBeenCalled();
});
```

**App.tsx 集成调整：**
```tsx
// 邮箱登录回调：可能弹窗显示表单，或跳转到新页面（功能待定）
function handleEmailLogin() {
  // TODO: 显示邮箱密码表单弹窗，或跳转到 /login/email
  console.log('邮箱登录待实现');
}

<LoginPage 
  onLinuxDoLogin={handleLinuxDoLogin} 
  onEmailLogin={handleEmailLogin} 
/>
```

**提交：** `refactor(frontend): 重构 LoginPage 为纯按钮式登录`

---

## Task E: ProfilePage 重构（按原型调整样式）

**原型参考：** section-2 (173-277 行)

**核心变化：**
- 卡片容器用 `rounded-2xl border bg-white shadow-sm`
- 卡片头部用 `border-b bg-gradient-to-br from-slate-50 to-white px-6 py-4`
- 头像改为 `rounded-2xl`（非圆形），`shadow-lg ring-2 ring-slate-100`
- 只读信息用 grid 布局（`grid-cols-[auto_1fr]`）
- 按钮用原子类（非语义类 `.btn-primary`）

**设计要点：**
```tsx
// 资料卡片
<section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
      <User className="h-5 w-5 text-emerald-600" aria-hidden="true" />
      资料与头像
    </h2>
  </div>
  <div className="p-6">
    <div className="flex flex-col gap-6">
      {/* 头像与只读信息 */}
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        {user.avatarUrl ? (
          <img 
            src={user.avatarUrl} 
            alt="" 
            className="h-20 w-20 rounded-2xl object-cover shadow-lg ring-2 ring-slate-100" 
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 text-2xl font-semibold text-white shadow-lg ring-2 ring-slate-100">
            {initial(user)}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="flex items-center gap-1 font-medium text-slate-500">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              邮箱
            </dt>
            <dd className="text-slate-700">{user.primaryEmail ?? '—'}</dd>
            <dt className="font-medium text-slate-500">登录方式</dt>
            <dd className="text-slate-700">{user.hasPassword ? '邮箱密码' : 'linux.do'}</dd>
          </dl>
        </div>
      </div>

      {/* 编辑表单 */}
      <form onSubmit={handleProfileSubmit} className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">编辑个人资料</h3>
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-slate-700">
            <User className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
            显示名
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            maxLength={64}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        {profileErr && <p className="text-sm text-red-600" role="alert">{profileErr}</p>}
        {profileMsg && <p className="text-sm text-emerald-600">{profileMsg}</p>}
        <button
          type="submit"
          disabled={savingProfile}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          更新资料
        </button>
      </form>
    </div>
  </div>
</section>

{/* 修改密码卡片（类似结构） */}
<section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
      <Lock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
      修改密码
    </h2>
  </div>
  <div className="p-6">
    {!user.hasPassword && (
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-blue-50 border-l-4 border-blue-500 p-4 text-sm text-slate-700">
        <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
        <p>当前账号通过 linux.do 登录，未设置密码</p>
      </div>
    )}
    <form onSubmit={handlePasswordSubmit} className="space-y-4">
      {/* 密码输入框 */}
    </form>
  </div>
</section>
```

**关键样式变化：**
- 卡片头部：`border-b bg-gradient-to-br from-slate-50 to-white`
- 头像：`rounded-2xl`（非圆形）、`h-20 w-20`、`shadow-lg ring-2 ring-slate-100`
- 按钮：emerald 渐变 + 阴影（`shadow-lg shadow-emerald-500/30`）

**测试调整（保持现有逻辑）：**
```typescript
// 现有测试基本不变，微调查询
it('头像为圆角方形', () => {
  const api = stubApi();
  render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);
  const avatar = document.querySelector('.rounded-2xl.shadow-lg');
  expect(avatar).toBeInTheDocument();
});
```

**提交：** `refactor(frontend): 重构 ProfilePage 对齐原型样式`

---

## Task F: AccountsPage 重构（工具栏部分）

**原型参考：** section-5 (393-445 行)

**本任务范围：** 仅重构工具栏（搜索框 + 按钮组 + 已选中提示条），表格留到 Task G。

**设计要点：**
```tsx
{/* 白色卡片工具栏 */}
<div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex flex-wrap items-center gap-3">
    {/* 搜索框（带 Search 图标） */}
    <div className="relative flex-1 min-w-[240px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="text"
        placeholder="搜索邮箱地址..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </div>

    {/* 批量操作按钮 */}
    <div className="flex gap-2">
      <button
        disabled={selectedIds.length === 0}
        onClick={handleBatchTest}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">批量测活</span>
      </button>
      <button
        disabled={selectedIds.length === 0}
        onClick={handleBatchDelete}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">批量删除</span>
      </button>
      <button
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
        onClick={() => setSelectedIds([])}
        className="text-emerald-600 transition hover:text-emerald-700"
      >
        取消选择
      </button>
    </div>
  )}
</div>
```

**关键样式：**
- 工具栏容器：`rounded-2xl border bg-white p-4 shadow-sm`
- 搜索框：左侧图标绝对定位 `absolute left-3`，输入框 `pl-10`
- 批量测活：灰色边框 + 白色背景
- 批量删除：rose 色系（`border-rose-200 bg-rose-50 text-rose-600`）
- 添加账号：emerald 渐变 + 阴影
- 已选中提示条：`bg-emerald-50`，条件渲染

**注意事项：**
- 保留导入按钮（原型无但属核心功能）
- 保留状态筛选（原型无但属核心功能），样式对齐工具栏
- 删除视图切换（grid/table）

**测试：**
```typescript
it('工具栏在白色卡片容器内', () => {
  render(<AccountsPage ... />);
  const toolbar = screen.getByPlaceholderText('搜索邮箱地址...').closest('.rounded-2xl');
  expect(toolbar).toHaveClass('bg-white', 'border-slate-200');
});

it('已选中时显示提示条', async () => {
  render(<AccountsPage ... />);
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[1]);
  expect(screen.getByText(/已选中 1 个账号/)).toBeInTheDocument();
});
```

**提交：** `refactor(frontend): 重构 AccountsPage 工具栏（白色卡片）`

---

## Task G: AccountsPage 重构（表格部分）

**原型参考：** section-5 (448-556 行)

**本任务范围：** 重构表格（白色卡片容器 + 邮箱列头像 + 状态徽章 + 三点菜单）。

**设计要点（参考之前 Task A-AccountsPage 的设计）：**
- 表格容器：`rounded-2xl border bg-white shadow-sm`
- 表头：`bg-gradient-to-br from-slate-50 to-white`
- 邮箱列：彩色圆形头像 + 邮箱地址
- 状态徽章：带圆点（`h-1.5 w-1.5`）
- 操作列：RowMenu 三点菜单组件

**emailToAvatarGradient 函数（同之前设计）：**
```typescript
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

**renderStatusBadge 函数（带圆点）：**
```typescript
function renderStatusBadge(account: Account) {
  const status = statusOf(account);
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

**RowMenu 组件（三点菜单，同之前设计）。**

**测试：**
```typescript
it('表格在白色卡片容器内', async () => {
  render(<AccountsPage ... />);
  await screen.findByText('alice@163.com');
  const table = screen.getByRole('table');
  expect(table.parentElement).toHaveClass('rounded-2xl', 'bg-white');
});

it('邮箱列有彩色头像圆形', async () => {
  render(<AccountsPage ... />);
  await screen.findByText('alice@163.com');
  const row = screen.getByText('alice@163.com').closest('tr');
  const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
  expect(avatar).toBeInTheDocument();
  expect(avatar).toHaveTextContent('A');
});

it('状态徽章带圆点', async () => {
  render(<AccountsPage ... />);
  await screen.findByText('正常');
  const badge = screen.getByText('正常').closest('span');
  const dot = badge?.querySelector('.h-1\\.5.w-1\\.5.rounded-full');
  expect(dot).toBeInTheDocument();
});
```

**提交：** `refactor(frontend): 重构 AccountsPage 表格（头像+徽章+三点菜单）`

---

## Task H: MailListPage 调整（白色卡片容器）

**原型参考：** section-6 (560-629 行)

**核心变化：**
- 整个页面用一个大白色卡片包裹（`rounded-2xl border bg-white shadow-sm`）
- 顶部工具栏在卡片内（`border-b bg-gradient-to-br from-slate-50 to-white px-6 py-4`）
- 列表在卡片内（`divide-y divide-slate-50`）
- 未读邮件背景 `bg-emerald-50/30 hover:bg-emerald-50/50`
- 发件人头像圆形（彩色渐变）

**设计要点：**
```tsx
<div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  {/* 顶部工具栏 */}
  <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
        <Mail className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        {account.email}
      </h2>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleRefresh()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          收取邮件
        </button>
        <button
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
    {messages.map(m => (
      <div
        key={m.id}
        onClick={() => handleClickMessage(m)}
        className={`group cursor-pointer p-4 transition ${
          m.isRead ? 'hover:bg-slate-50' : 'bg-emerald-50/30 hover:bg-emerald-50/50'
        }`}
      >
        <div className="flex items-start gap-4">
          {/* 发件人头像 */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(m.fromAddr)} text-sm font-semibold text-white shadow-md`}>
            {m.fromAddr.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!m.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500"></span>}
                <span className={m.isRead ? 'text-slate-600' : 'font-semibold text-slate-800'}>
                  {m.fromAddr}
                </span>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatTime(m.receivedAt)}</span>
            </div>
            <div className={`mb-1 ${m.isRead ? 'text-slate-600' : 'font-medium text-slate-800'}`}>
              {m.subject}
            </div>
            <div className="truncate text-sm text-slate-400">
              {m.preview || '（无预览）'}
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
```

**关键样式：**
- 大卡片容器：`max-w-5xl rounded-2xl border bg-white shadow-sm`
- 顶部工具栏：`border-b bg-gradient-to-br from-slate-50 to-white`
- 发件人头像：彩色圆形（用 emailToAvatarGradient）
- 未读圆点：`h-2 w-2 rounded-full bg-emerald-500`

**测试：**
```typescript
it('页面在白色卡片容器内', () => {
  render(<MailListPage ... />);
  const container = screen.getByRole('heading', { name: /alice@163.com/ }).closest('.rounded-2xl');
  expect(container).toHaveClass('bg-white', 'border-slate-200');
});

it('未读邮件有 emerald 背景', async () => {
  render(<MailListPage ... />);
  await screen.findByText('未读邮件');
  const card = screen.getByText('未读邮件').closest('div.bg-emerald-50\\/30');
  expect(card).toBeInTheDocument();
});
```

**提交：** `refactor(frontend): 调整 MailListPage 为白色卡片容器`

---

## Task I: 全局验证与收尾

**操作步骤：**
1. 全量测试 → 全部 PASS
2. 构建 → 成功
3. 启动 dev server，人工核对：
   - 登录页：纯按钮式，无表单
   - Header 顶栏：品牌 logo + 用户菜单
   - UserMenu：富信息下拉
   - 个人中心：圆角方形头像，渐变卡片头部
   - 账号列表：白色卡片工具栏 + 表格，彩色头像，状态徽章带圆点，三点菜单
   - 邮件列表：白色大卡片，发件人头像，未读 emerald 高亮
4. 与原型 `design-prototype.html` 逐页对比截图
5. 提交：`refactor(frontend): 全站视觉重构完成`

---

## 测试策略总结

遵循强制 TDD：
- 每个任务先写/调整测试 → 确认失败（或通过基线） → 实现改动 → 测试通过
- 视觉改动重点测试：容器类名、图标存在性、条件渲染
- 功能行为测试保持不变（搜索、批量操作、分页等）

**全局测试覆盖：**
- Header.test.tsx（新增）
- UserMenu.test.tsx（调整）
- LoginPage.test.tsx（重写）
- ProfilePage.test.tsx（调整）
- AccountsPage.test.tsx（重写）
- MailListPage.test.tsx（调整）

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 全部推翻工作量巨大 | 高 | 分 9 个独立任务，每个测试+提交 |
| LoginPage 改为纯按钮，邮箱密码登录功能丢失 | 中 | 保留回调钩子 `onEmailLogin`，后续可弹窗实现 |
| 测试大量调整可能遗漏 | 中 | 每个任务跑全量测试确认无回归 |
| 与原型差异的主观判断 | 低 | 按原型 HTML 精确复现样式类 |

---

## 实施检查点

每个任务完成标准：
1. 视觉对齐原型对应 section
2. 所有测试通过（新增 + 调整后的现有）
3. 构建成功
4. Git commit（格式：`refactor(frontend): <任务描述>`）

全局完成标准：
1. 所有 9 个任务完成
2. 全量测试通过
3. 与原型逐页对比无明显差异
4. 所有功能行为保持不变

---

## 已知偏差与决策

1. **LoginPage 邮箱密码登录改为按钮** — 原型无表单，改为点击后可能弹窗/跳转（功能待实现）
2. **AccountsPage 保留导入 + 状态筛选** — 原型无但属核心功能
3. **移动端适配** — 原型有移动端设计，但暂时保持现有响应式方案
4. **MailDetailPage 保持现状** — 原型无对应设计

---

## 后续工作（本次不做）

- 邮箱密码登录表单弹窗/页面
- 移动端原型精确复现（section-7/8）
- SSO 加载动画（section-9）
- Toast 通知组件升级（section-11）
- 分页器组件升级（section-10）
