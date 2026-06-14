import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { ThemeProvider } from '../contexts/ThemeContext';
import { THEME_STORAGE_KEY } from '../utils/theme';
import type { CurrentUser } from '../api/client';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

/** 在 MemoryRouter + ThemeProvider 下渲染，UserMenu 依赖两者。 */
function renderMenu(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>
  );
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useAuth } from '../contexts/AuthContext';

function mockAuth(overrides = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });
}

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('触发按钮显示用户名与下拉箭头', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    const trigger = screen.getByRole('button', { name: '用户菜单' });
    expect(trigger).toHaveTextContent('Alice');
  });

  it('点击展开后显示富信息头部（仅用户名，不显示邮箱）', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Alice');
    expect(menu).not.toHaveTextContent('alice@example.com');
  });

  it('菜单包含个人中心 / 邮件列表 / 退出登录三个菜单项', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '邮件列表' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeInTheDocument();
  });

  it('菜单项使用原型中的轻量列表样式而不是描边按钮样式', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const menu = screen.getByRole('menu');
    const menuItems = screen.getAllByRole('menuitem');
    const menuList = menuItems[0].parentElement;

    expect(menu.className).toContain('w-52');
    expect(menu.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(menu.className).not.toContain('w-80');
    expect(menu.className).not.toContain('w-64');
    expect(menu.className.split(/\s+/)).not.toContain('border');
    expect(menu.className.split(/\s+/)).not.toContain('border-slate-200');
    expect(menuList?.className.split(/\s+/)).toContain('pt-3');
    expect(menuList?.className.split(/\s+/)).toContain('pb-2');
    expect(menuList?.className.split(/\s+/)).not.toContain('p-2');
    expect(menuList?.className.split(/\s+/)).not.toContain('py-3');
    for (const item of menuItems.slice(0, -1)) {
      const classes = item.className.split(/\s+/);

      expect(classes.some((className) => className.startsWith('rounded'))).toBe(false);
      expect(classes).not.toContain('border');
      expect(classes).toContain('border-none');
      expect(classes).toContain('bg-transparent');
      expect(classes).not.toContain('justify-center');
      expect(classes).toContain('px-2');
      expect(classes).toContain('py-2.5');
      expect(classes).not.toContain('px-3');
      expect(classes).toContain('text-sm');
      expect(classes).not.toContain('text-base');
      expect(classes).not.toContain('px-6');
      expect(classes).not.toContain('py-3.5');
    }
    const logoutClasses = screen.getByRole('menuitem', { name: '退出登录' }).className.split(/\s+/);
    expect(logoutClasses).toContain('text-rose-600');
    expect(logoutClasses).toContain('rounded-b-2xl');
    expect(logoutClasses).not.toContain('border');
    expect(logoutClasses).toContain('border-none');
    expect(logoutClasses).toContain('bg-transparent');
    expect(logoutClasses).toContain('px-2');
    expect(logoutClasses).toContain('py-2.5');
    expect(logoutClasses).not.toContain('px-3');
    expect(logoutClasses).toContain('text-sm');
    expect(logoutClasses).not.toContain('text-base');
    expect(logoutClasses).not.toContain('px-6');
    expect(logoutClasses).not.toContain('py-3.5');
  });

  it('富信息头部保持紧凑，不在桌面和移动端放大', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const headerName = screen.getAllByText('Alice').find((node) => node.className.includes('font-semibold'));
    expect(headerName?.className).toContain('text-sm');
    expect(headerName?.className).not.toContain('text-base');
    expect(headerName?.className).not.toContain('text-lg');
  });

  it('富信息头部左右 padding 极小（px-2）', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const userName = screen.getAllByText('Alice').find((node) => node.className.includes('font-semibold'));
    const header = userName?.parentElement?.parentElement?.parentElement;
    const classes = header?.className.split(/\s+/) ?? [];

    expect(classes).toContain('px-2');
    expect(classes).not.toContain('px-3');
    expect(classes).not.toContain('px-4');
  });

  it('富信息头部内容居中对齐', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const userName = screen.getAllByText('Alice').find((node) => node.className.includes('font-semibold'));
    const container = userName?.parentElement?.parentElement;
    const classes = container?.className.split(/\s+/) ?? [];

    expect(classes).toContain('justify-center');
  });

  it('富信息头部用户名不占据剩余空间（无 flex-1）', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const userName = screen.getAllByText('Alice').find((node) => node.className.includes('font-semibold'));
    const textContainer = userName?.parentElement;
    const classes = textContainer?.className.split(/\s+/) ?? [];

    expect(classes).not.toContain('flex-1');
  });

  it('富信息头部和菜单项之间不显示横向分隔线', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    const userName = screen.getAllByText('Alice').find((node) => node.className.includes('font-semibold'));
    const header = userName?.parentElement?.parentElement;
    const classes = header?.className.split(/\s+/) ?? [];

    expect(classes).not.toContain('border-b');
    expect(classes).not.toContain('border-slate-100');
  });

  it('点击个人中心触发导航到 /profile 并关闭菜单', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('点击退出登录触发 logout', () => {
    const logout = vi.fn();
    mockAuth({ logout });
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(logout).toHaveBeenCalled();
  });

  it('菜单包含主题切换项；亮色时显示“暗黑模式”', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menuitem', { name: '暗黑模式' })).toBeInTheDocument();
  });

  it('点击主题切换项切到暗黑并写入 localStorage，菜单保持打开', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '暗黑模式' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    // 切换后菜单仍打开，标签变为“明亮模式”
    expect(screen.getByRole('menuitem', { name: '明亮模式' })).toBeInTheDocument();
  });

  it('点击邮件列表触发导航到 /accounts 并关闭菜单', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '邮件列表' }));
    expect(mockNavigate).toHaveBeenCalledWith('/accounts');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc 关闭菜单', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('展开的下拉菜单带 slide-down 动画类（保留原守护测试）', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu').className).toContain('animate-slide-down');
  });

  it('无 displayName 时触发按钮回退到邮箱', () => {
    renderMenu(
      <UserMenu
        user={user({ displayName: null })}
      />
    );
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('alice@example.com');
  });

  it('下拉菜单面板有明显阴影（shadow-xl）以区分背景', () => {
    renderMenu(
      <UserMenu user={user()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('shadow-2xl');
  });
});
