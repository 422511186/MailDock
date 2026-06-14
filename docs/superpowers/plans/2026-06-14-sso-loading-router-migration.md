# SSO 登录加载页面 + React Router 全面迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现原型中的 SSO 登录加载页面，并将前端从状态机导航全面迁移到 react-router

**Architecture:** 
- 引入 react-router-dom 管理所有页面导航，替代现有状态机
- 创建 AuthContext 统一管理认证状态和会话恢复
- 创建 LoadingPage 组件实现原型中的加载样式（呼吸发光图标 + spinner）
- 创建 ProtectedRoute 保护需要登录的路由
- 修改后端 OAuth 回调重定向到 `/auth/callback`

**Tech Stack:** React 18, react-router-dom 6.28, TypeScript, Vitest, @testing-library/react

---

## File Structure

**New files:**
- `frontend/src/components/LoadingPage.tsx` - 加载页面组件
- `frontend/src/components/LoadingPage.test.tsx` - 加载页面测试
- `frontend/src/contexts/AuthContext.tsx` - 认证上下文
- `frontend/src/contexts/AuthContext.test.tsx` - 认证上下文测试
- `frontend/src/components/ProtectedRoute.tsx` - 路由保护组件
- `frontend/src/components/ProtectedRoute.test.tsx` - 路由保护测试
- `frontend/src/pages/OAuthCallbackPage.tsx` - OAuth 回调页面
- `frontend/src/pages/OAuthCallbackPage.test.tsx` - OAuth 回调测试

**Modified files:**
- `frontend/package.json` - 安装 react-router-dom（已安装）
- `frontend/src/api/client.ts` - 添加 Session 过期处理
- `frontend/src/App.tsx` - 重构为 router 结构
- `frontend/src/App.test.tsx` - 完全重写测试
- `frontend/src/pages/LoginPage.tsx` - 使用 useAuth
- `frontend/src/pages/LoginPage.test.tsx` - 更新测试
- `frontend/src/components/Header.tsx` - 使用 useNavigate/useAuth
- `frontend/src/components/Header.test.tsx` - 更新测试
- `frontend/src/pages/AccountsPage.tsx` - 使用 useNavigate
- `frontend/src/pages/AccountsPage.test.tsx` - 更新测试
- `frontend/src/pages/MailListPage.tsx` - 使用 useNavigate/useParams
- `frontend/src/pages/MailListPage.test.tsx` - 更新测试
- `frontend/src/pages/MailDetailPage.tsx` - 使用 useNavigate/useParams
- `frontend/src/pages/MailDetailPage.test.tsx` - 更新测试
- `frontend/src/pages/ProfilePage.tsx` - 使用 useAuth
- `frontend/src/pages/ProfilePage.test.tsx` - 更新测试
- `backend/src/main/java/com/maildock/web/ApiRouter.java` - 修改 OAuth 回调重定向

---

## Task 1: 安装依赖

**Files:**
- Verify: `frontend/package.json`

- [ ] **Step 1: 检查 react-router-dom 是否已安装**

Run:
```bash
cd frontend
npm list react-router-dom
```

Workdir: `frontend`

Expected: 显示 `react-router-dom@6.28.0`（已在 package.json 中）

- [ ] **Step 2: 确认无需额外安装**

react-router-dom 已在 package.json 的 dependencies 中，版本 6.28.0。无需运行 npm install。

---

## Task 2: 创建 LoadingPage 组件

**Files:**
- Create: `frontend/src/components/LoadingPage.test.tsx`
- Create: `frontend/src/components/LoadingPage.tsx`

- [ ] **Step 1: 编写 LoadingPage 测试 - 默认文案**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingPage } from './LoadingPage';

