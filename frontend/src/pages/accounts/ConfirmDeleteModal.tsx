import { AlertTriangle } from 'lucide-react';
import { Modal } from '../../components/Modal';

export type DeleteTarget =
  | { type: 'one'; id: number; email: string }
  | { type: 'batch'; ids: number[] };

interface ConfirmDeleteModalProps {
  target: DeleteTarget;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 删除确认弹窗：玫红警告图标 + 文案 + 全宽「取消 / 确认删除」按钮。 */
export function ConfirmDeleteModal({ target, busy, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  const message =
    target.type === 'one' ? (
      <>
        确定要删除邮箱账号{' '}
        <span className="font-medium text-slate-900 dark:text-slate-100">{target.email}</span> 吗？此操作不可撤销。
      </>
    ) : (
      <>
        确定要删除选中的{' '}
        <span className="font-medium text-slate-900 dark:text-slate-100">{target.ids.length}</span>{' '}
        个账号吗？此操作不可撤销。
      </>
    );

  return (
    <Modal
      title="确认删除"
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确认删除
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/50">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      </div>
    </Modal>
  );
}
