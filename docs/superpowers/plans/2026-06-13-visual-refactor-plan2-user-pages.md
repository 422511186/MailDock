# 全站视觉重构 Plan 2: 用户相关页面重构

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 UserMenu（富信息下拉）、LoginPage（按钮 + 表单切换）、ProfilePage（渐变卡片）三个用户相关页面，全部改用 Tailwind 原子类。

**Architecture:** 删除 Plan 1 revert 后残留的语义类用法，按 `design-prototype.html` 重写 JSX。保留所有现有功能行为（邮箱密码登录、显示名编辑、修改密码）。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react + vitest

**关联文档：** `docs/superpowers/specs/2026-06-12-full-visual-refactor-design.md` (Task C-E)

**前置条件：** Plan 1 已完成（styles.css 语义类已删除、Task 2-4 已 revert、Header 组件已集成）。

---

## 重要决策：LoginPage 保留邮箱密码登录功能

设计文档（Task D）描述 LoginPage 改为纯按钮式，邮箱按钮回调为占位 `onEmailLogin`。但**当前代码的 `onLogin(email, password)` 是真实可用的邮箱密码登录功能，不能丢失**。

**本计划采用方案：** LoginPage 内部用本地 state `mode: 'choice' | 'email'` 切换：
- `choice` 模式：显示两个大按钮（LinuxDO + 邮箱登录），对齐原型 section-3
- `email` 模式：点击「邮箱登录」后展开邮箱密码表单（复用现有 `onLogin` 逻辑），带「返回」回到 choice

这样既对齐原型视觉，又不丢失功能。`LoginPage` 的 props 保持 `onLogin` + `onLinuxDoLogin` 不变，**App.tsx 无需改动**。

---

## 文件改动清单

**Task C（UserMenu）：**
- Rewrite: `frontend/src/components/UserMenu.tsx`
- Adjust: `frontend/src/components/UserMenu.test.tsx`

**Task D（LoginPage）：**
- Rewrite: `frontend/src/pages/LoginPage.tsx`
- Adjust: `frontend/src/pages/LoginPage.test.tsx`

**Task E（ProfilePage）：**
- Rewrite: `frontend/src/pages/ProfilePage.tsx`
- Adjust: `frontend/src/pages/ProfilePage.test.tsx`

---

## Task C: UserMenu 重构（富信息下拉）

**目标：** 触发按钮显示头像 + 用户名 + 下拉箭头；展开后富信息头部（大头像 + 用户名 + 邮箱）+ 三个菜单项（个人中心 / 邮件列表 / 退出登录）。全改 Tailwind 原子类。

**原型参考：** `design-prototype.html` section-1 (133-167 行)

**关键行为约束（必须保留）：**
- 点击外部关闭 + Esc 关闭（现有 `useEffect` 逻辑照搬）
- `aria-label="用户菜单"`、`aria-haspopup="menu"`、`aria-expanded`
- 下拉容器 `role="menu"`，菜单项 `role="menuitem"`
- 头像：有 `avatarUrl` 显示图片，否则首字母方块

**新增菜单项「邮件列表」的回调处理：** UserMenu 新增可选 prop `onOpenMailList?: () => void`。当前 App.tsx 没有"返回账号列表"以外的邮件列表入口，**本任务先让该 prop 可选**，未传时该菜单项仍渲染但点击仅关闭菜单（不报错）。App.tsx 接线留到 Plan 3 或保持可选。

> 注意：原型有「邮件列表」菜单项，但当前应用的"邮件列表"依赖具体 accountId，没有全局入口。为对齐原型先渲染该项，行为降级为关闭菜单。若评审认为不该出现，可在实现时删除该菜单项并同步删除对应测试。

### Step 1: 调整 UserMenu 测试（TDD）

- [ ] **读取现有测试，确认基线**

```bash
cd /Users/huangzy/Workspace/personal/MailDock/frontend
cat src/components/UserMenu.test.tsx
```

