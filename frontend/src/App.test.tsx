import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import type { ApiClient, CurrentUser } from './api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  hasPassword: true,
};

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    me: vi.fn().mockResolvedValue(mockUser),
    login: vi.fn().mockResolvedValue(mockUser),
    logout: vi.fn().mockResolvedValue(undefined),
    linuxDoLoginUrl: vi.fn().mockReturnValue('/api/v1/auth/linuxdo/start'),
    listAccounts: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    listMessages: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    getMessage: vi.fn(),
    markRead: vi.fn(),
    attachmentUrl: vi.fn(),
    updateDisplayName: vi.fn(),
    changePassword: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    deleteBatch: vi.fn(),
    testConnection: vi.fn(),
    testBatch: vi.fn(),
    importAccounts: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('启动时调用 api.me 并进入账号列表', async () => {
    const api = stubApi();
    render(<App api={api} />);

    // 初始加载状态
    expect(screen.getByText('登录中...')).toBeInTheDocument();

    // 会话恢复后进入账号列表
    await waitFor(() => {
      expect(api.me).toHaveBeenCalled();
    });

    // 应该看到空列表提示或标题
    await waitFor(() => {
      expect(screen.queryByText('登录中...')).not.toBeInTheDocument();
    });
  });

  it('未登录时显示登录页', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('HTTP 401')),
    });
    render(<App api={api} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
    });
  });
});
