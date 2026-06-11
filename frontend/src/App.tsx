import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, CurrentUser } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { AccountsPage } from './pages/AccountsPage';
import { MailListPage } from './pages/MailListPage';
import { MailDetailPage } from './pages/MailDetailPage';

/** 顶层视图状态：登录页 / 账号列表 / 邮件列表 / 邮件详情。 */
type View =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'accounts'; user: CurrentUser }
  | { name: 'mailList'; user: CurrentUser; accountId: number }
  | { name: 'mailDetail'; user: CurrentUser; accountId: number; messageId: number };

interface AppProps {
  /** API 客户端。 */
  api: ApiClient;
}

/**
 * 应用根组件：基于登录态与视图状态在各页面间切换。
 * 启动时通过 /auth/me 恢复 Cookie 会话。
 */
export function App({ api }: AppProps) {
  const [view, setView] = useState<View>({ name: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((user) => {
        if (!cancelled) setView({ name: 'accounts', user });
      })
      .catch(() => {
        if (!cancelled) setView({ name: 'login' });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  /** 登录成功后进入账号列表。 */
  const handleLogin = useCallback(
    async (email: string, password: string) => {
      const user = await api.login(email, password);
      setView({ name: 'accounts', user });
    },
    [api],
  );

  const handleLinuxDoLogin = useCallback(() => {
    window.location.href = api.linuxDoLoginUrl();
  }, [api]);

  /** 登出：撤销 Session 后回到登录页。 */
  const handleLogout = useCallback(async () => {
    await api.logout();
    setView({ name: 'login' });
  }, [api]);

  if (view.name === 'loading') {
    return <div className="app-main">加载中...</div>;
  }

  if (view.name === 'login') {
    return <LoginPage onLogin={handleLogin} onLinuxDoLogin={handleLinuxDoLogin} />;
  }

  if (view.name === 'accounts') {
    return (
      <div>
        <header className="topbar">
          {/* 品牌标识 */}
          <div className="brand">
            <span className="brand-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="currentColor" opacity="0.15" />
                <path
                  d="M3 7.5 12 13l9-5.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="3"
                  y="6"
                  width="18"
                  height="12"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-name">MailDock</span>
              <span className="brand-sub">邮箱一站式服务</span>
            </div>
          </div>

          {/* 顶部操作区：当前用户与登出 */}
          <span className="text-sm text-slate-600">
            {view.user.displayName || view.user.primaryEmail || 'MailDock 用户'}
          </span>
          <button
            type="button"
            className="logout-btn"
            onClick={() => void handleLogout()}
            aria-label="登出"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="logout-text">登出</span>
          </button>
        </header>
        <AccountsPage
          api={api}
          onOpenAccount={(accountId) => setView({ name: 'mailList', user: view.user, accountId })}
        />
      </div>
    );
  }

  if (view.name === 'mailList') {
    return (
      <MailListPage
        api={api}
        accountId={view.accountId}
        onOpenMessage={(messageId) =>
          setView({ name: 'mailDetail', user: view.user, accountId: view.accountId, messageId })
        }
        onBack={() => setView({ name: 'accounts', user: view.user })}
      />
    );
  }

  // view.name === 'mailDetail'
  return (
    <MailDetailPage
      api={api}
      messageId={view.messageId}
      onBack={() => setView({ name: 'mailList', user: view.user, accountId: view.accountId })}
    />
  );
}