Expected: 现有测试覆盖展开/关闭、菜单项点击回调。

- [ ] **改写测试为新结构**

将 `frontend/src/components/UserMenu.test.tsx` 调整为（保留行为测试，新增结构测试）：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from './UserMenu';
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

describe('UserMenu', () => {
  it('触发按钮显示用户名与下拉箭头', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '用户菜单' });
    expect(trigger).toHaveTextContent('Alice');
  });

  it('点击展开后显示富信息头部（用户名 + 邮箱）', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Alice');
    expect(menu).toHaveTextContent('alice@example.com');
  });

  it('菜单包含个人中心 / 邮件列表 / 退出登录三个菜单项', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '邮件列表' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeInTheDocument();
  });

  it('点击个人中心触发 onOpenProfile 并关闭菜单', () => {
    const onOpenProfile = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={onOpenProfile} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }));
    expect(onOpenProfile).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('点击退出登录触发 onLogout', () => {
    const onLogout = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('点击邮件列表触发 onOpenMailList（若提供）并关闭菜单', () => {
    const onOpenMailList = vi.fn();
    render(
      <UserMenu
        user={user()}
        onOpenProfile={vi.fn()}
        onLogout={vi.fn()}
        onOpenMailList={onOpenMailList}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '邮件列表' }));
    expect(onOpenMailList).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc 关闭菜单', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('无 displayName 时触发按钮回退到邮箱', () => {
    render(
      <UserMenu
        user={user({ displayName: null })}
        onOpenProfile={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('alice@example.com');
  });
});
```

- [ ] **运行测试确认失败**

```bash
npx vitest run src/components/UserMenu.test.tsx
```

Expected: FAIL（旧实现不显示用户名在触发按钮、无「邮件列表」菜单项）。

### Step 2: 重写 UserMenu.tsx

- [ ] **重写组件**

将 `frontend/src/components/UserMenu.tsx` 完全重写：

```typescript
import { useEffect, useRef, useState } from 'react';
import { UserCircle, Mail, LogOut, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '../api/client';

interface UserMenuProps {
  /** 当前用户。 */
  user: CurrentUser;
  /** 进入个人中心。 */
  onOpenProfile: () => void;
  /** 退出登录。 */
  onLogout: () => void;
  /** 进入邮件列表（可选，未提供时该菜单项仅关闭菜单）。 */
  onOpenMailList?: () => void;
}

/** 取头像首字母：优先显示名，其次邮箱，再退化为 ?。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 右上角用户菜单：触发按钮显示头像 + 用户名 + 箭头。
 * 展开后富信息头部（大头像 + 用户名 + 邮箱）+ 三个菜单项。
 */
export function UserMenu({ user, onOpenProfile, onLogout, onOpenMailList }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部与 Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const name = user.displayName || user.primaryEmail || 'MailDock 用户';

  return (
    <div className="relative" ref={rootRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-300 hover:shadow-sm"
        aria-label="用户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initial(user)}
          </span>
        )}
        <span className="max-w-[10rem] truncate text-sm font-medium text-slate-700">{name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 animate-slide-down"
          role="menu"
        >
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
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-lg font-semibold text-white shadow-md"
                  aria-hidden="true"
                >
                  {initial(user)}
                </span>
              )}
              <div className="flex-1 overflow-hidden">
                <div className="truncate font-semibold text-slate-800">{name}</div>
                {user.primaryEmail && (
                  <div className="truncate text-xs text-slate-500">{user.primaryEmail}</div>
                )}
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="p-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenProfile();
              }}
            >
              <UserCircle className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>个人中心</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenMailList?.();
              }}
            >
              <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
              <span>邮件列表</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
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

- [ ] **运行测试确认通过**

```bash
npx vitest run src/components/UserMenu.test.tsx
```

Expected: 全部 PASS。

### Step 3: 提交 UserMenu

- [ ] **提交**

