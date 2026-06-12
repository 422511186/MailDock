# MailDock 前端 UI 视觉升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 MailDock 前端的主色从蓝色统一为 emerald 绿色，引入 lucide-react 图标库与轻量动画，并把仍用旧语义 CSS 类的页面（LoginPage / UserMenu / ProfilePage）升级为现代视觉风格，全程不改变任何功能行为。

**Architecture:** 采用组件级渐进升级。核心换色通过**重定义 `tailwind.config.js` 的 `brand` 调色板为 emerald 色值**实现——全 app 已有的 `brand-*` 类（约 40+ 处）自动变绿，JSX 零改动、测试零破坏。随后逐个组件做视觉精修：引入图标、调整间距圆角阴影、补齐动画。每个组件独立测试、独立提交。

**Tech Stack:** React 18 + TypeScript + Vite 6、Tailwind CSS 3.4.19、lucide-react（新增）、vitest + @testing-library/react。

---

## 背景与现状（执行前必读）

本仓库现状与一般"从零做 UI"不同，**务必先理解清楚再动手**：

1. **两套样式并存**：
   - `frontend/src/styles.css` 用 `@layer components` + `@apply` 把旧语义类名（`.login-page`、`.user-menu`、`.profile-card`、`.btn-primary`、`.error`、`.toast` 等）映射为现代样式。
   - `LoginPage.tsx` / `UserMenu.tsx` / `ProfilePage.tsx` 的 JSX **几乎只用这些语义类**，本身不含 Tailwind 原子类。
   - `AccountsPage.tsx` / `MailListPage.tsx` / `MailDetailPage.tsx` **已大量直接用 Tailwind 原子类**，并深度依赖 `brand-*` 色（`bg-brand-500`、`ring-brand-300`、`text-brand-600` 等）。

2. **主色冲突**：`tailwind.config.js` 里 `brand` 当前是**蓝色系**（`brand-500 = #3b82f6`）。设计目标是 emerald 绿。**已确认采用"重定义 brand 调色板"策略**，不改 JSX 里的 `brand-*` 类名。

3. **测试是硬约束**（视觉改动绝不能破坏这些查询）：
   - `MailListPage.test.tsx` 断言未读卡片 `className` 含 `ring-brand-300`（第 139-143 行）→ **不可删除该类名**。
   - 各页面测试依赖 `getByRole('button', { name })`、`getByLabelText`、`getByPlaceholderText`、`role="checkbox"` + `aria-label`、`role="alert"`、`role="menu"`、`role="menuitem"` 等结构/语义查询。
   - `AccountsPage` 删除按钮的可访问名是 `删除`（来自 `title="删除"`），测活按钮名是 `测活`。改图标时必须保留这些可访问名。

4. **本计划遵循强制 TDD**：但本任务是**纯视觉升级**。对"功能行为"我们靠**现有测试回归**保证不破坏（每个任务先跑测试基线、改完再跑）；对"视觉相关的可断言行为"（如新图标的 aria-label、动画类是否挂上）补充**针对性测试**后再实现。不写无意义的快照。

---

## 文件结构

| 文件 | 职责 | 本计划改动 |
| --- | --- | --- |
| `frontend/package.json` | 依赖清单 | 新增 `lucide-react` |
| `frontend/tailwind.config.js` | 主题与色板 | `brand` 调色板蓝→绿（emerald 色值） |
| `frontend/src/styles.css` | 全局语义类样式 | LoginPage/ProfilePage 语义类的视觉精修（图标留白等） |
| `frontend/src/pages/LoginPage.tsx` | 登录页 | 加图标、错误提示动画 |
| `frontend/src/pages/LoginPage.test.tsx` | 登录页测试 | 补图标 aria 断言 |
| `frontend/src/components/UserMenu.tsx` | 头像下拉菜单 | 菜单项加图标、下拉动画 |
| `frontend/src/components/UserMenu.test.tsx` | UserMenu 测试 | 补图标/动画断言 |
| `frontend/src/pages/ProfilePage.tsx` | 个人中心 | 卡片图标、保存按钮图标 |
| `frontend/src/pages/ProfilePage.test.tsx` | ProfilePage 测试 | 保持现有断言通过 |
| `frontend/src/pages/AccountsPage.tsx` | 账号管理 | inline SVG 替换为 lucide 图标（保留可访问名） |
| `frontend/src/pages/MailListPage.tsx` | 邮件列表 | inline SVG 替换为 lucide 图标 |
| `frontend/src/pages/MailDetailPage.tsx` | 邮件详情 | 附件/返回图标 |

