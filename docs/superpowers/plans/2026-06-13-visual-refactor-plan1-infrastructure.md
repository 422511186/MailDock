# 全站视觉重构 Plan 1: 基础设施重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理旧视觉代码，新增全局 Header 顶栏组件

**Architecture:** 删除 styles.css 中的语义类（LoginPage/ProfilePage/UserMenu），git revert Task 2-4 提交，新增 Header 组件并集成到 App.tsx

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react + vitest

**关联文档：** `docs/superpowers/specs/2026-06-12-full-visual-refactor-design.md` (Task A-B)

---

## 文件改动清单

**Task A（清理）：**
- Modify: `frontend/src/styles.css` — 删除语义类
- Git revert: 3 个提交（8a97e2f, ab48771, 79de341）

**Task B（Header）：**
- Create: `frontend/src/components/Header.tsx`
- Create: `frontend/src/components/Header.test.tsx`
- Modify: `frontend/src/App.tsx` — 引入 Header

---

## Task A: 清理准备工作

**目标：** 删除旧的语义类样式，revert Task 2-4 的视觉改动。

**警告：** 本任务执行后测试会大量失败（正常），后续 Plan 2-3 会修复。

### Step 1: 备份当前分支

- [ ] **创建备份分支**

```bash
cd /Users/huangzy/Workspace/personal/MailDock
git branch backup-before-visual-refactor
```

### Step 2: Git revert Task 2-4 提交

- [ ] **Revert ProfilePage (Task 4)**

```bash
git revert 79de341 --no-edit
```

Expected: 成功 revert，ProfilePage.tsx/test 恢复到 Task 3 之前的状态。

- [ ] **Revert UserMenu (Task 3)**

```bash
git revert ab48771 --no-edit
```

Expected: 成功 revert，UserMenu.tsx/test 恢复到 Task 2 之前的状态。

- [ ] **Revert LoginPage (Task 2)**

```bash
git revert 8a97e2f --no-edit
```

Expected: 成功 revert，LoginPage.tsx/test 恢复到 Task 1 之前的状态。

### Step 3: 删除 styles.css 中的语义类

- [ ] **读取 styles.css 定位语义类位置**

```bash
grep -n "\.login-page\|\.profile-\|\.user-menu\|\.user-dropdown" frontend/src/styles.css
```

Expected: 输出行号范围。

- [ ] **删除语义类（保留全局基础样式）**

从 `frontend/src/styles.css` 删除以下 section（根据 grep 结果确定行号）：
- `.login-page` 及其子类（h1, .field, .error, .input-with-icon, .login-logo, .oauth-btn, .error-icon 等）
- `.profile-*` 相关（.profile-card, .profile-form, .profile-avatar, .profile-note, .profile-card-title 等）
- `.user-menu`、`.user-dropdown` 相关（.user-avatar, .user-dropdown-item, .user-dropdown-icon 等）

**保留以下全局样式：**
- `body`、`#root`
- `.app-main`
- `.btn-primary`（后续会逐步替换，但暂时保留）
- `@keyframes` 和 `.animate-*` 类（fade-in, slide-up, slide-down）

### Step 4: 运行测试确认失败

- [ ] **运行全量测试**

```bash
cd frontend && npm test
```

Expected: 大量测试 FAIL（LoginPage/UserMenu/ProfilePage 相关测试因为 DOM 结构变化而失败）。这是预期行为。

### Step 5: 提交清理工作

- [ ] **提交**

```bash
cd frontend && git add src/styles.css
git commit -m "refactor(frontend): 清理旧视觉样式，准备全面重构

- 删除 styles.css 中的 .login-page、.profile-*、.user-menu 语义类
- Git revert Task 2-4 的视觉改动（8a97e2f, ab48771, 79de341）
- 保留全局基础样式和动画类
- 测试预期大量失败，后续 Plan 2-3 会修复"
```

---

## Task B: Header 组件（全局顶栏）

**目标：** 新增全局 Header 组件（品牌 logo + 用户菜单），集成到 App.tsx。

### Step 1: 写 Header 测试（TDD）

- [ ] **创建测试文件**

创建 `frontend/src/components/Header.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import type { CurrentUser } from '../api/client';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

describe('Header', () => {
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
    render(<Header user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toBeInTheDocument();
  });
});
```

- [ ] **运行测试确认失败**

```bash
npx vitest run src/components/Header.test.tsx
```

Expected: FAIL with "Cannot find module './Header'"

### Step 2: 实现 Header 组件

- [ ] **创建 Header.tsx**

创建 `frontend/src/components/Header.tsx`：

```typescript
import { Mail } from 'lucide-react';
import type { CurrentUser } from '../api/client';
import { UserMenu } from './UserMenu';

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

- [ ] **运行测试确认通过**

```bash
npx vitest run src/components/Header.test.tsx
```

Expected: 3/3 PASS

### Step 3: 集成到 App.tsx

- [ ] **读取 App.tsx 确定集成位置**

```bash
grep -n "return" frontend/src/App.tsx | head -5
```

Expected: 找到主 return 语句行号。

- [ ] **修改 App.tsx 引入 Header**

在 `frontend/src/App.tsx` 顶部 import 区添加：

```typescript
import { Header } from './components/Header';
```

在 App 组件的 return 语句外层包裹（原有内容保持不变）：

```typescript
return (
  <div className="min-h-screen bg-slate-50">
    {view !== 'loading' && view !== 'login' && (
      <Header user={currentUser} onOpenProfile={goProfile} onLogout={handleLogout} />
    )}
    <main className="app-main">
      {/* 原有 view 渲染逻辑保持不变 */}
      {view === 'loading' && <div className="flex min-h-screen items-center justify-center">...</div>}
      {view === 'login' && <LoginPage ... />}
      {view === 'accounts' && <AccountsPage ... />}
      {/* 等等 */}
    </main>
  </div>
);
```

**注意：** Header 在非 loading/login 页面显示。

### Step 4: 运行 Header 测试

- [ ] **确认 Header 测试仍通过**

```bash
npx vitest run src/components/Header.test.tsx
```

Expected: 3/3 PASS

### Step 5: 手动验证（可选）

- [ ] **启动 dev server 查看 Header**

```bash
npm run dev
```

访问 http://localhost:5173，登录后应看到顶部有 Header（MailDock logo + 用户菜单）。

### Step 6: 提交 Header 组件

- [ ] **提交**

```bash
git add src/components/Header.tsx src/components/Header.test.tsx src/App.tsx
git commit -m "feat(frontend): 添加全局 Header 顶栏组件

- 新增 Header 组件：左侧品牌 logo + 右侧用户菜单
- 集成到 App.tsx（非 loading/login 页面显示）
- 测试覆盖：品牌显示、登录态显示用户菜单
- 对齐 design-prototype.html section-1"
```

---

## Plan 1 完成检查点

- [x] Task A: 清理准备工作完成
  - 删除 styles.css 语义类
  - Git revert Task 2-4 提交
  - 提交清理 commit
- [x] Task B: Header 组件完成
  - Header.tsx + Header.test.tsx
  - 集成到 App.tsx
  - 测试通过
  - 提交 Header commit

**下一步：** 执行 Plan 2（用户相关页面重构：UserMenu + LoginPage + ProfilePage）
