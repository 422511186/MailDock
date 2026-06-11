import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, MessageSummary } from '../api/client';

/** 每页邮件数量。 */
const PAGE_SIZE = 20;

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** 拉取指定页邮件。 */
  const load = useCallback(
    async (targetPage: number) => {
      setError('');
      try {
        const res = await api.listMessages(accountId, targetPage, PAGE_SIZE);
        setItems(res.items);
        setTotal(res.total);
        setPage(targetPage);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [api, accountId],
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-main">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-2">
          <button type="button" onClick={onBack}>
            返回
          </button>
          <button type="button" onClick={() => void handleRefresh()} disabled={busy} className="btn-primary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {busy ? '刷新中…' : '刷新'}
          </button>
        </div>
        <h2 className="text-xl font-semibold text-slate-800">收件箱</h2>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>主题</th>
            <th>发件人</th>
            <th>时间</th>
            <th>附件</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id} className={m.isRead ? 'mail-row' : 'mail-row unread'}>
              <td>
                {/* 点击主题进入邮件详情 */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenMessage(m.id);
                  }}
                >
                  {m.subject}
                </a>
              </td>
              <td>{m.fromAddr}</td>
              <td>{formatTime(m.receivedAt)}</td>
              <td>{m.hasAttach ? '📎' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 分页 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>
          共 {total} 封邮件，第 {page} / {totalPages} 页
        </span>
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
