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
  it('触发按钮显示用户名与下拉箭头', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '用户菜单' });
    expect(trigger).toHaveTextContent('Alice');
  });

  it('点击展开后显示富信息头部（用户名 + 邮箱）', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Alice');
    expect(menu).toHaveTextContent('alice@example.com');
  });

  it('菜单包含个人中心 / 邮件列表 / 退出登录三个菜单项', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '邮件列表' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeInTheDocument();
  });

  it('点击个人中心触发 onOpenProfile 并关闭菜单', () => {
    const onOpenProfile = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={onOpenProfile} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }));
    expect(onOpenProfile).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('点击退出登录触发 onLogout', () => {
    const onLogout = vi.fn();
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('点击邮件列表触发 onOpenMailList 并关闭菜单', () => {
    const onOpenMailList = vi.fn();
    render(
      <UserMenu
        user={user()}
        onOpenProfile={vi.fn()}
        onLogout={vi.fn()}
        onOpenMailList={onOpenMailList}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '邮件列表' }));
    expect(onOpenMailList).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('未传 onOpenMailList 时点击邮件列表仅关闭菜单（不报错）', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(() =>
      fireEvent.click(screen.getByRole('menuitem', { name: '邮件列表' })),
    ).not.toThrow();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc 关闭菜单', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('展开的下拉菜单带 slide-down 动画类（保留原守护测试）', () => {
    render(<UserMenu user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    expect(screen.getByRole('menu').className).toContain('animate-slide-down');
  });

  it('无 displayName 时触发按钮回退到邮箱', () => {
    render(
      <UserMenu
        user={user({ displayName: null })}
        onOpenProfile={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '用户菜单' })).toHaveTextContent('alice@example.com');
  });
});