---

## Task 0: 基线确认与依赖安装

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 跑测试建立绿色基线**

Run（在 `frontend/` 下）：`npm test`
Expected: 全部测试通过（PASS）。若有失败，先停下排查——本计划假设起点是全绿。

- [ ] **Step 2: 安装 lucide-react**

Run（在 `frontend/` 下）：`npm install lucide-react`
Expected: `package.json` 的 `dependencies` 出现 `lucide-react`，安装成功无报错。

- [ ] **Step 3: 验证可导入（冒烟）**

Run（在 `frontend/` 下）：`npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS（确认安装未破坏现有构建/测试环境）。

- [ ] **Step 4: 提交**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore(frontend): 安装 lucide-react 图标库"
```

---

## Task 1: 主色蓝→绿（重定义 brand 调色板）

这是影响最大、收益最高的一步。改完后全 app 的 `brand-*` 类立即变绿。

**Files:**
- Modify: `frontend/tailwind.config.js`

- [ ] **Step 1: 写一个守护测试，断言 brand-500 已是 emerald 绿**

新建文件 `frontend/src/theme.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import config from '../tailwind.config.js';

/** 主题色守护：确保 brand 调色板已切换为 emerald 绿色系，
 *  防止后续误改回蓝色。色值对齐 Tailwind 内置 emerald。 */
describe('brand 调色板', () => {
  const brand = (config as any).theme.extend.colors.brand as Record<string, string>;

  it('brand-500 为 emerald-500 (#10b981)', () => {
    expect(brand['500'].toLowerCase()).toBe('#10b981');
  });

  it('brand-600 为 emerald-600 (#059669)', () => {
    expect(brand['600'].toLowerCase()).toBe('#059669');
  });

  it('brand-50 为 emerald-50 (#ecfdf5)', () => {
    expect(brand['50'].toLowerCase()).toBe('#ecfdf5');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run（在 `frontend/` 下）：`npx vitest run src/theme.test.ts`
Expected: FAIL —— `brand-500` 当前是 `#3b82f6`（蓝），断言不通过。

- [ ] **Step 3: 重定义 brand 调色板为 emerald 色值**

在 `frontend/tailwind.config.js` 中，把 `theme.extend.colors.brand` 整块替换为下面的 emerald 色值（9 档全部对齐 Tailwind 内置 emerald）：

```js
      colors: {
        // 品牌主色：emerald 绿色体系，营造清新、专业的观感。
        // 色值对齐 Tailwind 内置 emerald 调色板。
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
```

- [ ] **Step 4: 跑主题测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/theme.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑全量测试，确认无回归**

Run（在 `frontend/` 下）：`npm test`
Expected: 全部 PASS。特别确认 `MailListPage` 的 `ring-brand-300` 断言仍通过（类名未变，只是色值变了）。

- [ ] **Step 6: 构建确认**

Run（在 `frontend/` 下）：`npm run build`
Expected: `tsc -b && vite build` 成功，产物输出到 `dist/`。

- [ ] **Step 7: 提交**

```bash
cd frontend && git add tailwind.config.js src/theme.test.ts
git commit -m "feat(frontend): 主色从蓝色切换为 emerald 绿色"
```

---

## Task 2: LoginPage 视觉升级（加图标 + 错误动画）

LoginPage 用语义类 `.login-page`，视觉主要由 `styles.css` 控制。本任务给标题加 `Mail` 图标、邮箱/密码输入加前置图标、错误提示加 `AlertCircle` 图标与滑入动画，OAuth 按钮加 `ExternalLink` 图标。

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 写失败测试——错误提示带 alert 角色且容器带动画类**