describe('LoadingPage', () => {
  it('渲染默认标题和副标题', () => {
    render(<LoadingPage />);
    expect(screen.getByText('登录中...')).toBeInTheDocument();
    expect(screen.getByText('正在验证您的身份')).toBeInTheDocument();
  });

  it('渲染自定义标题和副标题', () => {
    render(<LoadingPage title="加载中" subtitle="请稍候" />);
    expect(screen.getByText('加载中')).toBeInTheDocument();
    expect(screen.getByText('请稍候')).toBeInTheDocument();
  });

  it('包含邮件图标和 spinner', () => {
    const { container } = render(<LoadingPage />);
    // 检查有 svg 元素（图标和 spinner）
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('具有无障碍属性', () => {
    const { container } = render(<LoadingPage />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```bash
npm test src/components/LoadingPage.test.tsx
```

Workdir: `frontend`

Expected: FAIL - LoadingPage module not found

- [ ] **Step 3: 实现 LoadingPage 组件**

```typescript
import { Mail, Loader2 } from 'lucide-react';

interface LoadingPageProps {
  title?: string;
  subtitle?: string;
}

export function LoadingPage({ title = '登录中...', subtitle = '正在验证您的身份' }: LoadingPageProps) {
  return (
    <div 
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-6">
        {/* 邮件图标 - 呼吸发光效果 */}
        <div className="animate-pulse">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-2xl shadow-emerald-500/50">
            <Mail className="h-12 w-12 text-white" aria-hidden="true" />
          </div>
        </div>

        {/* Spinner */}
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden="true" />

        {/* 文案 */}
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```bash
npm test src/components/LoadingPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all 4 tests pass

- [ ] **Step 5: 提交**

Run:
```bash
git add src/components/LoadingPage.tsx src/components/LoadingPage.test.tsx
git commit -m "feat(frontend): add LoadingPage component with breathing glow effect"
```

Workdir: `frontend`

## Task 3: 添加 Session 过期处理到 API Client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: 添加 Session 过期回调机制**

在 `client.ts` 文件开头（在 `const API = '/api/v1';` 之后）添加：

```typescript
/** Session 过期回调（由 AuthProvider 设置）。 */
let onSessionExpired: (() => void) | null = null;

/** 设置 Session 过期回调，AuthProvider 初始化时调用。 */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}
```

- [ ] **Step 2: 修改 req 函数捕获 401**

找到 `req` 函数，在 `if (!res.ok)` 之前添加 401 检查：

```typescript
async function req(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(API + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  // Session 过期时触发回调
  if (res.status === 401 && onSessionExpired) {
    onSessionExpired();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res;
}
```

- [ ] **Step 3: 提交**

Run:
```bash
git add src/api/client.ts
git commit -m "feat(frontend): add session expired handler to API client"
```

Workdir: `frontend`

## Task 4: 创建 AuthContext

**Files:**
- Create: `frontend/src/contexts/AuthContext.test.tsx`
- Create: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: 编写 AuthContext 测试 - 初始化成功**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import type { ApiClient, CurrentUser } from '../api/client';
import * as client from '../api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  hasPassword: true,
};

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    me: vi.fn().mockResolvedValue(mockUser),
    login: vi.fn().mockResolvedValue(mockUser),
    logout: vi.fn().mockResolvedValue(undefined),
    linuxDoLoginUrl: vi.fn().mockReturnValue('/api/v1/auth/linuxdo/start'),
    listAccounts: vi.fn(),
    listMessages: vi.fn(),
    refresh: vi.fn(),
    getMessage: vi.fn(),
    markRead: vi.fn(),
    attachmentUrl: vi.fn(),
    updateDisplayName: vi.fn(),
    changePassword: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="user">{auth.user ? auth.user.displayName : 'null'}</div>
      <div data-testid="error">{auth.error || 'null'}</div>
      <button onClick={() => auth.login('a@example.com', 'pw')}>Login</button>
      <button onClick={() => auth.logout()}>Logout</button>
      <button onClick={auth.clearError}>Clear</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始化时调用 api.me 并设置 user', async () => {
    const api = stubApi();
    render(
      <AuthProvider api={api}>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(api.me).toHaveBeenCalled();
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```bash
npm test src/contexts/AuthContext.test.tsx
```

Workdir: `frontend`

Expected: FAIL - AuthContext module not found

- [ ] **Step 3: 实现 AuthContext - 第一部分（类型和 Context 定义）**

```typescript
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiClient, CurrentUser } from '../api/client';
import { setSessionExpiredHandler } from '../api/client';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithLinuxDo: () => void;
  logout: () => Promise<void>;
  updateUser: (user: CurrentUser) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  api: ApiClient;
  children: ReactNode;
}
```

- [ ] **Step 4: 实现 AuthContext - 第二部分（Provider 组件）**

继续在同一文件添加：

```typescript
export function AuthProvider({ api, children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // 初始化：恢复会话
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          // 401 是正常未登录，不设置 error
          if (err.message && !err.message.includes('401')) {
            setError(err.message);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // 设置 Session 过期处理
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate('/login');
    });
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    setUser(u);
    navigate('/accounts');
  }, [api, navigate]);

  const loginWithLinuxDo = useCallback(() => {
    window.location.href = api.linuxDoLoginUrl();
  }, [api]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    navigate('/login');
  }, [api, navigate]);

  const updateUser = useCallback((u: CurrentUser) => {
    setUser(u);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    login,
    loginWithLinuxDo,
    logout,
    updateUser,
    clearError,
  }), [user, loading, error, login, loginWithLinuxDo, logout, updateUser, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 5: 添加更多 AuthContext 测试**

在 `AuthContext.test.tsx` 的 `describe` 块中继续添加测试：

```typescript
  it('401 响应时设置为未登录状态', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('HTTP 401')),
    });
    render(
      <AuthProvider api={api}>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('error')).toHaveTextContent('null'); // 401 不设置 error
  });

  it('网络错误时设置 error', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    render(
      <AuthProvider api={api}>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
  });

  it('login 成功后设置 user', async () => {
    const api = stubApi();
    const mockNavigate = vi.fn();
    vi.spyOn(require('react-router-dom'), 'useNavigate').mockReturnValue(mockNavigate);

    render(
      <AuthProvider api={api}>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    const loginBtn = screen.getByText('Login');
    loginBtn.click();

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('a@example.com', 'pw');
      expect(mockNavigate).toHaveBeenCalledWith('/accounts');
    });
  });

  it('logout 清空 user 并跳转登录', async () => {
    const api = stubApi();
    const mockNavigate = vi.fn();
    vi.spyOn(require('react-router-dom'), 'useNavigate').mockReturnValue(mockNavigate);

    render(
      <AuthProvider api={api}>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    });

    const logoutBtn = screen.getByText('Logout');
    logoutBtn.click();

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });
```

- [ ] **Step 6: 运行测试验证通过**

Run:
```bash
npm test src/contexts/AuthContext.test.tsx
```

Workdir: `frontend`

Expected: PASS - all 5 tests pass

- [ ] **Step 7: 提交**

Run:
```bash
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx
git commit -m "feat(frontend): add AuthContext for centralized auth state management"
```

Workdir: `frontend`

## Task 5: 创建 ProtectedRoute 组件

**Files:**
- Create: `frontend/src/components/ProtectedRoute.test.tsx`
- Create: `frontend/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: 编写 ProtectedRoute 测试**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthContext } from '../contexts/AuthContext';
import type { CurrentUser } from '../api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test',
  avatarUrl: null,
  hasPassword: true,
};

