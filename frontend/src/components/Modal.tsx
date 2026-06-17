import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * 通用弹窗外壳：桌面端居中卡片，移动端 bottom-sheet。
 * footer 由调用方传入，便于业务弹窗保持自己的按钮语义。
 */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl animate-slide-up-mobile sm:max-w-lg sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">{title}</h3>
        </div>

        <div className="overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">{children}</div>

        {footer && (
          <div className="flex gap-3 border-t border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800">{footer}</div>
        )}
      </div>
    </div>
  );
}
