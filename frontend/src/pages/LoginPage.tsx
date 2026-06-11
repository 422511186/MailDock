import { useState, type FormEvent } from 'react';

/** 登录页组件属性。 */
interface LoginPageProps {
  /** 提交登录的回调，接收用户名与密码，返回 Promise。 */
  onLogin: (username: string, password: string) => Promise<void>;
}

/**
 * 管理员登录页：填写用户名与密码后提交。
 * 登录失败时展示错误信息。
 */
export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 提交表单：调用 onLogin，失败时展示错误信息
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <h1>MailDock 登录</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>登录</button>
      </form>
    </div>
  );
}