在 `frontend/src/pages/LoginPage.test.tsx` 的 `describe` 内追加：

```ts
  it('登录失败时错误提示带 slide-down 动画类', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('邮箱或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('animate-slide-down');
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run（在 `frontend/` 下）：`npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL —— 当前错误段落 `<p className="error">` 不含 `animate-slide-down`。

- [ ] **Step 3: 在 tailwind.config.js 补 slide-down 动画**

`styles.css` 已有 `fade-in`/`slide-up`/`slide-in-right`，但没有 `slide-down`。在 `frontend/tailwind.config.js` 的 `theme.extend.keyframes` 与 `animation` 中补充（保留已有项）：

```js
      keyframes: {
        // 弹窗淡入与上浮
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
      },
```

> 注意：`styles.css` 里也有同名 `@keyframes fade-in/slide-up` 和 `.animate-*` 定义。Tailwind config 的 `animation` 会生成同名 utility，二者类名一致、效果一致，不冲突。`slide-down` 仅在 config 定义即可。

- [ ] **Step 4: 升级 LoginPage.tsx——加图标与错误动画**

把 `frontend/src/pages/LoginPage.tsx` 整体替换为：

```tsx
import { useState, type FormEvent } from 'react';
import { Mail, Lock, AlertCircle, ExternalLink } from 'lucide-react';

/** 登录页组件属性。 */
interface LoginPageProps {
  /** 提交登录的回调，接收邮箱与密码，返回 Promise。 */
  onLogin: (email: string, password: string) => Promise<void>;
  /** 使用 linux.do OAuth 登录。 */
  onLinuxDoLogin: () => void;
}

/**
 * 登录页：填写邮箱与密码后提交，也可跳转 linux.do OAuth。
 * 登录失败时展示错误信息。
 */
export function LoginPage({ onLogin, onLinuxDoLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 提交表单：调用 onLogin，失败时展示错误信息
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <h1>
        <Mail className="login-logo" aria-hidden="true" />
        MailDock 登录
      </h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">邮箱</label>
          <div className="input-with-icon">
            <Mail className="input-icon" aria-hidden="true" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <div className="input-with-icon">
            <Lock className="input-icon" aria-hidden="true" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>
        {error && (
          <p className="error animate-slide-down" role="alert">
            <AlertCircle className="error-icon" aria-hidden="true" />
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>登录</button>
        <button type="button" className="oauth-btn" onClick={onLinuxDoLogin}>
          <ExternalLink className="oauth-icon" aria-hidden="true" />
          使用 linux.do 登录
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: 在 styles.css 补登录页图标样式**

在 `frontend/src/styles.css` 的 `@layer components` 内、`.login-page button[type='submit']` 规则之后，追加以下规则：

```css
  /* 登录页：标题 logo 图标 */
  .login-page h1 .login-logo {
    @apply mx-auto mb-2 block h-10 w-10 text-brand-600;
  }

  /* 登录页：带前置图标的输入框 */
  .login-page .input-with-icon {
    @apply relative;
  }

  .login-page .input-with-icon .input-icon {
    @apply pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400;
  }

  .login-page .input-with-icon input {
    @apply w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-800
      outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20;
  }

  /* 登录页：错误提示内联图标 */
  .login-page .error {
    @apply flex items-center gap-2;
  }

  .login-page .error .error-icon {
    @apply h-4 w-4 shrink-0;
  }

  /* 登录页：OAuth 按钮 */
  .login-page .oauth-btn {
    @apply mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border
      border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition
      hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700;
  }

  .login-page .oauth-btn .oauth-icon {
    @apply h-4 w-4;
  }
