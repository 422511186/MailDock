import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';
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

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    updateDisplayName: vi.fn().mockResolvedValue(user({ displayName: '新名字' })),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ProfilePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('渲染只读资料（邮箱）与显示名输入框', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('显示名')).toHaveValue('Alice');
  });

  it('提交改名调用 updateDisplayName 并回传更新后的用户', async () => {
    const onUserUpdated = vi.fn();
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={onUserUpdated} />);

    fireEvent.change(screen.getByLabelText('显示名'), { target: { value: '新名字' } });
    fireEvent.click(screen.getByRole('button', { name: '更新资料' }));

    await waitFor(() => expect(api.updateDisplayName).toHaveBeenCalledWith('新名字'));
    await waitFor(() => expect(onUserUpdated).toHaveBeenCalled());
  });

  it('改密两次输入不一致时报错且不调用 API', async () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('改密成功时调用 changePassword 并清空表单', async () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('原密码'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1'));
    await waitFor(() => expect(screen.getByLabelText('新密码')).toHaveValue(''));
  });

  it('linux.do 用户（hasPassword=false）改密区禁用并提示', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user({ hasPassword: false })} onBack={vi.fn()} onUserUpdated={vi.fn()} />);

    expect(screen.getByText('当前账号通过 linux.do 登录，未设置密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改密码' })).toBeDisabled();
  });

  it('更新资料按钮内嵌图标且可访问名保持「更新资料」', () => {
    const api = stubApi();
    render(<ProfilePage api={api as never} user={user()} onBack={vi.fn()} onUserUpdated={vi.fn()} />);
    const btn = screen.getByRole('button', { name: '更新资料' });
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });
});
