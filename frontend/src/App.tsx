import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, CurrentUser } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { AccountsPage } from './pages/AccountsPage';
import { MailListPage } from './pages/MailListPage';
import { MailDetailPage } from './pages/MailDetailPage';
import { Header } from './components/Header';
import { ProfilePage } from './pages/ProfilePage';

/** 顶层视图状态：登录页 / 账号列表 / 邮件列表 / 邮件详情。 */
type View =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'accounts'; user: CurrentUser }
  | { name: 'profile'; user: CurrentUser }
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
      <div className="min-h-screen bg-slate-50">
        <Header
          user={view.user}
          onOpenProfile={() => setView({ name: 'profile', user: view.user })}
          onLogout={() => void handleLogout()}
        />
        <AccountsPage
          api={api}
          onOpenAccount={(accountId) => setView({ name: 'mailList', user: view.user, accountId })}
        />
      </div>
    );
  }

  if (view.name === 'profile') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header
          user={view.user}
          onOpenProfile={() => setView({ name: 'profile', user: view.user })}
          onLogout={() => void handleLogout()}
        />
        <ProfilePage
          api={api}
          user={view.user}
          onBack={() => setView({ name: 'accounts', user: view.user })}
          onUserUpdated={(updated) => setView({ name: 'profile', user: updated })}
        />
      </div>
    );
  }

  if (view.name === 'mailList') {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header
          user={view.user}
          onOpenProfile={() => setView({ name: 'profile', user: view.user })}
          onLogout={() => void handleLogout()}
        />
        <MailListPage
          api={api}
          accountId={view.accountId}
          onOpenMessage={(messageId) =>
            setView({ name: 'mailDetail', user: view.user, accountId: view.accountId, messageId })
          }
          onBack={() => setView({ name: 'accounts', user: view.user })}
        />
      </div>
    );
  }

  // view.name === 'mailDetail'
  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        user={view.user}
        onOpenProfile={() => setView({ name: 'profile', user: view.user })}
        onLogout={() => void handleLogout()}
      />
      <MailDetailPage
        api={api}
        messageId={view.messageId}
        onBack={() => setView({ name: 'mailList', user: view.user, accountId: view.accountId })}
      />
    </div>
  );
}