```

> 说明：原 `.login-page .field input` 规则仍存在，但邮箱/密码输入现在被包在 `.input-with-icon` 内、由更具体的 `.input-with-icon input` 规则接管（CSS 特异性更高），无需删除旧规则。

- [ ] **Step 6: 跑 LoginPage 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS（含新增的动画类断言，及原有 4 条用例）。

- [ ] **Step 7: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 8: 提交**

```bash
cd frontend && git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx src/styles.css tailwind.config.js
git commit -m "refactor(frontend): upgrade LoginPage UI"
```

---

## Task 3: UserMenu 视觉升级（菜单项图标 + 下拉动画）

给下拉菜单项加图标（个人中心 `UserCircle`、退出 `LogOut`），并给下拉容器加 `animate-slide-down`。头像本身样式已由 `styles.css` 的 `.user-avatar` 控制，保持不动。

**Files:**
- Modify: `frontend/src/components/UserMenu.tsx`
- Modify: `frontend/src/components/UserMenu.test.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 写失败测试——下拉容器带动画类、菜单项保留可访问名**

在 `frontend/src/components/UserMenu.test.tsx` 的 `describe` 内追加：

```ts
  it('展开的下拉菜单带 slide-down 动画类', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu').className).toContain('animate-slide-down');
  });
```

> 现有用例已断言菜单项 `name: '个人中心'` / `'退出登录'` 仍可点击——这保证加图标后可访问名不丢。无需重复。

- [ ] **Step 2: 跑测试，确认失败**

Run（在 `frontend/` 下）：`npx vitest run src/components/UserMenu.test.tsx`
Expected: FAIL —— `.user-dropdown` 容器当前不含 `animate-slide-down`。

- [ ] **Step 3: 升级 UserMenu.tsx**

把 `frontend/src/components/UserMenu.tsx` 中 `return` 内的下拉部分升级：在 `user-dropdown` 容器加动画类，给两个菜单按钮加图标。完整替换 `return (...)` 块为：

```tsx
  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-avatar"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="user-avatar-img" />
        ) : (
          <span aria-hidden="true">{initial(user)}</span>
        )}
      </button>

      {open && (
        <div className="user-dropdown animate-slide-down" role="menu">
          <div className="user-dropdown-head">
            <span className="user-dropdown-name">{name}</span>
            {user.primaryEmail && (
              <span className="user-dropdown-email">{user.primaryEmail}</span>
            )}
          </div>
          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            <UserCircle className="user-dropdown-icon" aria-hidden="true" />
            个人中心
          </button>
          <button
            type="button"
            className="user-dropdown-item user-dropdown-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="user-dropdown-icon" aria-hidden="true" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
```

并在文件顶部 import 区加入：

```tsx
import { UserCircle, LogOut } from 'lucide-react';
```

- [ ] **Step 4: 在 styles.css 补菜单项图标布局**

在 `frontend/src/styles.css` 的 `.user-dropdown-item` 规则之后追加：

```css
  /* 用户菜单项：图标 + 文字横向排列 */
  .user-dropdown-item {
    @apply flex items-center gap-2.5;
  }

  .user-dropdown-item .user-dropdown-icon {
    @apply h-4 w-4 shrink-0;
  }
```

> 这里重复声明 `.user-dropdown-item` 的 flex 是有意为之：原规则已用 `@apply block ...`，新规则追加 flex 布局。`@apply flex` 会覆盖 `display: block`，二者最终合并为 flex 布局。

- [ ] **Step 5: 跑 UserMenu 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/components/UserMenu.test.tsx`
Expected: PASS（含新动画断言与原有 6 条用例，菜单项可访问名 `个人中心`/`退出登录` 仍命中）。

- [ ] **Step 6: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 7: 提交**

```bash
cd frontend && git add src/components/UserMenu.tsx src/components/UserMenu.test.tsx src/styles.css
git commit -m "refactor(frontend): upgrade UserMenu UI"
```

---

## Task 4: ProfilePage 视觉升级（卡片图标 + 保存按钮图标）

ProfilePage 用语义类 `.profile-*`。给两张卡片标题加图标、显示名输入加 `User` 前置图标、保存/改密按钮加图标、linux.do 提示加 `Info` 图标。所有 `getByLabelText` / `getByRole` 查询必须保持可命中。

**Files:**
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Modify: `frontend/src/pages/ProfilePage.test.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 写失败测试——更新资料按钮内含图标但可访问名不变**

在 `frontend/src/pages/ProfilePage.test.tsx` 的 `describe` 内追加：

