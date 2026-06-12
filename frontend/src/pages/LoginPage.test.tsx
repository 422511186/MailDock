import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('默认显示 LinuxDO 与邮箱登录两个按钮，不显示表单', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('点击 LinuxDO 按钮触发 onLinuxDoLogin', () => {
    const onLinuxDoLogin = vi.fn();
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={onLinuxDoLogin} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 LinuxDO 继续/ }));
    expect(onLinuxDoLogin).toHaveBeenCalled();
  });

  it('点击邮箱登录按钮后展开邮箱密码表单', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('表单模式可返回按钮选择', () => {
    render(<LoginPage onLogin={vi.fn()} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /使用 LinuxDO 继续/ })).toBeInTheDocument();
  });

  it('提交表单调用 onLogin', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('a@example.com', 'secret'));
  });

  it('登录失败显示错误信息', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('账号或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误');
  });

  it('登录失败错误提示带 slide-down 动画类（保留原守护测试）', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('账号或密码错误'));
    render(<LoginPage onLogin={onLogin} onLinuxDoLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('animate-slide-down');
  });
});
