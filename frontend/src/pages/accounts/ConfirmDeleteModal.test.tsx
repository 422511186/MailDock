import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

describe('ConfirmDeleteModal', () => {
  it('confirms deleting a single account', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDeleteModal
        target={{ type: 'one', id: 3, email: 'del@163.com' }}
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('heading', { name: '确认删除' })).toBeInTheDocument();
    expect(screen.getByText('del@163.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows batch count and disables confirm while busy', () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDeleteModal
        target={{ type: 'batch', ids: [1, 2, 3] }}
        busy={true}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: '确认删除' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
