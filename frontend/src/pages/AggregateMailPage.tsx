import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Search, RefreshCw, Paperclip } from 'lucide-react';
import type { Account, ApiClient, MessageSummary } from '../api/client';
import { truncateEmail } from '../utils/email';
import { runBatchRefresh } from './accountsPageModel';
import {
  filterFromParams,
  pageFromParams,
  paramsFromState,
  sizeFromParams,
  toMessageQuery,
  type AggregateFilterState,
} from './aggregateMailPageModel';

interface AggregateMailPageProps {
  /** API 客户端。 */
  api: ApiClient;
}

/** 将毫秒时间戳格式化为相对时间字符串。 */
function formatTime(ts: number): string {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;

  return new Date(ts).toLocaleDateString();
}

/** 根据邮箱地址提取首字母（大写）。 */
function getEmailInitial(email: string): string {
  return email.charAt(0).toUpperCase();
}

/** 弹出一个固定在右上角的汇总 Toast（沿用 MailListPage 的 DOM Toast 风格）。 */
function showToast(title: string, desc: string) {
  const toast = document.createElement('div');
  toast.className =
    'flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-4 shadow-lg shadow-emerald-100/50 animate-slide-in-right fixed right-4 top-20 z-40 max-w-sm';
  toast.innerHTML = `
    <div class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <div class="flex-1">
      <div class="font-medium text-emerald-800 dark:text-emerald-300">${title}</div>
      <div class="mt-0.5 text-sm text-emerald-700 dark:text-emerald-400">${desc}</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/** 聚合邮件管理页：跨账号搜索、过滤、分页查看邮件，支持一键收取全部账号。 */
export function AggregateMailPage({ api }: AggregateMailPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  // 视图状态以 URL 查询参数为唯一真相：过滤态 + 页码 + 每页条数。
  // 用 URL 字符串记忆，保证无关 state 变化（如 accounts 加载）不会改变这些引用，避免重复搜索。
  const search = searchParams.toString();
  const filter = useMemo(() => filterFromParams(searchParams), [search]);
  const page = useMemo(() => pageFromParams(searchParams), [search]);
  const pageSize = useMemo(() => sizeFromParams(searchParams), [search]);

  // 关键词输入框的即时缓冲：随 URL 的 q 初始化，仅在提交时写回 URL。
  const [keywordInput, setKeywordInput] = useState(filter.keyword);

  /** 按当前 URL 视图状态搜索邮件（供 effect 与刷新后显式调用）。 */
  const reload = useCallback(
    async (f: AggregateFilterState = filter, targetPage: number = page, size: number = pageSize) => {
      setError('');
      try {
        const res = await api.searchMessages(toMessageQuery(f, targetPage, size));
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [api, filter, page, pageSize],
  );

  // 进入页面：加载账号列表（用于下拉、徽章与收取全部）
  useEffect(() => {
    void (async () => {
      try {
        const res = await api.listAccounts({ size: 100 });
        setAccounts(res.items);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [api]);

  // URL（过滤/页码/每页）变化时滚动到顶部并搜索
  useEffect(() => {
    window.scrollTo(0, 0);
    void reload();
  }, [reload]);

  /** 合并过滤态补丁并写入 URL（重置 page 为 1）。 */
  const updateFilter = useCallback(
    (patch: Partial<AggregateFilterState>) => {
      setSearchParams(paramsFromState({ ...filter, ...patch }, 1, pageSize));
    },
    [filter, pageSize, setSearchParams],
  );

  /** 提交关键字搜索：把输入缓冲写入 URL（重置 page 为 1）。 */
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter({ keyword: keywordInput });
  };

  /** 只改页码并写入 URL。 */
  const goToPage = useCallback(
    (targetPage: number) => {
      setSearchParams(paramsFromState(filter, targetPage, pageSize));
    },
    [filter, pageSize, setSearchParams],
  );

  /** 改每页条数：重置 page 为 1 并写入 URL。 */
  const changePageSize = useCallback(
    (size: number) => {
      setSearchParams(paramsFromState(filter, 1, size));
    },
    [filter, setSearchParams],
  );

  /** 收取全部账号：串行 refresh，进度回显，完成后重新搜索并提示。 */
  const handleRefreshAll = useCallback(async () => {
    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const s = await runBatchRefresh(api.refresh.bind(api), ids, (done, t) =>
        setProgress(`正在收取 ${done}/${t}`),
      );
      // 收取后重新搜索当前视图（URL 不变，effect 不重跑，故显式重拉）
      await reload();
      showToast(
        '收取完成',
        `成功 ${s.successCount}/${ids.length}，新增 ${s.newTotal} 封${s.failCount ? `，失败 ${s.failCount}` : ''}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress('');
      setBusy(false);
    }
  }, [accounts, api, reload]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** 查找账号邮箱用于徽章展示。 */
  const accountEmail = (id: number): string => accounts.find((a) => a.id === id)?.email ?? '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          {/* 标题栏与工具栏 */}
          <div className="bg-gradient-to-r from-slate-50 to-emerald-50 dark:from-slate-800/60 dark:to-emerald-950/30 px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                全部邮件
              </h2>
              <button
                type="button"
                onClick={() => void handleRefreshAll()}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                {busy && progress ? progress : '收取全部'}
              </button>
            </div>

            {/* 搜索 + 过滤控件 */}
            <form onSubmit={handleSearch} className="mt-4 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="搜索主题 / 发件人 / 正文"
                  aria-label="搜索关键字"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                搜索
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="所属账号"
                value={filter.accountId === 'all' ? 'all' : String(filter.accountId)}
                onChange={(e) =>
                  updateFilter({ accountId: e.target.value === 'all' ? 'all' : Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              >
                <option value="all">全部账号</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} title={a.email}>
                    {truncateEmail(a.email)}
                  </option>
                ))}
              </select>
              <select
                aria-label="已读状态"
                value={filter.readState}
                onChange={(e) => updateFilter({ readState: e.target.value as AggregateFilterState['readState'] })}
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              >
                <option value="all">全部</option>
                <option value="read">已读</option>
                <option value="unread">未读</option>
              </select>
              <select
                aria-label="附件状态"
                value={filter.attachState}
                onChange={(e) => updateFilter({ attachState: e.target.value as AggregateFilterState['attachState'] })}
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              >
                <option value="all">全部</option>
                <option value="with">有附件</option>
                <option value="without">无附件</option>
              </select>
              <input
                type="date"
                aria-label="开始日期"
                value={filter.startDate}
                onChange={(e) => updateFilter({ startDate: e.target.value })}
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                aria-label="结束日期"
                value={filter.endDate}
                onChange={(e) => updateFilter({ endDate: e.target.value })}
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              />
              <select
                aria-label="排序"
                value={`${filter.sortBy}-${filter.sortOrder}`}
                onChange={(e) => {
                  const idx = e.target.value.lastIndexOf('-');
                  const sortBy = e.target.value.slice(0, idx);
                  const sortOrder = e.target.value.slice(idx + 1) as AggregateFilterState['sortOrder'];
                  updateFilter({ sortBy, sortOrder });
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1.5 text-sm"
              >
                <option value="received_at-desc">最新接收</option>
                <option value="received_at-asc">最早接收</option>
                <option value="sent_at-desc">发送时间</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 sm:px-6">
              <p className="error" role="alert">{error}</p>
            </div>
          )}

          {/* 邮件列表 */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 && !error && (
              <div className="px-6 py-12 text-center text-sm text-slate-400 dark:text-slate-500">暂无邮件</div>
            )}
            {items.map((m) => {
              const email = accountEmail(m.accountId);
              return (
              <div
                key={m.id}
                className={`cursor-pointer p-4 transition ${
                  m.isRead
                    ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    : 'bg-emerald-50/30 dark:bg-emerald-950/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
                }`}
                onClick={() => navigate(`/accounts/${m.accountId}/messages/${m.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${
                      m.isRead ? 'from-slate-400 to-slate-500' : 'from-emerald-500 to-emerald-600 shadow-md'
                    }`}
                  >
                    {getEmailInitial(m.fromAddr)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {!m.isRead && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />}
                        <span className={m.isRead ? 'truncate text-sm text-slate-600 dark:text-slate-400' : 'truncate text-sm font-semibold text-slate-800 dark:text-slate-100'}>
                          {m.fromAddr}
                        </span>
                        {m.hasAttach && (
                          <Paperclip className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
                        {formatTime(m.receivedAt)}
                      </span>
                    </div>
                    <div className={`text-sm ${m.isRead ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-800 dark:text-slate-100'}`}>
                      {m.subject}
                    </div>
                    {email && (
                      <div className="mt-1">
                        <span
                          title={email}
                          className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400"
                        >
                          {truncateEmail(email)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* 分页 */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span>
                  共 {total} 封，第 {page} / {totalPages} 页
                </span>
                <label className="flex items-center gap-1.5">
                  每页
                  <select
                    aria-label="每页条数"
                    value={pageSize}
                    onChange={(e) => {
                      changePageSize(Number(e.target.value));
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
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
                <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                  上一页
                </button>
                <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
