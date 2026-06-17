import { CheckCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';

export type TestTarget =
  | { type: 'one'; id: number; email: string }
  | { type: 'batch'; ids: number[] };

interface ConfirmTestModalProps {
  target: TestTarget;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 测活确认弹窗：绿色主题 + 文案 + 全宽「取消 / 确认测活」按钮。 */
export function ConfirmTestModal({ target, busy, onCancel, onConfirm }: ConfirmTestModalProps) {
  const message =
    target.type === 'one' ? (
      <>
        确定要对邮箱账号{' '}
        <span className="font-medium text-slate-900 dark:text-slate-100">{target.email}</span> 进行测活吗？
      </>
    ) : target.ids.length > 0 ? (
      <>
        确定要对选中的{' '}
        <span className="font-medium text-slate-900 dark:text-slate-100">{target.ids.length}</span>{' '}
        个账号进行批量测活吗？
      </>
    ) : (
      <>
        确定要对<span className="font-medium text-slate-900 dark:text-slate-100">全部账号</span>进行批量测活吗？
      </>
    );

  return (
    <Modal
      title="确认测活"
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
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确认测活
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      </div>
    </Modal>
  );
}