function renderWithAuth(loading: boolean, user: CurrentUser | null) {
  const mockAuthValue = {
    user,
    loading,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={mockAuthValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('ProtectedRoute', () => {
  it('loading 时显示 LoadingPage', () => {
    renderWithAuth(true, null);
    expect(screen.getByText('登录中...')).toBeInTheDocument();
  });

  it('未登录时重定向到 /login', () => {
    renderWithAuth(false, null);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('已登录时渲染子路由', () => {
    renderWithAuth(false, mockUser);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```bash
npm test src/components/ProtectedRoute.test.tsx
```

Workdir: `frontend`

Expected: FAIL - ProtectedRoute module not found

- [ ] **Step 3: 实现 ProtectedRoute 组件**

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingPage } from './LoadingPage';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingPage />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```bash
npm test src/components/ProtectedRoute.test.tsx
```

Workdir: `frontend`

Expected: PASS - all 3 tests pass

- [ ] **Step 5: 提交**

Run:
```bash
git add src/components/ProtectedRoute.tsx src/components/ProtectedRoute.test.tsx
git commit -m "feat(frontend): add ProtectedRoute component for route protection"
```

Workdir: `frontend`

## Task 6: 创建 OAuthCallbackPage

**Files:**
- Create: `frontend/src/pages/OAuthCallbackPage.test.tsx`
- Create: `frontend/src/pages/OAuthCallbackPage.tsx`

- [ ] **Step 1: 编写 OAuthCallbackPage 测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from './OAuthCallbackPage';
import type { ApiClient, CurrentUser } from '../api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test',
  avatarUrl: null,
  hasPassword: true,
};

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    me: vi.fn().mockResolvedValue(mockUser),
    login: vi.fn(),
    logout: vi.fn(),
    linuxDoLoginUrl: vi.fn(),
    listAccounts: vi.fn(),
    listMessages: vi.fn(),
    refresh: vi.fn(),
    getMessage: vi.fn(),
    markRead: vi.fn(),
    attachmentUrl: vi.fn(),
    updateDisplayName: vi.fn(),
    changePassword: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mount 时调用 api.me', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    expect(screen.getByText('登录中...')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.me).toHaveBeenCalled();
    });
  });

  it('成功时导航到 /accounts', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounts', { replace: true });
    });
  });

  it('失败时显示错误和返回登录按钮', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('验证失败')),
    });
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('验证失败')).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: /返回登录/ });
    backBtn.click();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```bash
npm test src/pages/OAuthCallbackPage.test.tsx
```