```bash
git add src/components/UserMenu.tsx src/components/UserMenu.test.tsx
git commit -m "refactor(frontend): 重构 UserMenu 为富信息下拉样式

- 触发按钮显示头像 + 用户名 + 下拉箭头
- 展开后富信息头部（大头像 + 用户名 + 邮箱）
- 三个菜单项：个人中心 / 邮件列表 / 退出登录
- 改用 Tailwind 原子类，新增可选 onOpenMailList prop
- 对齐 design-prototype.html section-1"
```

---

## Task D: LoginPage 重构（按钮 + 表单切换）

**目标：** 默认显示两个大按钮（LinuxDO + 邮箱登录），点击「邮箱登录」展开邮箱密码表单（保留现有 `onLogin` 功能）。全改 Tailwind 原子类。

**原型参考：** `design-prototype.html` section-3 (279-330 行)

**关键决策（见本文档顶部）：** props 保持 `onLogin` + `onLinuxDoLogin` 不变，内部用 `mode` state 切换。App.tsx 无需改动。

### Step 1: 改写 LoginPage 测试（TDD）

- [ ] **改写测试文件**

将 `frontend/src/pages/LoginPage.test.tsx` 调整为：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('默认显示 LinuxDO 与邮箱登录两个按钮，不显示表单', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
    // 默认不显示邮箱输入框
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('点击 LinuxDO 按钮触发 onLinuxDoLogin', () => {
    const onLinuxDoLogin = vi.fn();
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={onLinuxDoLogin} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 LinuxDO 继续/ }));
    expect(onLinuxDoLogin).toHaveBeenCalled();
  });

  it('点击邮箱登录按钮后展开邮箱密码表单', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('表单模式可返回按钮选择', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
  });

  it('提交表单调用 onLogin', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('a@example.com', 'secret'));
  });

  it('登录失败显示错误信息', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('账号或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误');
  });
});
```

- [ ] **运行测试确认失败**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: FAIL（当前实现默认就显示表单、无 LinuxDO 按钮文案）。

### Step 2: 重写 LoginPage.tsx

- [ ] **重写组件**

将 `frontend/src/pages/LoginPage.tsx` 完全重写：

```typescript
import { useState, type FormEvent } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react';

/** 登录页组件属性。 */
interface LoginPageProps {
  /** 提交登录的回调，接收邮箱与密码，返回 Promise。 */
  onLogin: (email: string, password: string) => Promise<void>;
  /** 使用 linux.do OAuth 登录。 */
  onLinuxDoLogin: () => void;
}

type Mode = 'choice' | 'email';

/**
 * 登录页：默认显示 LinuxDO / 邮箱登录两个大按钮。
 * 点击「邮箱登录」展开邮箱密码表单，提交调用 onLogin。
 */
