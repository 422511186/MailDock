import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('渲染用户名、密码输入框与登录按钮', () => {
    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('提交时以输入的凭据调用 onLogin', async () => {
    // 填写表单并提交，应以用户名密码调用回调
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('admin', 'secret');
    });
  });

  it('登录失败时显示错误信息', async () => {
    // onLogin 抛错时，页面应展示错误提示
    const onLogin = vi.fn().mockRejectedValue(new Error('用户名或密码错误'));
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument();
  });
});