```ts
  it('更新资料按钮内嵌图标且可访问名保持「更新资料」', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);
    const btn = screen.getByRole('button', { name: '更新资料' });
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run（在 `frontend/` 下）：`npx vitest run src/pages/ProfilePage.test.tsx`
Expected: FAIL —— 当前「更新资料」按钮内无 `<svg>`。

- [ ] **Step 3: 升级 ProfilePage.tsx**

在 `frontend/src/pages/ProfilePage.tsx` 顶部 import 区加入：

```tsx
import { Mail, User, Lock, Save, Info } from 'lucide-react';
```

然后做以下精确替换：

替换资料卡标题 `<h2>资料与头像</h2>` 为：

```tsx
        <h2 className="profile-card-title"><User className="profile-card-icon" aria-hidden="true" />资料与头像</h2>
```

替换只读资料里的邮箱 `dt`/`dd`（`<dt>邮箱</dt>` 那一行）所在的 `<dl>` 块为带图标版本：

```tsx
              <dl className="profile-readonly">
                <dt><Mail className="profile-readonly-icon" aria-hidden="true" />邮箱</dt>
                <dd>{user.primaryEmail ?? '—'}</dd>
                <dt>登录方式</dt>
                <dd>{user.hasPassword ? '邮箱密码' : 'linux.do'}</dd>
              </dl>
```

替换「更新资料」按钮为：

```tsx
            <button type="submit" className="btn-primary" disabled={savingProfile}>
              <Save className="h-4 w-4" aria-hidden="true" />
              更新资料
            </button>
```

替换改密卡标题 `<h2>修改密码</h2>` 为：

```tsx
        <h2 className="profile-card-title"><Lock className="profile-card-icon" aria-hidden="true" />修改密码</h2>
```

替换 linux.do 提示段落 `<p className="profile-note">...` 为：

```tsx
          <p className="profile-note"><Info className="profile-note-icon" aria-hidden="true" />当前账号通过 linux.do 登录，未设置密码</p>
```

替换「修改密码」按钮为：

```tsx
          <button type="submit" className="btn-primary" disabled={!user.hasPassword || savingPwd}>
            <Lock className="h-4 w-4" aria-hidden="true" />
            修改密码
          </button>
```

> `btn-primary` 已是 `inline-flex items-center gap-2`（见 styles.css 的 `button` 基础规则），图标与文字会自动横向排列。

- [ ] **Step 4: 在 styles.css 补 profile 图标样式**

在 `frontend/src/styles.css` 的 `.profile-card h2` 规则之后追加：

```css
  /* 个人中心：卡片标题图标 */
  .profile-card-title {
    @apply flex items-center gap-2;
  }

  .profile-card-title .profile-card-icon {
    @apply h-5 w-5 text-brand-600;
  }

  /* 个人中心：只读项图标 */
  .profile-readonly dt .profile-readonly-icon {
    @apply mr-1 inline-block h-3.5 w-3.5 align-text-bottom;
  }

  /* 个人中心：提示图标 */
  .profile-note {
    @apply flex items-center gap-2;
  }

  .profile-note .profile-note-icon {
    @apply h-4 w-4 shrink-0;
  }
```

- [ ] **Step 5: 跑 ProfilePage 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/pages/ProfilePage.test.tsx`
Expected: PASS（新增图标断言 + 原有 5 条用例，含 `getByText('当前账号通过 linux.do 登录，未设置密码')` 仍命中——文本未变，仅前置图标）。

- [ ] **Step 6: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 7: 提交**

```bash
cd frontend && git add src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx src/styles.css
git commit -m "refactor(frontend): upgrade ProfilePage UI"
```

---

## Task 5: AccountsPage 图标统一（inline SVG → lucide）

AccountsPage 视觉已现代化，仅把手写 inline `<svg>` 替换为 lucide 图标，统一图标语言。**严格保留所有可访问名与 `aria-*` 属性**（测试依赖：`新增账号`、`导入`、`测活`、`删除`、`role="checkbox"` + `aria-label`）。复选框的勾选 SVG 保持原样（它有精细的 scale/opacity 动画，不替换）。