export function LoginPage({ onLogin, onLinuxDoLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4">
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

          {mode === 'choice' ? (
            <div className="space-y-4">
              {/* LinuxDO 登录 */}
              <button
                type="button"
                onClick={onLinuxDoLogin}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-6 py-4 text-base font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <svg
                  className="inline-block"
                  width="24"
                  height="24"
                  viewBox="0 0 120 120"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <clipPath id="ld-clip">
                    <circle cx="60" cy="60" r="47" />
                  </clipPath>
                  <circle fill="#1c1c1e" cx="60" cy="60" r="50" />
                  <rect fill="#1c1c1e" clipPath="url(#ld-clip)" x="10" y="10" width="100" height="30" />
                  <rect fill="#f0f0f0" clipPath="url(#ld-clip)" x="10" y="40" width="100" height="40" />
                  <rect fill="#ffb003" clipPath="url(#ld-clip)" x="10" y="80" width="100" height="30" />
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

              {/* 邮箱登录（emerald 渐变） */}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('email');
                }}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:from-emerald-700 hover:to-emerald-800 hover:shadow-xl"
              >
                <Mail className="h-5 w-5" aria-hidden="true" />
                <span>使用 邮箱或用户名 登录</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  邮箱
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                  密码
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
              {error && (
                <p
                  className="flex items-center gap-2 text-sm text-rose-600 animate-slide-down"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:from-emerald-700 hover:to-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('choice');
                }}
                className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **运行测试确认通过**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: 全部 PASS。

### Step 3: 提交 LoginPage

- [ ] **提交**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "refactor(frontend): 重构 LoginPage 为按钮 + 表单切换

- 默认显示 LinuxDO / 邮箱登录两个大按钮（对齐原型）
- 点击邮箱登录展开邮箱密码表单，保留现有 onLogin 功能
- 表单可返回按钮选择
- 改用 Tailwind 原子类，props 不变（App.tsx 无需改动）
- 对齐 design-prototype.html section-3"
```

---

## Task E: ProfilePage 重构（渐变卡片）

**目标：** 两张卡片改用 `rounded-2xl border bg-white shadow-sm` + 渐变表头；头像改为圆角方形（`rounded-2xl`）；按钮 emerald 渐变。全改 Tailwind 原子类。

**原型参考：** `design-prototype.html` section-2 (173-277 行)

**关键行为约束（必须保留）：**
- 显示名编辑：`api.updateDisplayName` → `onUserUpdated`
- 修改密码：长度校验（≥6）、两次一致校验、`api.changePassword`
- 非 hasPassword 用户密码输入禁用 + 提示
- 错误/成功消息 `role="alert"`（错误）
- 返回按钮 `onBack`

### Step 1: 调整 ProfilePage 测试（TDD）

- [ ] **读取现有测试，确认行为基线**

```bash
cat src/pages/ProfilePage.test.tsx
```

- [ ] **调整测试（保留行为测试，新增结构断言）**

在 `frontend/src/pages/ProfilePage.test.tsx` 中保留所有现有行为测试（更新资料、修改密码校验、linux.do 用户禁用等），新增结构断言：

```typescript
it('头像为圆角方形（rounded-2xl）', () => {
  const api = stubApi();
  render(
    <ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />,
  );
  // 首字母占位头像或图片均带 rounded-2xl
  const avatar = document.querySelector('.rounded-2xl.shadow-lg');
  expect(avatar).toBeInTheDocument();
});

it('两张卡片均有渐变表头', () => {
  const api = stubApi();
  render(
    <ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />,
  );
  expect(screen.getByText('资料与头像')).toBeInTheDocument();
  expect(screen.getByText('修改密码')).toBeInTheDocument();
});
```

> 若现有测试通过语义类（如 `.profile-card`）做断言，需改为按文本或新原子类查询。

- [ ] **运行测试确认失败**

```bash
npx vitest run src/pages/ProfilePage.test.tsx
```

Expected: 新增结构测试 FAIL（旧实现用语义类，无 `.rounded-2xl.shadow-lg`）。

### Step 2: 重写 ProfilePage.tsx

- [ ] **重写组件**

将 `frontend/src/pages/ProfilePage.tsx` 完全重写：

```typescript
import { useState, type FormEvent } from 'react';
import type { ApiClient, CurrentUser } from '../api/client';
import { Mail, User, Lock, Save, Info, ArrowLeft } from 'lucide-react';

interface ProfilePageProps {
  api: ApiClient;
  user: CurrentUser;
  /** 返回上一视图。 */
  onBack: () => void;
  /** 资料更新后回传新用户，供上层同步状态。 */
  onUserUpdated: (user: CurrentUser) => void;
}

/** 头像首字母占位。 */
function initial(user: CurrentUser): string {
  const source = user.displayName || user.primaryEmail || '?';
  return source.trim().charAt(0).toUpperCase() || '?';
}

/**
 * 个人中心页：展示只读资料、编辑显示名、修改密码。
 * 修改密码仅对邮箱密码用户（hasPassword）开放。
 */
export function ProfilePage({ api, user, onBack, onUserUpdated }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setSavingProfile(true);
    try {
      const updated = await api.updateDisplayName(displayName.trim());
      onUserUpdated(updated);
      setProfileMsg('资料已更新');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdMsg('');
    setPwdErr('');
    if (newPassword.length < 6) {
      setPwdErr('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr('两次输入的新密码不一致');
      return;
    }
    setSavingPwd(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdMsg('密码已修改');
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSavingPwd(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回
        </button>
        <h1 className="text-xl font-bold text-slate-800">个人中心</h1>
      </header>

      {/* 资料卡片 */}
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
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-400 to-slate-500 text-2xl font-semibold text-white shadow-lg ring-2 ring-slate-100"
                  aria-hidden="true"
                >
                  {initial(user)}
                </div>
              )}
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

            {/* 编辑表单 */}
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">编辑个人资料</h3>
              <div>
                <label
                  htmlFor="displayName"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  显示名
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  maxLength={64}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                />
              </div>
              {profileErr && (
                <p className="text-sm text-rose-600" role="alert">
                  {profileErr}
                </p>
              )}
              {profileMsg && <p className="text-sm text-emerald-600">{profileMsg}</p>}
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                更新资料
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 修改密码卡片 */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Lock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            修改密码
          </h2>
        </div>
        <div className="p-6">
          {!user.hasPassword && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 text-sm text-slate-700">
              <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p>当前账号通过 linux.do 登录，未设置密码</p>
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="oldPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                原密码
              </label>
              <input
                id="oldPassword"
                type="password"
                value={oldPassword}
                disabled={!user.hasPassword}
                autoComplete="current-password"
                onChange={(e) => setOldPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                新密码
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                disabled={!user.hasPassword}
                autoComplete="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                确认新密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                disabled={!user.hasPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            {pwdErr && (
              <p className="text-sm text-rose-600" role="alert">
                {pwdErr}
              </p>
            )}
            {pwdMsg && <p className="text-sm text-emerald-600">{pwdMsg}</p>}
            <button
              type="submit"
              disabled={!user.hasPassword || savingPwd}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              修改密码
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
```

> **注意：** ProfilePage 现在不再渲染自己的标题栏 logo——全局 Header（Plan 1 已加）会在 profile 视图上方显示。本页保留「返回 + 个人中心」二级标题。

- [ ] **运行测试确认通过**

```bash
npx vitest run src/pages/ProfilePage.test.tsx
```

Expected: 全部 PASS。

### Step 3: 提交 ProfilePage

- [ ] **提交**

```bash
git add src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx
git commit -m "refactor(frontend): 重构 ProfilePage 对齐原型样式

- 两张卡片改用 rounded-2xl + 渐变表头
- 头像改为圆角方形（rounded-2xl）+ shadow-lg + ring
- 只读信息用 grid 布局，按钮 emerald 渐变
- 改用 Tailwind 原子类，保留所有功能行为
- 对齐 design-prototype.html section-2"
```

---

## Plan 2 完成检查点

- [ ] Task C: UserMenu 重构完成
  - 触发按钮显示头像 + 用户名 + 箭头
  - 富信息下拉头部 + 三个菜单项
  - 测试通过、提交
- [ ] Task D: LoginPage 重构完成
  - 按钮选择 + 表单切换，保留 onLogin 功能
  - 测试通过、提交
- [ ] Task E: ProfilePage 重构完成
  - 渐变卡片 + 圆角方形头像
  - 测试通过、提交
- [ ] **跑全量测试确认 Plan 1 + Plan 2 范围内无回归**

```bash
npx vitest run src/components/UserMenu.test.tsx src/components/Header.test.tsx src/pages/LoginPage.test.tsx src/pages/ProfilePage.test.tsx
```

**下一步：** 执行 Plan 3（数据管理页面重构：AccountsPage 工具栏 + 表格 + MailListPage + 全局验证）
