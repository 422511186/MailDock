import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileText, Info, Upload, X } from 'lucide-react';
import type { ApiClient, ImportResult } from '../../api/client';
import { Modal } from '../../components/Modal';
import { countAccountLines } from '../accountsPageModel';

interface ImportModalProps {
  api: ApiClient;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

/** 批量导入弹窗：文件上传/拖拽 + 已选文件预览 + 覆盖选项。 */
export function ImportModal({ api, onClose, onImported }: ImportModalProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [overwrite, setOverwrite] = useState(false);
  const [summary, setSummary] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function acceptFile(file: File) {
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setFileSize(file.size);
    setSummary(null);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await acceptFile(file);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) await acceptFile(file);
  }

  function clearFile() {
    setText('');
    setFileName('');
    setFileSize(0);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit() {
    setError('');
    setBusy(true);
    try {
      const result = await api.importText(text, false, overwrite);
      setSummary(result);
      await onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="批量导入账号"
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
            type="button"
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始导入
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-file" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            上传 TXT 文件
          </label>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            aria-label="上传文件"
            onChange={handleFile}
          />
          <label
            htmlFor="import-file"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 transition hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-emerald-950/20"
          >
            <Upload className="h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <span className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">点击选择文件</span>
            <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">或拖拽文件到此处</span>
          </label>
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
            TXT 格式：邮箱 授权码（空格分隔，每行一个账号）
          </p>
        </div>

        {fileName && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{fileName}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {(fileSize / 1024).toFixed(1)} KB · {countAccountLines(text)} 个账号
                </div>
              </div>
              <button
                type="button"
                aria-label="移除文件"
                onClick={clearFile}
                className="checkbox-btn cursor-pointer text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          已存在则覆盖授权码
        </label>

        {summary && (
          <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 sm:text-sm dark:bg-emerald-950/40 dark:text-emerald-300">
            共 {summary.total}，成功 {summary.success}，失败 {summary.failed}，跳过 {summary.skipped}
          </p>
        )}
      </div>
    </Modal>
  );
}
