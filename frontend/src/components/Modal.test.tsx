import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders title, content and footer actions', () => {
    render(
      <Modal title="确认操作" onClose={vi.fn()} footer={<button type="button">确认</button>}>
        <p>操作内容</p>
      </Modal>,
    );

    expect(screen.getByRole('heading', { name: '确认操作' })).toBeInTheDocument();
    expect(screen.getByText('操作内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument();
  });

  it('closes when clicking the overlay but keeps clicks inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="确认操作" onClose={onClose}>
        <button type="button">内部按钮</button>
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: '内部按钮' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
