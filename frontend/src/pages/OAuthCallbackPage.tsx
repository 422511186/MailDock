import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { LoadingPage } from '../components/LoadingPage';
import { useAuth } from '../contexts/AuthContext';

export function OAuthCallbackPage() {
  const { user, loading, error: authError } = useAuth();
  const [localError, setLocalError] = useState<string | null>(null);
  const [mountTime] = useState(() => Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    // 等待 AuthContext 加载完成
    if (loading) return;

    // 如果加载完成后没有用户，说明登录失败
    if (!user) {
      setLocalError(authError || '登录失败');
      return;
    }

    // 用户已登录，计算还需要显示多久动画
    let cancelled = false;
    const elapsed = Date.now() - mountTime;
    const remaining = Math.max(0, 2000 - elapsed);

    const timer = setTimeout(() => {
      if (!cancelled) {
        navigate('/accounts', { replace: true });
      }
    }, remaining);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, loading, authError, navigate, mountTime]);

  const error = localError;

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
