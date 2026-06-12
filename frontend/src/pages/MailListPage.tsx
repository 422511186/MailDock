import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, User, Paperclip } from 'lucide-react';
import type { ApiClient, MessageSummary } from '../api/client';

/** 默认每页条数。 */
const DEFAULT_PAGE_SIZE = 20;

interface MailListPageProps {
  /** API 客户端。 */
  api: ApiClient;
  /** 当前账号 ID。 */
  accountId: number;
  /** 打开某封邮件详情。 */
  onOpenMessage: (id: number) => void;
  /** 返回账号列表。 */
  onBack: () => void;
}

/** 将毫秒时间戳格式化为本地时间字符串。 */
function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

/** 邮件列表页：展示某账号收件箱邮件，支持刷新、分页与进入详情。 */
export function MailListPage({ api, accountId, onOpenMessage, onBack }: MailListPageProps) {
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** 拉取指定页邮件。 */
  const load = useCallback(
    async (targetPage: number) => {
      setError('');
      try {
        const res = await api.listMessages(accountId, targetPage, pageSize);
        setItems(res.items);
        setTotal(res.total);
        setPage(targetPage);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [api, accountId, pageSize],
  );

  // 进入页面或切换账号时加载第一页
  useEffect(() => {
    void load(1);
  }, [load]);

  /** 点击刷新：触发增量同步后重新加载当前列表。 */
  const handleRefresh = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.refresh(accountId);
      if (res.newCount > 0) {
        // 使用 toast 通知，3秒后自动消失
        const toast = document.createElement('div');
        toast.className = 'toast success';
        toast.textContent = `✓ 新增 ${res.newCount} 封邮件`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
      await load(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, accountId, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="app-main">
      <div className="mb-4 sm:mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack}>
            返回
          </button>
          <button type="button" onClick={() => void handleRefresh()} disabled={busy} className="btn-primary">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{busy ? '刷新中…' : '刷新'}</span>
          </button>
        </div>
        <h2 className="text-xl font-semibold text-slate-800">收件箱</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="space-y-3">
        {items.map((m) => (
          <div
            key={m.id}
            className={`group rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
              m.isRead ? 'ring-1 ring-slate-200' : 'ring-2 ring-brand-300 bg-brand-50/30'
            }`}
            onClick={() => onOpenMessage(m.id)}
          >
            <div className="mb-3 flex items-start gap-3">
              {!m.isRead && (
                <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
              )}
              <h3 className={`flex-1 break-all text-base leading-snug ${
                m.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'
              }`}>
                {m.subject}
              </h3>
              {m.hasAttach && (
                <Paperclip className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="break-all text-xs">{m.fromAddr}</span>
              </div>
              <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{formatTime(m.receivedAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 分页 */}
      <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span>
            共 {total} 封邮件，第 {page} / {totalPages} 页
          </span>
          <label className="flex items-center gap-1.5">
            每页
            <select
              aria-label="每页条数"
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            条
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load(page - 1)}
            disabled={page <= 1}
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => void load(page + 1)}
            disabled={page >= totalPages}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