**Files:**
- Modify: `frontend/src/pages/AccountsPage.tsx`

- [ ] **Step 1: 写失败测试——删除按钮内含图标且可访问名仍为「删除」**

在 `frontend/src/pages/AccountsPage.test.tsx` 的 `describe` 内追加：

```ts
  it('删除按钮内嵌图标且可访问名保持「删除」', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');
    const delBtn = screen.getAllByRole('button', { name: '删除' })[0];
    expect(delBtn.querySelector('svg')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 跑测试，确认通过（基线已满足）**

Run（在 `frontend/` 下）：`npx vitest run src/pages/AccountsPage.test.tsx`
Expected: PASS —— 当前删除按钮已含 inline `<svg>`，可访问名已是 `删除`。

> 本任务图标替换属"等价重构"，此测试用于**锁定可访问名 + svg 存在这两条不变量**，防止替换时误删。这是合法的回归保护测试，不是 TDD 红灯。

- [ ] **Step 3: 替换图标——顶部工具栏**

在 `frontend/src/pages/AccountsPage.tsx` 顶部 import 区加入：

```tsx
import { Plus, Upload, Trash2, RefreshCw, Mail, Clock } from 'lucide-react';
```

把「新增账号」按钮内的 inline `<svg>...</svg>`（`d="M12 4v16m8-8H4"` 那个）替换为：

```tsx
            <Plus className="h-4 w-4" aria-hidden="true" />
```

把「导入」按钮内的 inline `<svg>...</svg>`（`d="M7 16a4 4..."`）替换为：

```tsx
            <Upload className="h-4 w-4" aria-hidden="true" />
```

> 视图切换的两个网格/列表 SVG（`d="M4 6h16..."` 和 `d="M4 6a2 2..."`）保留原样——lucide 无完全对应图标，且测试不依赖，改动收益低风险高。

- [ ] **Step 4: 替换图标——空状态、时间、行内操作**

把**所有**空状态信封 inline `<svg>`（`d="M3 8l7.89 5.26..."`，桌面/移动/网格三处）替换为：

```tsx
                    <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300" aria-hidden="true" />
```

把移动端/网格卡片里"最近测活"的时钟 inline `<svg>`（`d="M12 8v4l3 3..."`）替换为：

```tsx
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
```

把"最近收信"的信封 inline `<svg>`（`d="M3 8l7.89..."`，h-3.5 那个）替换为：

```tsx
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
```

把行内/卡片「删除」按钮里的垃圾桶 inline `<svg>`（`d="M19 7l-.867..."`，全部出现处）替换为：

```tsx
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
```

> 删除按钮的 `title="删除"`（桌面端）保持不变——它提供可访问名。移动/网格端删除按钮无 `title`，但测试只查桌面端的 `删除`，保持现状即可。

- [ ] **Step 5: 跑 AccountsPage 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/pages/AccountsPage.test.tsx`
Expected: PASS（全部 17 条用例，含新增的图标不变量断言）。

- [ ] **Step 6: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 7: 提交**

```bash
cd frontend && git add src/pages/AccountsPage.tsx src/pages/AccountsPage.test.tsx
git commit -m "refactor(frontend): unify AccountsPage icons with lucide"
```

---

## Task 6: MailListPage 图标统一（inline SVG → lucide）

把刷新、用户、附件等 inline SVG 换成 lucide。**保留 `ring-brand-300` 未读样式类**（测试硬约束）与刷新按钮可访问名 `刷新`、返回按钮名 `返回`。

**Files:**
- Modify: `frontend/src/pages/MailListPage.tsx`

- [ ] **Step 1: 写失败测试——附件邮件渲染附件图标（保留 svg 不变量）**

在 `frontend/src/pages/MailListPage.test.tsx` 的 `describe` 内追加：

```ts
  it('未读样式类 ring-brand-300 在图标替换后仍保留', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '未读', isRead: false })],
      }),
    });
    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('未读');
    let card: HTMLElement | null = screen.getByText('未读').closest('div');
    while (card && !card.className.includes('ring-brand-300')) {
      card = card.parentElement as HTMLElement;
    }
    expect(card).toBeTruthy();
  });
```

