import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiClient, CurrentUser } from '../api/client';
import { setSessionExpiredHandler } from '../api/client';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithLinuxDo: () => void;
  logout: () => Promise<void>;
  updateUser: (user: CurrentUser) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  api: ApiClient;
  children: ReactNode;
}

export function AuthProvider({ api, children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // 初始化：恢复会话
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          // 401 是正常未登录，不设置 error
          if (err.message && !err.message.includes('401')) {
            setError(err.message);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // 设置 Session 过期处理
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate('/login');
    });
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    setUser(u);
    navigate('/accounts');
  }, [api, navigate]);

  const loginWithLinuxDo = useCallback(() => {
    window.location.href = api.linuxDoLoginUrl();
  }, [api]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    navigate('/login');
  }, [api, navigate]);

  const updateUser = useCallback((u: CurrentUser) => {
    setUser(u);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    login,
    loginWithLinuxDo,
    logout,
    updateUser,
    clearError,
  }), [user, loading, error, login, loginWithLinuxDo, logout, updateUser, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
