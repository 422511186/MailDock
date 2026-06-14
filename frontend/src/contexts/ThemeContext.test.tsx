import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { THEME_STORAGE_KEY } from '../utils/theme';

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

function TestConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('无存储时跟随系统暗色偏好初始化为 dark 并加 dark 类', () => {
    stubMatchMedia(true);
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('采用已存储的选择，忽略系统偏好', () => {
    stubMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggleTheme 在 light 与 dark 间切换并写入 localStorage', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('在 Provider 外使用 useTheme 抛错', () => {
    function Outside() {
      useTheme();
      return null;
    }
    // 抑制 React 抛错时的 console.error 噪声
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Outside />)).toThrow();
    spy.mockRestore();
  });
});
