import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddAccountModal } from './AddAccountModal';

function apiStub(overrides: Record<string, unknown> = {}) {
  return {
    createAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AddAccountModal', () => {
  it('submits trimmed email and authorization code then reports creation', async () => {
    const api = apiStub();
    const onCreated = vi.fn();

    render(<AddAccountModal api={api as never} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/邮箱地址/), { target: { value: '  new@163.com  ' } });
    fireEvent.change(screen.getByLabelText(/授权码/), { target: { value: '  auth-code  ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加账号' }));

    await waitFor(() => {
      expect(api.createAccount).toHaveBeenCalledWith('new@163.com', 'auth-code');
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('shows API errors without closing the modal', async () => {
    const api = apiStub({
      createAccount: vi.fn().mockRejectedValue(new Error('账号已存在')),
    });
    const onClose = vi.fn();

    render(<AddAccountModal api={api as never} onClose={onClose} onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/邮箱地址/), { target: { value: 'dup@163.com' } });
    fireEvent.change(screen.getByLabelText(/授权码/), { target: { value: 'auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: '添加账号' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号已存在');
    expect(onClose).not.toHaveBeenCalled();
  });
});