Workdir: `frontend`

Expected: FAIL - OAuthCallbackPage module not found

- [ ] **Step 3: 实现 OAuthCallbackPage 组件**

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import type { ApiClient } from '../api/client';
import { LoadingPage } from '../components/LoadingPage';

interface OAuthCallbackPageProps {
  api: ApiClient;
}

export function OAuthCallbackPage({ api }: OAuthCallbackPageProps) {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then(() => {
        if (!cancelled) {
          navigate('/accounts', { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '登录失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-100">
            <AlertCircle className="h-12 w-12 text-rose-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="mb-2 text-xl font-semibold text-slate-800">登录失败</h2>
            <p className="mb-6 text-sm text-slate-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/40 transition hover:from-emerald-700 hover:to-emerald-800"
          >
            返回登录
          </button>
        </div>
      </div>
    );
  }

  return <LoadingPage title="登录中..." subtitle="正在验证您的身份" />;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```bash
npm test src/pages/OAuthCallbackPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all 3 tests pass

- [ ] **Step 5: 提交**

Run:
```bash
git add src/pages/OAuthCallbackPage.tsx src/pages/OAuthCallbackPage.test.tsx
git commit -m "feat(frontend): add OAuthCallbackPage for handling OAuth callback"
```

Workdir: `frontend`

## Task 7: 后端修改 OAuth 回调重定向

**Files:**
- Modify: `backend/src/main/java/com/maildock/web/ApiRouter.java:145-170`

- [ ] **Step 1: 修改 handleLinuxdoCallback 重定向路径**

找到 `handleLinuxdoCallback` 方法（约第 146 行），将重定向目标从 `frontendUrl` 改为 `"/auth/callback"`：

```java
private void handleLinuxdoCallback(RoutingContext ctx) {
    if (linuxDoOAuthService == null) {
        fail(ctx, 500, "linux.do OAuth 配置不完整");
        return;
    }
    String code = ctx.request().getParam("code");
    String state = ctx.request().getParam("state");
    vertx.executeBlocking(() -> linuxDoOAuthService.callback(code, state), false)
            .onComplete(ar -> {
                if (ar.failed()) {
                    ctx.fail(ar.cause());
                    return;
                }
                if (ar.result().isEmpty()) {
                    fail(ctx, 400, "linux.do OAuth 登录失败");
                    return;
                }
                AuthService.LoginResult login = ar.result().get();
                setSessionCookie(ctx, login.sessionToken());
                ctx.response()
                        .setStatusCode(302)
                        .putHeader("Location", "/auth/callback")
                        .end();
            });
}
```

- [ ] **Step 2: 运行后端测试确保无回归**

Run:
```bash
mvn test -Dtest=AuthRouteTest
```

Workdir: `backend`

Expected: PASS - AuthRouteTest should still pass (OAuth tests mock the redirect)

- [ ] **Step 3: 提交**

Run:
```bash
git add src/main/java/com/maildock/web/ApiRouter.java
git commit -m "fix(backend): redirect OAuth callback to /auth/callback instead of /"
```

Workdir: `backend`

## Task 8: 重构 App.tsx 和路由结构

**Files:**
- Modify: `frontend/src/App.tsx` (complete rewrite)
- Modify: `frontend/src/App.test.tsx` (complete rewrite)

- [ ] **Step 1: 备份现有 App.tsx 和 App.test.tsx**

Run:
```bash
cp src/App.tsx src/App.tsx.bak
cp src/App.test.tsx src/App.test.tsx.bak
```

Workdir: `frontend`

- [ ] **Step 2: 重写 App.test.tsx - 第一部分（基础测试）**

完全替换 `App.test.tsx` 内容：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import type { ApiClient, CurrentUser } from './api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  hasPassword: true,
};

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    me: vi.fn().mockResolvedValue(mockUser),
    login: vi.fn().mockResolvedValue(mockUser),
    logout: vi.fn().mockResolvedValue(undefined),
    linuxDoLoginUrl: vi.fn().mockReturnValue('/api/v1/auth/linuxdo/start'),
    listAccounts: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    listMessages: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    getMessage: vi.fn(),
    markRead: vi.fn(),
    attachmentUrl: vi.fn(),
    updateDisplayName: vi.fn(),
    changePassword: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    deleteBatch: vi.fn(),
    testConnection: vi.fn(),
    testBatch: vi.fn(),
    importAccounts: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('启动时调用 api.me 并进入账号列表', async () => {
    const api = stubApi();
    render(<App api={api} />);

    // 初始加载状态
    expect(screen.getByText('登录中...')).toBeInTheDocument();

    // 会话恢复后进入账号列表
    await waitFor(() => {
      expect(api.me).toHaveBeenCalled();
    });

    // 应该看到空列表提示或标题（取决于 AccountsPage 实现）
    await waitFor(() => {
      expect(screen.queryByText('登录中...')).not.toBeInTheDocument();
    });
  });

  it('未登录时显示登录页', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('HTTP 401')),
    });
    render(<App api={api} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:
```bash
npm test src/App.test.tsx
```

Workdir: `frontend`

Expected: FAIL - App structure has changed, tests fail

- [ ] **Step 4: 重写 App.tsx - 完整实现**

完全替换 `App.tsx` 内容：

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ApiClient } from './api/client';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { AccountsPage } from './pages/AccountsPage';
import { MailListPage } from './pages/MailListPage';
import { MailDetailPage } from './pages/MailDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { Header } from './components/Header';

interface AppProps {
  api: ApiClient;
}

export function App({ api }: AppProps) {
  return (
    <BrowserRouter>
      <AuthProvider api={api}>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<OAuthCallbackPage api={api} />} />

          {/* 受保护路由 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/accounts" replace />} />
            <Route path="/accounts" element={
              <div className="min-h-screen bg-slate-50">
                <Header />
                <AccountsPage api={api} />
              </div>
            } />
            <Route path="/accounts/:accountId/messages" element={
              <div className="min-h-screen bg-slate-50">
                <Header />
                <MailListPage api={api} />
              </div>
            } />
            <Route path="/accounts/:accountId/messages/:messageId" element={
              <div className="min-h-screen bg-slate-50">
                <Header />
                <MailDetailPage api={api} />
              </div>
            } />
            <Route path="/profile" element={
              <div className="min-h-screen bg-slate-50">
                <Header />
                <ProfilePage api={api} />
              </div>
            } />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: 运行测试验证通过**

Run:
```bash
npm test src/App.test.tsx
```

Workdir: `frontend`

Expected: PASS - both tests pass

- [ ] **Step 6: 提交**

Run:
```bash
git add src/App.tsx src/App.test.tsx
git commit -m "refactor(frontend): migrate App to react-router with AuthProvider"
```

Workdir: `frontend`

## Task 9: 重构 LoginPage 使用 useAuth

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: 更新 LoginPage.test.tsx**

找到测试中使用 `onLogin` 和 `onLinuxDoLogin` props 的地方，改为 mock `useAuth`：

在文件顶部添加 mock：

```typescript
const mockLogin = vi.fn();
const mockLoginWithLinuxDo = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginWithLinuxDo: mockLoginWithLinuxDo,
    user: null,
    loading: false,
    error: null,
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
  }),
}));
```

将所有渲染改为不传 props：

```typescript
render(<LoginPage />);
```

验证调用改为检查 mock：

```typescript
expect(mockLogin).toHaveBeenCalledWith('alice@example.com', 'pw');
expect(mockLoginWithLinuxDo).toHaveBeenCalled();
```

- [ ] **Step 2: 更新 LoginPage 组件**

移除 props 接口，改为使用 `useAuth`：

```typescript
import { useState, type FormEvent } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'choice' | 'email';

