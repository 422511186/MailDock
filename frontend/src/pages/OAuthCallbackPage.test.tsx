import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from './OAuthCallbackPage';
import type { ApiClient, CurrentUser } from '../api/client';

const mockUser: CurrentUser = {
  id: 1,
  primaryEmail: 'test@example.com',
  displayName: 'Test',
  avatarUrl: null,
  hasPassword: true,
};

function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    me: vi.fn().mockResolvedValue(mockUser),
    login: vi.fn(),
    logout: vi.fn(),
    linuxDoLoginUrl: vi.fn(),
    listAccounts: vi.fn(),
    listMessages: vi.fn(),
    refresh: vi.fn(),
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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mount 时调用 api.me', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    expect(screen.getByText('登录中...')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.me).toHaveBeenCalled();
    });
  });

  it('成功时导航到 /accounts', async () => {
    const api = stubApi();
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounts', { replace: true });
    });
  });

  it('失败时显示错误和返回登录按钮', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('验证失败')),
    });
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={api} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('验证失败')).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: /返回登录/ });
    backBtn.click();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
