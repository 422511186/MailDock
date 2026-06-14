import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
import { ThemeProvider } from '../contexts/ThemeContext';
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

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

function mockAuth(currentUser: CurrentUser | null) {
  vi.mocked(useAuth).mockReturnValue({
    user: currentUser,
    loading: false,
    error: null,
    login: vi.fn(),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
  });
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('显示 MailDock 品牌', () => {
    mockAuth(null);
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('MailDock')).toBeInTheDocument();
    expect(screen.getByText('邮箱管理中心')).toBeInTheDocument();
  });

  it('未登录时不显示用户菜单', () => {
    mockAuth(null);
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: '用户菜单' })).not.toBeInTheDocument();
  });

  it('登录后显示用户菜单', () => {
    mockAuth(user());
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Header />
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: '用户菜单' })).toBeInTheDocument();
  });
});