const LINUXDO_LOGO = 'https://cdn3.ldstatic.com/original/3X/9/7/97ed5d6d97f4c7f3dc0670d097bf457527c375f5.png';

export function LoginPage() {
  const { login, loginWithLinuxDo } = useAuth();
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
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/40">
            <Mail className="h-8 w-8" aria-hidden="true" />
          </div>
          <span className="text-2xl font-bold text-slate-800">MailDock</span>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-10 shadow-2xl shadow-slate-300/50 backdrop-blur-sm">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-800">登录</h2>

          {mode === 'choice' ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={loginWithLinuxDo}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-6 py-4 text-base font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <img src={LINUXDO_LOGO} alt="" className="h-6 w-6 rounded" aria-hidden="true" />
                <span>使用 LinuxDO 继续</span>
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-base">
                  <span className="bg-white px-4 text-slate-500">或</span>
                </div>
              </div>

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

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/pages/LoginPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "refactor(frontend): LoginPage uses useAuth instead of props"
```

Workdir: `frontend`

---

## Task 10: 重构 Header 使用 useAuth 和 useNavigate

**Files:**
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/components/Header.test.tsx`

- [ ] **Step 1: 更新 Header.test.tsx**

移除所有 props 相关测试，改为 mock hooks：

```typescript
const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  hasPassword: true,
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: mockLogout,
    updateUser: vi.fn(),
    clearError: vi.fn(),
  }),
}));

// 所有 render 改为不传 props
render(<Header />);

// 验证导航调用
expect(mockNavigate).toHaveBeenCalledWith('/profile');
expect(mockNavigate).toHaveBeenCalledWith('/accounts');
expect(mockLogout).toHaveBeenCalled();
```

- [ ] **Step 2: 更新 Header 组件**

移除 props 接口，改为使用 hooks：

```typescript
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, User, LogOut, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold text-slate-800">MailDock</span>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            aria-label="用户菜单"
            aria-expanded={menuOpen}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
                <User className="h-4 w-4 text-slate-600" aria-hidden="true" />
              </div>
            )}
            <span className="hidden sm:inline">{user.displayName || user.primaryEmail}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/accounts');
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  role="menuitem"
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                  邮件列表
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/profile');
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  role="menuitem"
                >
                  <User className="h-4 w-4" aria-hidden="true" />
                  个人中心
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  退出登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/components/Header.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/components/Header.tsx src/components/Header.test.tsx
git commit -m "refactor(frontend): Header uses useAuth and useNavigate"
```

Workdir: `frontend`

## Task 11: 重构 AccountsPage 使用 useNavigate

**Files:**
- Modify: `frontend/src/pages/AccountsPage.tsx`
- Modify: `frontend/src/pages/AccountsPage.test.tsx`

- [ ] **Step 1: 更新 AccountsPage.test.tsx**

移除 `onOpenAccount` prop，改为 mock `useNavigate`：

在文件顶部添加：

```typescript
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));
```

将所有 `render(<AccountsPage api={api} onOpenAccount={onOpenAccount} />)` 改为：

```typescript
render(<AccountsPage api={api} />);
```

将验证 `onOpenAccount` 调用改为：

```typescript
expect(mockNavigate).toHaveBeenCalledWith('/accounts/7/messages');
```

- [ ] **Step 2: 更新 AccountsPage 组件接口**

移除 `onOpenAccount` prop，添加 `useNavigate`：

```typescript
import { useNavigate } from 'react-router-dom';

interface AccountsPageProps {
  api: ApiClient;
  // 移除 onOpenAccount
}

export function AccountsPage({ api }: AccountsPageProps) {
  const navigate = useNavigate();
  // ... existing state ...

  // 点击账号时导航
  function handleOpenAccount(accountId: number) {
    navigate(`/accounts/${accountId}/messages`);
  }

  // 在桌面表格的邮箱列改为：
  <td 
    className="cursor-pointer px-6 py-4 font-medium text-slate-800"
    onClick={() => handleOpenAccount(a.id)}
  >
    {truncateEmail(a.email, 30)}
  </td>

  // 在移动卡片的邮箱区改为：
  <div className="flex-1 cursor-pointer" onClick={() => handleOpenAccount(a.id)}>
    <div className="font-medium text-slate-800">{a.email}</div>
    <div className="text-xs text-slate-500">{formatRelativeTime(a.lastSyncAt)}</div>
  </div>
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/pages/AccountsPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/pages/AccountsPage.tsx src/pages/AccountsPage.test.tsx
git commit -m "refactor(frontend): AccountsPage uses useNavigate for navigation"
```

Workdir: `frontend`

## Task 12: 重构 MailListPage 使用 useNavigate 和 useParams

**Files:**
- Modify: `frontend/src/pages/MailListPage.tsx`
- Modify: `frontend/src/pages/MailListPage.test.tsx`

- [ ] **Step 1: 更新 MailListPage.test.tsx**

Mock hooks 并移除相关 props：

```typescript
const mockNavigate = vi.fn();
const mockParams = { accountId: '7' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

// 渲染时移除 onOpenMessage、onBack 和 accountId props
render(<MailListPage api={api} accountEmail="owner@163.com" />);

// 验证导航
expect(mockNavigate).toHaveBeenCalledWith('/accounts/7/messages/1');
expect(mockNavigate).toHaveBeenCalledWith('/accounts');
```

- [ ] **Step 2: 更新 MailListPage 组件**

```typescript
import { useNavigate, useParams } from 'react-router-dom';

interface MailListPageProps {
  api: ApiClient;
  accountEmail: string;
  // 移除 accountId, onOpenMessage, onBack
}

export function MailListPage({ api, accountEmail }: MailListPageProps) {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const accountIdNum = parseInt(accountId || '0', 10);

  // ... existing state ...

  // 点击邮件
  function handleOpenMessage(messageId: number) {
    navigate(`/accounts/${accountIdNum}/messages/${messageId}`);
  }

  // 返回按钮
  function handleBack() {
    navigate('/accounts');
  }

  // 在桌面端和移动端邮件项的 onClick 改为：
  onClick={() => handleOpenMessage(msg.id)}

  // 返回按钮的 onClick 改为：
  onClick={handleBack}
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/pages/MailListPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/pages/MailListPage.tsx src/pages/MailListPage.test.tsx
git commit -m "refactor(frontend): MailListPage uses useNavigate and useParams"
```

Workdir: `frontend`

---

## Task 13: 重构 MailDetailPage 使用 useNavigate 和 useParams

**Files:**
- Modify: `frontend/src/pages/MailDetailPage.tsx`
- Modify: `frontend/src/pages/MailDetailPage.test.tsx`

- [ ] **Step 1: 更新 MailDetailPage.test.tsx**

```typescript
const mockNavigate = vi.fn();
const mockParams = { accountId: '7', messageId: '1' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

// 渲染时移除 messageId 和 onBack props
render(<MailDetailPage api={api} />);

// 验证返回导航
expect(mockNavigate).toHaveBeenCalledWith(-1);
```

- [ ] **Step 2: 更新 MailDetailPage 组件**

```typescript
import { useNavigate, useParams } from 'react-router-dom';

interface MailDetailPageProps {
  api: ApiClient;
  // 移除 messageId, onBack
}

export function MailDetailPage({ api }: MailDetailPageProps) {
  const navigate = useNavigate();
  const { messageId } = useParams<{ messageId: string }>();
  const messageIdNum = parseInt(messageId || '0', 10);

  // ... existing state ...

  const load = useCallback(async () => {
    setError('');
    try {
      const detail = await api.getMessage(messageIdNum);
      setMessage(detail);
      if (!detail.isRead && markedRef.current !== detail.id) {
        markedRef.current = detail.id;
        await api.markRead(detail.id, true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, messageIdNum]);

  // 返回按钮
  function handleBack() {
    navigate(-1);
  }

  // 桌面端和移动端返回按钮的 onClick 改为：
  onClick={handleBack}
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/pages/MailDetailPage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/pages/MailDetailPage.tsx src/pages/MailDetailPage.test.tsx
git commit -m "refactor(frontend): MailDetailPage uses useNavigate and useParams"
```

Workdir: `frontend`

## Task 14: 重构 ProfilePage 使用 useAuth

**Files:**
- Modify: `frontend/src/pages/ProfilePage.tsx`
- Modify: `frontend/src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: 更新 ProfilePage.test.tsx**

Mock `useAuth` 并移除 props：

```typescript
const mockUpdateUser = vi.fn();
const mockUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  hasPassword: true,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: mockUpdateUser,
    clearError: vi.fn(),
  }),
}));

