import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportModal } from './ImportModal';

function apiStub(overrides: Record<string, unknown> = {}) {
  return {
    importText: vi.fn().mockResolvedValue({ total: 2, success: 1, failed: 0, skipped: 1, results: [] }),
    ...overrides,
  };
}

function textFile(content: string) {
  const file = new File([content], 'accounts.txt', { type: 'text/plain' });
  if (!('text' in file)) {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  }
  return file;
}

describe('ImportModal', () => {
  it('imports selected text file with overwrite option and shows summary', async () => {
    const api = apiStub();
    const onImported = vi.fn();
    const content = 'alice@163.com auth-a\n# comment\nbob@163.com auth-b\n';

    render(<ImportModal api={api as never} onClose={vi.fn()} onImported={onImported} />);

    fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [textFile(content)] } });
    expect(await screen.findByText('accounts.txt')).toBeInTheDocument();
    expect(screen.getByText(/2 个账号/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('已存在则覆盖授权码'));
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));

    await waitFor(() => {
      expect(api.importText).toHaveBeenCalledWith(content, false, true);
    });
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/共 2，成功 1，失败 0，跳过 1/)).toBeInTheDocument();
  });

  it('shows import errors without closing the modal', async () => {
    const api = apiStub({
      importText: vi.fn().mockRejectedValue(new Error('导入失败')),
    });
    const onClose = vi.fn();

    render(<ImportModal api={api as never} onClose={onClose} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('上传文件'), {
      target: { files: [textFile('alice@163.com auth-a\n')] },
    });
    await screen.findByText('accounts.txt');
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('导入失败');
    expect(onClose).not.toHaveBeenCalled();
  });
});
