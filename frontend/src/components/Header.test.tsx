import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
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

describe('Header', () => {
  it('显示 MailDock 品牌', () => {
    render(<Header user={null} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByText('MailDock')).toBeInTheDocument();
    expect(screen.getByText('邮箱管理中心')).toBeInTheDocument();
  });

  it('未登录时不显示用户菜单', () => {
    render(<Header user={null} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '用户菜单' })).not.toBeInTheDocument();
  });

  it('登录后显示用户菜单', () => {
    render(<Header user={user()} onOpenProfile={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: '用户菜单' })).toBeInTheDocument();
  });
});
