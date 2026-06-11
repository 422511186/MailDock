import { useCallback, useState } from 'react';
import type { ApiClient } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { AccountsPage } from './pages/AccountsPage';
import { MailListPage } from './pages/MailListPage';
import { MailDetailPage } from './pages/MailDetailPage';

/** 顶层视图状态：登录页 / 账号列表 / 邮件列表 / 邮件详情。 */
type View =
  | { name: 'login' }
  | { name: 'accounts' }
  | { name: 'mailList'; accountId: number }
  | { name: 'mailDetail'; accountId: number; messageId: number };

interface AppProps {
  /** API 客户端。 */
  api: ApiClient;
}

/**
 * 应用根组件：基于登录态与视图状态在各页面间切换。
 * 已有 Token 时直接进入账号列表，否则展示登录页。
 */
export function App({ api }: AppProps) {
  const [view, setView] = useState<View>(() =>
    api.getToken() ? { name: 'accounts' } : { name: 'login' },
  );

  /** 登录成功后进入账号列表。 */
  const handleLogin = useCallback(
    async (username: string, password: string) => {
      await api.login(username, password);
      setView({ name: 'accounts' });
    },
    [api],
  );

  /** 登出：撤销 Token 后回到登录页。 */
  const handleLogout = useCallback(async () => {
    await api.logout();
    setView({ name: 'login' });
  }, [api]);

  if (view.name === 'login') {
    return <LoginPage onLogin={handleLogin} />;
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

          {/* 顶部操作区：登出 */}
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
          onOpenAccount={(accountId) => setView({ name: 'mailList', accountId })}
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
          setView({ name: 'mailDetail', accountId: view.accountId, messageId })
        }
        onBack={() => setView({ name: 'accounts' })}
      />
    );
  }

  // view.name === 'mailDetail'
  return (
    <MailDetailPage
      api={api}
      messageId={view.messageId}
      onBack={() => setView({ name: 'mailList', accountId: view.accountId })}
    />
  );
}
