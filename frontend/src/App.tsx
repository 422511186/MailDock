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
  | { name: 'mailList'; user: CurrentUser; accountId: number; accountEmail: string }
  | { name: 'mailDetail'; user: CurrentUser; accountId: number; accountEmail: string; messageId: number };

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

  // 视图为状态机切换、页面不卸载，window 的滚动位置会被保留；
  // 每次切换视图（含进入详情后返回列表）时滚回顶部。
  const viewKey =
    view.name +
    ('accountId' in view ? `:${view.accountId}` : '') +
    ('messageId' in view ? `:${view.messageId}` : '');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [viewKey]);

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
          onOpenMailList={() => setView({ name: 'accounts', user: view.user })}
        />
        <AccountsPage
          api={api}
          onOpenAccount={(accountId, accountEmail) =>
            setView({ name: 'mailList', user: view.user, accountId, accountEmail })
          }
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
          onOpenMailList={() => setView({ name: 'accounts', user: view.user })}
        />
        <ProfilePage
          api={api}
          user={view.user}
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
          onOpenMailList={() => setView({ name: 'accounts', user: view.user })}
        />
        <MailListPage
          api={api}
          accountId={view.accountId}
          accountEmail={view.accountEmail}
          onOpenMessage={(messageId) =>
            setView({ name: 'mailDetail', user: view.user, accountId: view.accountId, accountEmail: view.accountEmail, messageId })
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
        onOpenMailList={() => setView({ name: 'accounts', user: view.user })}
      />
      <MailDetailPage
        api={api}
        messageId={view.messageId}
        onBack={() => setView({ name: 'mailList', user: view.user, accountId: view.accountId, accountEmail: view.accountEmail })}
      />
    </div>
  );
}
