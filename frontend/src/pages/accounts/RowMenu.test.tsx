import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RowMenu } from './RowMenu';

describe('RowMenu', () => {
  it('opens account actions and dispatches selected action', () => {
    const onTest = vi.fn();
    const onDelete = vi.fn();

    render(<RowMenu testing={false} onTest={onTest} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '测活' }));

    expect(onTest).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows testing state and disables test action while an account is being tested', () => {
    const onTest = vi.fn();

    render(<RowMenu testing={true} onTest={onTest} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));

    const testItem = screen.getByRole('menuitem', { name: '测活中…' });
    expect(testItem).toBeDisabled();
    fireEvent.click(testItem);
    expect(onTest).not.toHaveBeenCalled();
  });

  it('closes the menu on Escape', () => {
    render(<RowMenu testing={false} onTest={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
