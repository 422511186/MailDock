# SSO 登录加载页面 + React Router 全面迁移

## 概述

实现原型中的 SSO 登录加载页面，并将前端从状态机导航全面迁移到 react-router。当用户通过 linux.do OAuth 登录时，在回调后显示"登录中...正在验证您的身份"加载页面，完成后进入账号列表。

## 背景

**当前实现**：
- 前端使用状态机（`View` 联合类型）在 `App.tsx` 中切换页面
- OAuth 回调直接重定向到 `/`，前端通过 `api.me()` 恢复会话
- 加载状态只显示简单的"加载中..."文本
- 页面间导航通过 props 传递回调函数

**问题**：
1. OAuth 回调后没有原型中的加载页面体验
2. 状态机导航不符合 SPA 标准实践
3. 缺乏 URL 路由，无法直接访问特定页面
4. 页面组件的导航回调传递繁琐

## 目标

1. 实现原型中的 SSO 登录加载页面
2. 引入 react-router 管理所有页面导航
3. 创建统一的认证上下文管理登录状态
4. 优化会话恢复和 Session 过期处理

## 架构设计

### 1. 路由结构

```
/login                              → LoginPage（公开）
/auth/callback                      → OAuthCallbackPage（公开，自动完成认证）
/                                   → 重定向到 /accounts
/accounts                           → AccountsPage（受保护）
/accounts/:accountId/messages       → MailListPage（受保护）
/accounts/:accountId/messages/:mid  → MailDetailPage（受保护）
/profile                            → ProfilePage（受保护）
```

**受保护路由**：需要登录才能访问，未登录时自动重定向到 `/login`。

### 2. 认证上下文（AuthContext）

**目的**：统一管理认证状态，避免重复的会话检查和状态管理。

**接口定义**：
```typescript
interface AuthContextValue {
  user: CurrentUser | null;          // 当前用户，null 表示未登录
  loading: boolean;                   // 是否正在验证会话
  error: string | null;               // 认证错误信息
  login: (email: string, password: string) => Promise<void>;
  loginWithLinuxDo: () => void;       // 跳转到 OAuth
  logout: () => Promise<void>;
  clearError: () => void;
}
```

**AuthProvider 行为**：

1. **初始化（mount 时）**：
   - 设置 `loading = true`
   - 调用 `api.me()` 恢复会话
   - 成功 → 设置 `user`，`loading = false`
   - 401 失败 → `user = null`，`loading = false`（正常未登录，不设 error）
   - 其他错误（500/网络）→ 设置 `error`，`loading = false`

2. **login(email, password)**：
   - 调用 `api.login(email, password)`
   - 成功 → 设置 `user`，`navigate('/accounts')`
   - 失败 → 抛出异常（LoginPage 捕获并显示）

3. **loginWithLinuxDo()**：
   - `window.location.href = api.linuxDoLoginUrl()`
   - 跳转到后端 OAuth 入口

4. **logout()**：
   - 调用 `api.logout()`
   - 设置 `user = null`
   - `navigate('/login')`

5. **Session 过期处理**：
   - 在 `api/client.ts` 的 fetch 封装中捕获 401 响应
   - 通过回调机制通知 AuthContext 清空 `user`
   - 自动跳转到 `/login`

**实现位置**：`frontend/src/contexts/AuthContext.tsx`

### 3. ProtectedRoute 组件

**目的**：保护需要登录的路由。

**逻辑**：
```typescript
function ProtectedRoute() {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;  // 渲染子路由
}
```

- `loading = true` 时显示 LoadingPage
- `user = null` 时重定向到 `/login`
- 已登录时渲染子路由（通过 `<Outlet />`）

**使用方式**：
```tsx
<Route element={<ProtectedRoute />}>
  <Route path="/accounts" element={<AccountsPage />} />
  <Route path="/profile" element={<ProfilePage />} />
  {/* 其他受保护路由 */}
</Route>
```

**实现位置**：`frontend/src/components/ProtectedRoute.tsx`

### 4. LoadingPage 组件

**设计规格**：

