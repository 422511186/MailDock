import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
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

function stubApi(): ApiClient {
  return { me: vi.fn() } as unknown as ApiClient;
}

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// useAuth 状态由各测试通过 setAuthState 注入
let authState: { user: CurrentUser | null; loading: boolean; error: string | null };
function setAuthState(state: typeof authState) {
  authState = state;
}
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState({ user: null, loading: true, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AuthContext 加载中时显示加载动画', () => {
    setAuthState({ user: null, loading: true, error: null });
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={stubApi()} />
      </MemoryRouter>
    );
    expect(screen.getByText('登录中...')).toBeInTheDocument();
  });

  it('用户已登录时，动画显示满 2 秒后才导航到 /accounts', () => {
    vi.useFakeTimers();
    setAuthState({ user: mockUser, loading: false, error: null });
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={stubApi()} />
      </MemoryRouter>
    );

    // 加载动画仍在显示，尚未导航
    expect(screen.getByText('登录中...')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    // 未满 2 秒时仍不导航
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    // 满 2 秒后导航
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockNavigate).toHaveBeenCalledWith('/accounts', { replace: true });
  });

  it('加载完成后无用户时显示错误和返回登录按钮', async () => {
    setAuthState({ user: null, loading: false, error: '验证失败' });
    render(
      <MemoryRouter>
        <OAuthCallbackPage api={stubApi()} />
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
