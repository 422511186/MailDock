import { useState } from 'react';
import type { FormEvent } from 'react';
import { Info } from 'lucide-react';
import type { ApiClient } from '../../api/client';
import { Modal } from '../../components/Modal';

interface AddAccountModalProps {
  api: ApiClient;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

/** 新增账号弹窗表单。 */
export function AddAccountModal({ api, onClose, onCreated }: AddAccountModalProps) {
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createAccount(email.trim(), authCode.trim());
      await onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="添加邮箱账号"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="submit"
            form="add-account-form"
            disabled={busy}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            添加账号
          </button>
        </>
      }
    >
      <form id="add-account-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            邮箱地址 *
          </label>
          <input
            id="add-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="your@163.com"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-authcode" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            授权码 *
          </label>
          <input
            id="add-authcode"
            type="password"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            autoComplete="off"
            placeholder="163 邮箱 IMAP 授权码"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
          />
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
            前往 163 邮箱设置获取 IMAP 授权码
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-imap-host" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              IMAP 服务器
            </label>
            <input
              id="add-imap-host"
              value="imap.163.com"
              readOnly
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-imap-port" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              端口
            </label>
            <input
              id="add-imap-port"
              value="993"
              readOnly
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
