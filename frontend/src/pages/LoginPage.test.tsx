import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('渲染邮箱、密码输入框与登录按钮', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);

    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用 linux.do 登录' })).toBeInTheDocument();
  });

  it('提交时以输入的凭据调用 onLogin', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('a@example.com', 'secret');
    });
  });

  it('点击 linux.do 登录按钮时调用回调', () => {
    const onLinuxDoLogin = vi.fn();
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={onLinuxDoLogin} />);

    fireEvent.click(screen.getByRole('button', { name: '使用 linux.do 登录' }));

    expect(onLinuxDoLogin).toHaveBeenCalled();
  });

  it('登录失败时显示错误信息', async () => {
    // onLogin 抛错时，页面应展示错误提示
    const onLogin = vi.fn().mockRejectedValue(new Error('邮箱或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
  });

  it('登录失败时错误提示带 slide-down 动画类', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('邮箱或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('animate-slide-down');
  });
});