- **布局**：全屏居中，与 LoginPage 相同的渐变背景
- **图标**：emerald 渐变圆形背景 + Mail 图标，带呼吸发光效果
- **Spinner**：图标下方显示 `Loader2` 旋转动画
- **文案**：可配置的 title 和 subtitle

**Props 接口**：
```typescript
interface LoadingPageProps {
  title?: string;      // 默认 "登录中..."
  subtitle?: string;   // 默认 "正在验证您的身份"
}
```

**视觉效果**：
- 背景：`bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50`
- 图标容器：圆形，emerald 渐变，shadow-xl
- 动画：
  - 图标 + 外圈：`animate-pulse` 呼吸效果
  - Shadow：通过 CSS keyframes 实现光晕强度变化
  - Spinner：`animate-spin` 旋转

**实现位置**：`frontend/src/components/LoadingPage.tsx`

### 5. OAuthCallbackPage

**目的**：处理 OAuth 回调，显示加载页面并完成会话恢复。

**页面流程**：
1. 渲染 `<LoadingPage title="登录中..." subtitle="正在验证您的身份" />`
2. `useEffect` 中调用 `api.me()`（后端已在回调时设置 Cookie）
3. 成功 → `navigate('/accounts', { replace: true })`
4. 失败 → 显示错误状态

**错误状态 UI**：
- 保持相同的背景和布局
- 显示错误图标（AlertCircle）
- 错误文案
- 主要操作按钮："返回登录" → `navigate('/login')`

**实现位置**：`frontend/src/pages/OAuthCallbackPage.tsx`

### 6. App.tsx 重构

**变更**：
- 移除现有的 `View` 状态机
- 用 `<BrowserRouter>` + `<Routes>` 替代
- 在根层级包裹 `<AuthProvider>`

**新结构**：
```tsx
<AuthProvider api={api}>
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/accounts" replace />} />
        <Route path="/accounts" element={<AccountsPageWrapper />} />
        <Route path="/accounts/:accountId/messages" element={<MailListPageWrapper />} />
        <Route path="/accounts/:accountId/messages/:messageId" element={<MailDetailPageWrapper />} />
        <Route path="/profile" element={<ProfilePageWrapper />} />
      </Route>
    </Routes>
  </BrowserRouter>
</AuthProvider>
```

**Wrapper 组件**：
- 每个页面需要 Wrapper 来：
  1. 渲染 `<Header />` 组件
  2. 从 `useParams()` 提取路由参数传给页面组件
  3. 提供 `bg-slate-50` 背景的容器

### 7. 页面组件调整

**所有页面的导航改动**：

**AccountsPage**：
- 移除 `onOpenAccount` prop
- 点击账号时：`navigate(/accounts/${accountId}/messages)`
- 内部使用 `useNavigate()` hook

**MailListPage**：
- 移除 `onOpenMessage` 和 `onBack` props
- 从路由参数获取 `accountId`：`const { accountId } = useParams()`
- 点击邮件时：`navigate(/accounts/${accountId}/messages/${messageId})`
- 返回按钮：`navigate('/accounts')`

**MailDetailPage**：
- 移除 `onBack` prop
- 从路由参数获取 `messageId` 和 `accountId`
- 返回按钮：`navigate(-1)` 或 `navigate(/accounts/${accountId}/messages)`

**ProfilePage**：
- 用户资料更新后通过 `useAuth()` 更新全局 user 状态
- 调用 AuthContext 提供的更新方法（需要在 AuthContext 中添加 `updateUser` 方法）

**Header 组件**：
- `onOpenProfile` 改为 `navigate('/profile')`
- `onOpenMailList` 改为 `navigate('/accounts')`
- `onLogout` 改为调用 `useAuth().logout()`
- 移除所有导航 props，内部使用 `useNavigate()` 和 `useAuth()`

**LoginPage**：
- 移除 `onLogin` 和 `onLinuxDoLogin` props
- 使用 `useAuth()` 的 `login` 和 `loginWithLinuxDo` 方法

## 后端调整

### ApiRouter 修改

**OAuth 回调重定向路径**：

