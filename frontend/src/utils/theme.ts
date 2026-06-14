/** 主题工具：解析、读写与应用明亮/暗黑主题。
 *  主题选择持久化在 localStorage；无存储时跟随系统偏好。 */

export type Theme = 'light' | 'dark';

/** localStorage 中保存主题选择的键名。 */
export const THEME_STORAGE_KEY = 'maildock-theme';

/** 读取已保存的主题选择；无或非法值时返回 null。 */
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** 读取系统颜色偏好；不支持 matchMedia 时回退到 light。 */
export function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 解析初始主题：优先已保存的选择，否则跟随系统偏好。 */
export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/** 把主题选择写入 localStorage。 */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 忽略存储失败（如隐私模式），不影响主题应用。
  }
}

/** 把主题应用到 documentElement：dark 时加 `dark` 类，light 时移除。 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
