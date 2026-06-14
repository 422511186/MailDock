import { useState, type FormEvent } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'choice' | 'email';

/** LinuxDO 社区 logo 图片地址。 */
const LINUXDO_LOGO = 'https://cdn3.ldstatic.com/original/3X/9/7/97ed5d6d97f4c7f3dc0670d097bf457527c375f5.png';

/**
 * 登录页：默认显示 LinuxDO / 邮箱登录两个大按钮。
 * 点击「邮箱登录」展开邮箱密码表单，提交调用 AuthContext.login。
 * 对齐 design-prototype.html section-3。
 */
export function LoginPage() {
  const { login, loginWithLinuxDo } = useAuth();
  const [mode, setMode] = useState<Mode>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 提交表单：调用 AuthContext.login，失败时展示错误信息
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
                onClick={loginWithLinuxDo}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-6 py-4 text-base font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <img src={LINUXDO_LOGO} alt="" className="h-6 w-6 rounded" aria-hidden="true" />
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