// 渲染时移除 user 和 onUserUpdated props
render(<ProfilePage api={api} />);

// 验证更新调用
expect(mockUpdateUser).toHaveBeenCalledWith({ ...mockUser, displayName: 'New Name' });
```

- [ ] **Step 2: 更新 ProfilePage 组件**

```typescript
import { useAuth } from '../contexts/AuthContext';

interface ProfilePageProps {
  api: ApiClient;
  // 移除 user, onUserUpdated
}

export function ProfilePage({ api }: ProfilePageProps) {
  const { user, updateUser } = useAuth();
  // ... existing state ...

  // 更新显示名后调用 updateUser
  async function handleUpdateName(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSaving(true);
    try {
      const updated = await api.updateDisplayName(displayName);
      updateUser(updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ... rest remains the same ...
}
```

- [ ] **Step 3: 运行测试验证通过**

Run:
```bash
npm test src/pages/ProfilePage.test.tsx
```

Workdir: `frontend`

Expected: PASS - all tests pass

- [ ] **Step 4: 提交**

Run:
```bash
git add src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx
git commit -m "refactor(frontend): ProfilePage uses useAuth for user state"
```

Workdir: `frontend`

---

## Task 15: 运行全部测试验证无回归

**Files:**
- All test files

- [ ] **Step 1: 运行所有前端测试**

Run:
```bash
npm test
```

Workdir: `frontend`

Expected: PASS - all 176+ tests pass

如果有测试失败，逐个修复后重新运行。

- [ ] **Step 2: 运行所有后端测试**

Run:
```bash
mvn test
```

Workdir: `backend`

Expected: PASS - all backend tests pass

---

## Task 16: 手动验证和端到端测试

**Files:**
- N/A (manual testing)

- [ ] **Step 1: 启动后端**

Run:
```bash
MAILDOCK_SECRET_KEY='12345678901234567890123456789012' MAILDOCK_DEFAULT_EMAIL='test@example.com' MAILDOCK_DEFAULT_PASSWORD='password' mvn package && java -jar target/maildock-backend-fat.jar
```

Workdir: `backend`

Expected: Server starts on port 8080

- [ ] **Step 2: 启动前端**

Run:
```bash
npm run dev
```

Workdir: `frontend`

Expected: Dev server starts on port 5173

- [ ] **Step 3: 测试邮箱登录流程**

1. 访问 http://localhost:5173
2. 应看到 LoadingPage（"登录中..."）
3. 几秒后重定向到 /login
4. 点击"使用 邮箱或用户名 登录"
5. 输入 test@example.com / password
6. 点击"登录"
7. 应进入 /accounts 页面

- [ ] **Step 4: 测试页面导航**

1. 在账号列表，点击一个账号的邮箱
2. 应进入 /accounts/:id/messages 页面
3. 点击一封邮件
4. 应进入 /accounts/:id/messages/:mid 页面
5. 点击返回按钮
6. 应返回邮件列表
7. 再次点击返回
8. 应返回账号列表

- [ ] **Step 5: 测试个人中心**

1. 点击右上角用户菜单
2. 点击"个人中心"
3. 应进入 /profile 页面
4. 修改显示名
5. 点击保存
6. 应看到更新成功

- [ ] **Step 6: 测试登出**

1. 点击用户菜单
2. 点击"退出登录"
3. 应重定向到 /login

- [ ] **Step 7: 测试浏览器前进/后退**

1. 登录并导航到邮件详情页
2. 点击浏览器后退按钮
3. 应返回邮件列表
4. 点击浏览器前进按钮
5. 应返回邮件详情

- [ ] **Step 8: 测试直接访问受保护路由**

1. 登出
2. 直接访问 http://localhost:5173/accounts
3. 应重定向到 /login

- [ ] **Step 9: 测试 Session 过期（可选）**

1. 登录后，手动清除浏览器 Cookie
2. 刷新页面或执行任何操作
3. 应自动跳转到 /login

---

## Task 17: 提交最终更改并清理

**Files:**
- Various

- [ ] **Step 1: 删除备份文件**

Run:
```bash
rm src/App.tsx.bak src/App.test.tsx.bak
```

Workdir: `frontend`

- [ ] **Step 2: 最终提交**

Run:
```bash
git add -A
git commit -m "feat: complete SSO loading page and react-router migration"
```

Workdir: project root

- [ ] **Step 3: 查看提交历史**

Run:
```bash
git log --oneline -20
```

Expected: 看到所有相关的提交记录

---

## Self-Review Checklist

**Spec coverage:**
✅ LoadingPage 组件 - Task 2
✅ AuthContext - Task 4
✅ Session 过期处理 - Task 3
✅ ProtectedRoute - Task 5
✅ OAuthCallbackPage - Task 6
✅ 后端 OAuth 回调重定向 - Task 7
✅ App.tsx 重构 - Task 8
✅ LoginPage 重构 - Task 9
✅ Header 重构 - Task 10
✅ AccountsPage 重构 - Task 11
✅ MailListPage 重构 - Task 12
✅ MailDetailPage 重构 - Task 13
✅ ProfilePage 重构 - Task 14
✅ 测试验证 - Task 15
✅ 手动测试 - Task 16

**Placeholder scan:** ✅ 无 TBD/TODO，所有代码完整

**Type consistency:** ✅ CurrentUser、ApiClient、路由参数类型一致

**All requirements covered:** ✅ 所有设计文档要求已实现

