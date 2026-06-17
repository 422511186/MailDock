import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmTestModal } from './ConfirmTestModal';

describe('ConfirmTestModal', () => {
  it('confirms testing a single account', () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmTestModal
        target={{ type: 'one', id: 5, email: 'ok@163.com' }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('heading', { name: '确认测活' })).toBeInTheDocument();
    expect(screen.getByText('ok@163.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认测活' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('distinguishes selected batch testing from testing all accounts', () => {
    const { rerender } = render(
      <ConfirmTestModal
        target={{ type: 'batch', ids: [1, 2] }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/个账号进行批量测活吗/)).toBeInTheDocument();

    rerender(
      <ConfirmTestModal
        target={{ type: 'batch', ids: [] }}
        busy={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('全部账号')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认测活' })).toBeDisabled();
  });
});
