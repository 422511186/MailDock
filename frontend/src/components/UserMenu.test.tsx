import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from './UserMenu';
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

describe('UserMenu', () => {
  it('无头像时显示显示名首字母', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('A');
  });

  it('无显示名时回退到邮箱首字母', () => {
    render(<UserMenu user={user({ displayName: null })} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('A');
  });

  it('点击头像展开菜单并显示用户名与邮箱', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('点击「个人中心」触发 onOpenProfile', () => {
    const onOpenProfile = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={onOpenProfile} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }));
    expect(onOpenProfile).toHaveBeenCalled();
  });

  it('点击「退出登录」触发 onLogout', () => {
    const onLogout = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('按 Esc 关闭菜单', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('展开的下拉菜单带 slide-down 动画类', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu').className).toContain('animate-slide-down');
  });
});
