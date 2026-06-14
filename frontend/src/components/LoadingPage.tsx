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