- [ ] **Step 2: 跑测试，确认通过（基线锁定）**

Run（在 `frontend/` 下）：`npx vitest run src/pages/MailListPage.test.tsx`
Expected: PASS —— 锁定 `ring-brand-300` 不变量，后续替换不得破坏。

- [ ] **Step 3: 替换图标**

在 `frontend/src/pages/MailListPage.tsx` 顶部 import 区加入：

```tsx
import { RefreshCw, User, Paperclip } from 'lucide-react';
```

把刷新按钮内的 inline `<svg>`（`d="M4 4v5h.582..."`）替换为：

```tsx
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
```

把附件标识 inline `<svg>`（`d="M15.172 7l-6.586..."`）替换为：

```tsx
                <Paperclip className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
```

把发件人前的用户 inline `<svg>`（`d="M16 7a4 4 0 11-8 0..."`）替换为：

```tsx
                <User className="h-4 w-4" aria-hidden="true" />
```

> 刷新按钮的可访问名来自 `<span className="hidden sm:inline">{busy ? '刷新中…' : '刷新'}</span>`，文本保留，测试 `name: /刷新/` 与 `name: '刷新'` 仍命中。未读卡片的 `ring-brand-300` 类不动。

- [ ] **Step 4: 跑 MailListPage 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/pages/MailListPage.test.tsx`
Expected: PASS（全部用例，含附件图标 svg 断言与 `ring-brand-300` 断言）。

- [ ] **Step 5: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 6: 提交**

```bash
cd frontend && git add src/pages/MailListPage.tsx src/pages/MailListPage.test.tsx
git commit -m "refactor(frontend): unify MailListPage icons with lucide"
```

---

## Task 7: MailDetailPage 视觉升级（附件 + 下载图标）

MailDetailPage 仍用较朴素的 `<article>` + `<dl>` 结构（由 styles.css 控制）。给附件列表项加 `Paperclip` 图标、下载链接加 `Download` 图标。保留附件链接文本（测试用 `findByText('报告.pdf')` + `closest('a')` 校验 href）与返回按钮名 `返回`。

**Files:**
- Modify: `frontend/src/pages/MailDetailPage.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 写失败测试——附件项含 Paperclip 图标且下载链接 href 不变**

在 `frontend/src/pages/MailDetailPage.test.tsx` 的 `describe` 内追加：

```ts
  it('附件项渲染图标且下载链接保留 href', async () => {
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(
        detail({
          attachments: [
            { id: 11, filename: '报告.pdf', contentType: 'application/pdf', size: 2048 },
          ],
        }),
      ),
    });
    render(<MailDetailPage api={api as never} messageId={1} onBack={vi.fn()} />);
    const link = (await screen.findByText('报告.pdf')).closest('a')!;
    expect(link).toHaveAttribute('href', '/api/v1/messages/1/attachments/11');
    // 附件列表项内应有图标
    const li = link.closest('li')!;
    expect(li.querySelector('svg')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run（在 `frontend/` 下）：`npx vitest run src/pages/MailDetailPage.test.tsx`
Expected: FAIL —— 当前附件 `<li>` 内无 `<svg>`。

- [ ] **Step 3: 升级 MailDetailPage.tsx**

在 `frontend/src/pages/MailDetailPage.tsx` 顶部 import 区加入：

```tsx
import { Paperclip, Download } from 'lucide-react';
```

把附件列表项 `<li>...</li>` 块替换为：

```tsx
                  <li key={att.id} className="attachment-item">
                    <Paperclip className="attachment-icon" aria-hidden="true" />
                    <a
                      href={api.attachmentUrl(message.id, att.id)}
                      download
                      className="link break-all"
                    >
                      {att.filename}
                    </a>
                    <span className="text-xs text-slate-500">（{formatSize(att.size)}）</span>
                    <Download className="attachment-download-icon" aria-hidden="true" />
                  </li>