修改 `handleLinuxdoCallback` 中的重定向目标，从 `frontendUrl` 改为 `/auth/callback`：

```java
private void handleLinuxdoCallback(RoutingContext ctx) {
    // ... existing OAuth processing ...
    AuthService.LoginResult login = ar.result().get();
    setSessionCookie(ctx, login.sessionToken());
    ctx.response()
        .setStatusCode(302)
        .putHeader("Location", "/auth/callback")
        .end();
}
```

**配置项调整**：
- 保留 `MAILDOCK_FRONTEND_URL` 配置项（为了灵活性）
- 默认值从 `"/"` 改为 `"/auth/callback"`
- 更新 `CLAUDE.md` 和相关文档说明这是 OAuth 成功后的前端跳转路径

## API Client 调整

### Session 过期处理

在 `client.ts` 中添加全局的 Session 过期回调机制：

```typescript
// 添加全局的 Session 过期回调
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

// 修改 req 函数，捕获 401
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

**AuthProvider 集成**：
- 在 AuthProvider 初始化时调用 `setSessionExpiredHandler`
- 传入清空用户并跳转登录的回调
- 确保只设置一次（使用 `useEffect` 且无依赖数组）

## 错误处理

### 场景 1：App 启动时会话恢复失败

- **401 未登录**：正常情况，设置 `user = null`，不显示错误
- **500/网络错误**：设置 `error` 消息，在加载页面上显示错误提示 + "重试"按钮

### 场景 2：OAuth 回调页面失败

- 显示错误状态 UI
- 错误图标 + 错误消息
- "返回登录"按钮 → `navigate('/login')`

### 场景 3：已登录页面 Session 过期

- API 请求返回 401
- `client.ts` 捕获并触发 `onSessionExpired` 回调
- AuthContext 清空 `user`
- 自动跳转到 `/login`
- 不显示 toast 或其他提示（直接跳转即可）

## 测试策略

### 新增测试文件

**1. AuthContext.test.tsx**：
- 初始化时调用 `api.me()` 并正确设置 `user`
- 401 响应时正确设置为未登录状态
- 网络错误时正确设置 `error`
- `login()` 成功后设置 `user` 并导航到 `/accounts`
- `login()` 失败时抛出异常
- `logout()` 清空 `user` 并导航到 `/login`
- Session 过期回调正确触发并清空用户

**2. LoadingPage.test.tsx**：
- 渲染默认文案（"登录中..."和"正在验证您的身份"）
- 渲染自定义 `title` 和 `subtitle`
- 包含邮件图标
- 包含旋转 spinner

**3. OAuthCallbackPage.test.tsx**：
- mount 时调用 `api.me()`
- 成功时导航到 `/accounts`
- 失败时显示错误状态
- 点击"返回登录"导航到 `/login`

**4. ProtectedRoute.test.tsx**：
- `loading = true` 时渲染 LoadingPage
- 未登录时重定向到 `/login`
- 已登录时渲染 `<Outlet />`（子路由）

### 现有测试调整

**App.test.tsx**：
- 完全重写，改为测试路由配置
- 测试 AuthProvider 集成
- 测试路由保护（访问受保护路由时未登录重定向）
- 测试 OAuth 回调流程

**AccountsPage.test.tsx**：
- 移除 `onOpenAccount` prop 相关测试
- Mock `useNavigate`，验证点击账号时调用 `navigate` 并传入正确路径

**MailListPage.test.tsx**：
- 移除 `onOpenMessage` 和 `onBack` props 相关测试
- Mock `useNavigate` 和 `useParams`
- 验证导航调用

**MailDetailPage.test.tsx**：
- 移除 `onBack` prop 相关测试
- Mock `useNavigate` 和 `useParams`
- 验证返回按钮调用 `navigate`

**ProfilePage.test.tsx**：
- 调整用户更新逻辑，使用 AuthContext 的 `updateUser` 方法

**LoginPage.test.tsx**：
- 移除 `onLogin` 和 `onLinuxDoLogin` props 相关测试
- Mock `useAuth` hook
- 验证调用 `login` 和 `loginWithLinuxDo` 方法

**Header.test.tsx**：
- 移除导航 props 相关测试
- Mock `useNavigate` 和 `useAuth`
- 验证菜单项点击调用正确的导航方法

## 实现顺序

遵循 TDD 原则，按以下顺序实现：

1. **安装依赖**：`npm install react-router-dom @types/react-router-dom`

2. **创建 LoadingPage 组件**：
   - 写测试 → 实现组件 → 验证测试通过

3. **创建 AuthContext**：
   - 写测试 → 实现 AuthProvider 和 useAuth hook → 验证测试通过
   - 实现 Session 过期处理（`client.ts` 调整）

4. **创建 ProtectedRoute**：
   - 写测试 → 实现组件 → 验证测试通过

5. **创建 OAuthCallbackPage**：
   - 写测试 → 实现组件 → 验证测试通过

6. **后端调整**：
   - 修改 `ApiRouter.handleLinuxdoCallback` 的重定向路径
   - 更新配置默认值
   - 运行后端测试确保无回归

7. **重构 App.tsx**：
   - 引入 BrowserRouter 和 Routes
   - 配置路由表
   - 包裹 AuthProvider
   - 重写 App.test.tsx 并验证通过

8. **调整页面组件**（逐个重构）：
   - LoginPage → 使用 useAuth
   - Header → 使用 useNavigate 和 useAuth
   - AccountsPage → 使用 useNavigate
   - MailListPage → 使用 useNavigate 和 useParams
   - MailDetailPage → 使用 useNavigate 和 useParams
   - ProfilePage → 使用 AuthContext 更新用户
   - 每个组件调整后更新对应测试并验证通过

9. **端到端验证**：
   - 启动后端和前端
   - 测试邮箱登录流程
   - 测试 linux.do OAuth 登录流程（验证加载页面显示）
   - 测试页面间导航
   - 测试 Session 过期处理
   - 测试直接访问受保护路由（未登录时重定向）

## 非功能需求

### 性能

- 路由懒加载（可选，后续优化）：使用 `React.lazy` 和 `Suspense` 按需加载页面组件
- AuthContext 避免不必要的 re-render：使用 `useMemo` 优化 context value

### 可访问性

- LoadingPage 包含 `role="status"` 和 `aria-live="polite"`
- 加载状态对屏幕阅读器友好
- 所有导航链接使用语义化的 `<Link>` 组件（react-router）

### 浏览器兼容性

- 使用 History API（react-router 默认）
- 不依赖 hash 路由
- 支持浏览器前进/后退按钮

## 文档更新

### CLAUDE.md

更新以下部分：

1. **架构要点 → 前端结构**：
   - 说明已迁移到 react-router
   - 说明 AuthContext 管理认证状态
   - 更新页面组件的导航方式

2. **常用命令**：
   - 保持不变

3. **测试策略**：
   - 添加新的测试文件说明
   - 更新页面测试的 mock 要求（`useNavigate`、`useParams`、`useAuth`）

## 风险与缓解

### 风险 1：大规模重构导致测试失败

- **缓解**：严格遵循 TDD，每个组件独立重构并验证测试通过后再继续
- **缓解**：保留 Git 历史，每个组件重构后单独提交

### 风险 2：OAuth 回调路径变更可能影响已部署实例

- **缓解**：保留 `frontendUrl` 配置项，只改默认值
- **缓解**：在文档中说明配置变更

### 风险 3：Session 过期处理可能与现有错误处理冲突

- **缓解**：在 `client.ts` 中仅对 401 触发回调，其他错误仍然抛出
- **缓解**：确保回调只设置一次，避免重复跳转

## 成功标准

1. ✅ OAuth 登录后显示原型中的加载页面
2. ✅ 所有页面使用 react-router 导航
3. ✅ URL 路由可以直接访问（刷新页面不丢失状态）
4. ✅ 未登录访问受保护路由自动重定向到登录页
5. ✅ Session 过期时自动跳转到登录页
6. ✅ 所有测试通过（包括新增和调整的测试）
7. ✅ 浏览器前进/后退按钮正常工作
8. ✅ 无控制台错误或警告
