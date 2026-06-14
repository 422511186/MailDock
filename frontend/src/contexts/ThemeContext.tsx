import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { type Theme, resolveInitialTheme, storeTheme, applyTheme } from '../utils/theme';

interface ThemeContextValue {
  /** 当前主题。 */
  theme: Theme;
  /** 在明亮 / 暗黑间切换。 */
  toggleTheme: () => void;
  /** 直接设置主题。 */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

/** 主题上下文：初始化时解析主题（已存储优先，否则跟随系统），
 *  切换时同步写入 localStorage 并应用到 documentElement。 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = resolveInitialTheme();
    applyTheme(initial);
    return initial;
  });

  // 主题变化时应用到 DOM（覆盖 SSR/初始竞态等场景）
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next);
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