```

- [ ] **Step 4: 在 styles.css 补附件项样式**

在 `frontend/src/styles.css` 的 `.app-main article li` 规则之后追加：

```css
  /* 邮件详情：附件项图标布局 */
  .app-main article li.attachment-item {
    @apply flex items-center gap-2;
  }

  .app-main article li.attachment-item .attachment-icon {
    @apply h-4 w-4 shrink-0 text-slate-400;
  }

  .app-main article li.attachment-item .attachment-download-icon {
    @apply h-4 w-4 shrink-0 text-brand-600;
  }
```

- [ ] **Step 5: 跑 MailDetailPage 测试，确认通过**

Run（在 `frontend/` 下）：`npx vitest run src/pages/MailDetailPage.test.tsx`
Expected: PASS（新增附件图标断言 + 原有 7 条用例，含 href 校验）。

- [ ] **Step 6: 跑全量测试 + 构建**

Run（在 `frontend/` 下）：`npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 7: 提交**

```bash
cd frontend && git add src/pages/MailDetailPage.tsx src/pages/MailDetailPage.test.tsx src/styles.css
git commit -m "refactor(frontend): upgrade MailDetailPage UI"
```

---

## Task 8: 收尾验证与人工自查

**Files:**
- 无代码改动（仅验证）

- [ ] **Step 1: 全量测试**

Run（在 `frontend/` 下）：`npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 生产构建**

Run（在 `frontend/` 下）：`npm run build`
Expected: 成功，无类型错误。

- [ ] **Step 3: 启动开发服务器人工核对**

Run（在 `frontend/` 下）：`npm run dev`
人工核对清单（浏览器打开 http://localhost:5173）：
- [ ] 登录页：主色为绿色，标题/输入框/OAuth 按钮有图标，错误提示滑入动画正常
- [ ] 账号页：按钮、状态点、链接 hover 均为绿色，图标显示正常
- [ ] 头像下拉：展开有滑下动画，菜单项有图标
- [ ] 邮件列表：未读卡片绿色高亮，刷新/附件图标正常
- [ ] 邮件详情：附件项有回形针 + 下载图标
- [ ] 个人中心：卡片标题、按钮有图标
- [ ] 移动端（DevTools 375px）：布局不破版

- [ ] **Step 4: 确认无遗留蓝色**

在浏览器 DevTools 全局搜索或目视检查，确认无残留的 `#3b82f6` 系蓝色主色（复选框的 `accent`/内联 `rgb(59,130,246)` 是设计文档允许的蓝色特例，**保留**）。

> 注意：AccountsPage 复选框用内联样式 `backgroundColor: 'rgb(59, 130, 246)'`（蓝色），这是设计文档明确的"复选框特例"，**不改**。

---

## 自查结果（写计划者已核对）

**1. Spec 覆盖**：
- 全局配置（Tailwind 动画 + lucide）→ Task 0、Task 2 Step 3 ✅
- 主色 emerald → Task 1 ✅（通过重定义 brand 调色板，已与用户确认）
- LoginPage / AccountsPage / MailListPage / ProfilePage / UserMenu → Task 2-6 ✅
- MailDetailPage（spec 未单列但属现有页面）→ Task 7 ✅
- 测试策略（保留可访问性、回归保护）→ 每个 Task 的 TDD 步骤 ✅
- 响应式/可访问性保留 → Task 8 人工核对 ✅

**2. Placeholder 扫描**：无 TBD/TODO，每个改动均给出具体代码与精确替换目标 ✅

**3. 类型/命名一致性**：lucide 图标名（`Mail`/`Lock`/`AlertCircle`/`ExternalLink`/`UserCircle`/`LogOut`/`User`/`Save`/`Info`/`Plus`/`Upload`/`Trash2`/`RefreshCw`/`Clock`/`Paperclip`/`Download`）均为 lucide-react 实际导出名；CSS 类名前后一致 ✅

**与 spec 的已知偏差（已与用户确认）**：spec 写"直接用 emerald-* 不自定义 brand"，实际因现有代码深度依赖 `brand-*`，改为"重定义 brand 调色板为 emerald 色值"——视觉效果等价，JSX 零改动，风险更低。
