import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  THEME_STORAGE_KEY,
  getStoredTheme,
  getSystemTheme,
  resolveInitialTheme,
  storeTheme,
  applyTheme,
} from './theme';

/** 用指定的系统暗色偏好替换 window.matchMedia。 */
function stubMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('theme 工具', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  describe('getStoredTheme', () => {
    it('无存储时返回 null', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('返回 localStorage 中保存的 light', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('返回 localStorage 中保存的 dark', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('存储值非法时返回 null', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'rainbow');
      expect(getStoredTheme()).toBeNull();
    });
  });

  describe('getSystemTheme', () => {
    it('系统偏好暗色时返回 dark', () => {
      stubMatchMedia(true);
      expect(getSystemTheme()).toBe('dark');
    });

    it('系统偏好亮色时返回 light', () => {
      stubMatchMedia(false);
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('resolveInitialTheme', () => {
    it('优先采用已存储的选择，忽略系统偏好', () => {
      stubMatchMedia(true);
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      expect(resolveInitialTheme()).toBe('light');
    });

    it('无存储时跟随系统暗色偏好', () => {
      stubMatchMedia(true);
      expect(resolveInitialTheme()).toBe('dark');
    });

    it('无存储时跟随系统亮色偏好', () => {
      stubMatchMedia(false);
      expect(resolveInitialTheme()).toBe('light');
    });
  });

  describe('storeTheme', () => {
    it('把主题写入 localStorage', () => {
      storeTheme('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });
  });

  describe('applyTheme', () => {
    it('dark 时给 documentElement 加 dark 类', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('light 时移除 documentElement 的 dark 类', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
