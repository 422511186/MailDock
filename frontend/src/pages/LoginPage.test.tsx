import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

function mockAuth(overrides = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    loading: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    loginWithLinuxDo: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认显示 LinuxDO 与邮箱登录两个按钮，不显示表单', () => {
    mockAuth();
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('点击 LinuxDO 按钮触发 loginWithLinuxDo', () => {
    const loginWithLinuxDo = vi.fn();
    mockAuth({ loginWithLinuxDo });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 LinuxDO 继续/ }));
    expect(loginWithLinuxDo).toHaveBeenCalled();
  });

  it('点击邮箱登录按钮后展开邮箱密码表单', () => {
    mockAuth();
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('表单模式可返回按钮选择', () => {
    mockAuth();
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
  });

  it('提交表单调用 login', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockAuth({ login });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('a@example.com', 'secret'));
  });

  it('登录失败显示错误信息', async () => {
    const login = vi.fn().mockRejectedValue(new Error('账号或密码错误'));
    mockAuth({ login });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误');
  });

  it('登录失败错误提示带 slide-down 动画类（保留原守护测试）', async () => {
    const login = vi.fn().mockRejectedValue(new Error('账号或密码错误'));
    mockAuth({ login });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('animate-slide-down');
  });
});
