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
          使用 linux.do 登录
          <ExternalLink className="oauth-icon" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
