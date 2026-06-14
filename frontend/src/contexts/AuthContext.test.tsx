import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import type { ApiClient, CurrentUser } from '../api/client';

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

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="user">{auth.user ? auth.user.displayName : 'null'}</div>
      <div data-testid="error">{auth.error || 'null'}</div>
      <button onClick={() => auth.login('a@example.com', 'pw')}>Login</button>
      <button onClick={() => auth.logout()}>Logout</button>
      <button onClick={auth.clearError}>Clear</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始化时调用 api.me 并设置 user', async () => {
    const api = stubApi();
    render(
      <BrowserRouter>
        <AuthProvider api={api}>
          <TestConsumer />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(api.me).toHaveBeenCalled();
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('401 响应时设置为未登录状态', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('HTTP 401')),
    });
    render(
      <BrowserRouter>
        <AuthProvider api={api}>
          <TestConsumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('网络错误时设置 error', async () => {
    const api = stubApi({
      me: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    render(
      <BrowserRouter>
        <AuthProvider api={api}>
          <TestConsumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
  });

  it('login 成功后设置 user', async () => {
    const api = stubApi();
    render(
      <BrowserRouter>
        <AuthProvider api={api}>
          <TestConsumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    const loginBtn = screen.getByText('Login');
    loginBtn.click();

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('a@example.com', 'pw');
    });
  });

  it('logout 清空 user', async () => {
    const api = stubApi();
    render(
      <BrowserRouter>
        <AuthProvider api={api}>
          <TestConsumer />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    });

    const logoutBtn = screen.getByText('Logout');
    logoutBtn.click();

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
  });
});
