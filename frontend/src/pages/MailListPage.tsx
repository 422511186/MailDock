import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Paperclip, ChevronLeft, Mail } from 'lucide-react';
import type { ApiClient, MessageSummary } from '../api/client';

/** 默认每页条数。 */
const DEFAULT_PAGE_SIZE = 20;

/** 允许的每页条数白名单。 */
const PAGE_SIZES = [10, 20, 50, 100];

interface MailListPageProps {
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

/** 邮件列表页：展示某账号收件箱邮件，支持刷新、分页与进入详情。 */
export function MailListPage({ api }: MailListPageProps) {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lastRefreshTime = useRef(0);

  const accountIdNum = accountId ? parseInt(accountId, 10) : 0;

  // 视图状态以 URL 查询参数为唯一真相：page、size。缺省即回退到默认值。
  const pageParam = parseInt(searchParams.get('page') ?? '', 10);
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const sizeParam = parseInt(searchParams.get('size') ?? '', 10);
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;

  /** 按当前 URL 视图状态拉取邮件（供 effect 与刷新后显式调用）。 */
  const reload = useCallback(
    async (targetPage: number = page, size: number = pageSize) => {
      setError('');
      try {
        const res = await api.listMessages(accountIdNum, targetPage, size);
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [api, accountIdNum, page, pageSize],
  );

  // URL（page/size）或账号变化时加载并滚动到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
    void reload();
  }, [reload]);

  /** 只改 page 查询参数（=1 时删除以保持 URL 干净）。 */
  const goToPage = useCallback(
    (targetPage: number) => {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        if (targetPage <= 1) sp.delete('page');
        else sp.set('page', String(targetPage));
        return sp;
      });
    },
    [setSearchParams],
  );

  /** 改每页条数：重置 page 为 1 并写入 size（=默认值时删除）。 */
  const changePageSize = useCallback(
    (size: number) => {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('page');
        if (size === DEFAULT_PAGE_SIZE) sp.delete('size');
        else sp.set('size', String(size));
        return sp;
      });
    },
    [setSearchParams],
  );

  /** 点击刷新：触发增量同步后重新加载当前列表。 */
  const handleRefresh = useCallback(async () => {
    // 防抖：1秒内只能触发一次
    const now = Date.now();
    if (now - lastRefreshTime.current < 1000) {
      return;
    }
    lastRefreshTime.current = now;

    setError('');
    setBusy(true);
    try {
      const res = await api.refresh(accountIdNum);
      // 原型 section-11 Toast 结构：无论有无新邮件都显示
      const toast = document.createElement('div');
      toast.className = 'flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 p-4 shadow-lg shadow-emerald-100/50 animate-slide-in-right fixed right-4 top-20 z-40 max-w-sm';

      // Icon container
      const iconDiv = document.createElement('div');
      iconDiv.innerHTML = '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>';

      // Text container
      const textDiv = document.createElement('div');
      textDiv.className = 'flex-1';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'font-medium text-emerald-800 dark:text-emerald-300';
      titleDiv.textContent = '收信完成';

      const descDiv = document.createElement('div');
      descDiv.className = 'mt-0.5 text-sm text-emerald-700 dark:text-emerald-400';

      if (res.newCount > 0) {
        iconDiv.className = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white';
        descDiv.textContent = `新增 ${res.newCount} 封邮件`;
      } else {
        iconDiv.className = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-400 text-white';
        titleDiv.className = 'font-medium text-slate-700 dark:text-slate-200';
        descDiv.className = 'mt-0.5 text-sm text-slate-600 dark:text-slate-400';
        descDiv.textContent = '暂无新邮件';
        // 无新邮件时使用 slate 背景
        toast.className = 'flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 p-4 shadow-lg shadow-slate-100/50 animate-slide-in-right fixed right-4 top-20 z-40 max-w-sm';
      }

      textDiv.appendChild(titleDiv);
      textDiv.appendChild(descDiv);
      toast.appendChild(iconDiv);
      toast.appendChild(textDiv);

      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
      // 回到第 1 页查看最新邮件；若本就在第 1 页，URL 不变、effect 不重跑，故显式重拉。
      goToPage(1);
      await reload(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, accountIdNum, goToPage, reload]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* 移动端顶部栏 */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm sm:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/accounts')}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="返回"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">收件箱</h1>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white transition hover:from-emerald-600 hover:to-emerald-700"
            aria-label="收取邮件"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 桌面端白色卡片容器 */}
      <div className="hidden sm:block sm:mx-auto sm:max-w-5xl sm:px-6 sm:py-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          {/* 桌面端渐变标题栏 */}
          <div className="bg-gradient-to-r from-slate-50 to-emerald-50 dark:from-slate-800/60 dark:to-emerald-950/30 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                收件箱
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:from-emerald-600 hover:to-emerald-700"
                  aria-label="收取邮件"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  收取邮件
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/accounts')}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  aria-label="返回"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  返回
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 py-3">
              <p className="error" role="alert">{error}</p>
            </div>
          )}

          {/* 桌面端邮件列表 */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((m) => (
              <div
                key={m.id}
                className={`cursor-pointer p-4 transition ${
                  m.isRead ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-emerald-50/30 dark:bg-emerald-950/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
                }`}
                onClick={() => navigate(`/accounts/${accountId}/messages/${m.id}`)}
              >
                <div className="flex items-start gap-3">
                  {/* 头像 */}
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${
                      m.isRead
                        ? 'from-slate-400 to-slate-500'
                        : 'from-emerald-500 to-emerald-600 shadow-md'
                    }`}
                  >
                    {getEmailInitial(m.fromAddr)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {!m.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                        <span className={m.isRead ? 'text-sm text-slate-600 dark:text-slate-400' : 'text-sm font-semibold text-slate-800 dark:text-slate-100'}>
                          {m.fromAddr}
                        </span>
                        {m.hasAttach && (
                          <Paperclip className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
                        {formatTime(m.receivedAt)}
                      </span>
                    </div>
                    <div className={`text-sm ${m.isRead ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-800 dark:text-slate-100'}`}>
                      {m.subject}
                    </div>
                    {/* 桌面端显示预览文本 */}
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      邮件预览文本（待后端支持）
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 桌面端分页 */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-3">
            <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
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
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 移动端内容区 */}
      <div className="sm:hidden">
        {error && <div className="px-4 py-3"><p className="error" role="alert">{error}</p></div>}

        {/* 移动端邮件列表 */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {items.map((m) => (
            <div
              key={m.id}
              className={`cursor-pointer p-4 transition ${
                m.isRead ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-emerald-50/30 dark:bg-emerald-950/20 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
              }`}
              onClick={() => navigate(`/accounts/${accountId}/messages/${m.id}`)}
            >
              <div className="flex items-start gap-3">
                {/* 头像 */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white ${
                    m.isRead
                      ? 'from-slate-400 to-slate-500'
                      : 'from-emerald-500 to-emerald-600 shadow-md'
                  }`}
                >
                  {getEmailInitial(m.fromAddr)}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {!m.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                      <span className={m.isRead ? 'text-sm text-slate-600' : 'text-sm font-semibold text-slate-800'}>
                        {m.fromAddr}
                      </span>
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {formatTime(m.receivedAt)}
                    </span>
                  </div>
                  <div className={`text-sm ${m.isRead ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-800 dark:text-slate-100'}`}>
                    {m.subject}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 移动端分页 */}
        <div className="bg-white dark:bg-slate-900 px-4 py-3">
          <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                共 {total} 封邮件，第 {page} / {totalPages} 页
              </span>
              <label className="flex items-center gap-1.5">
                每页
                <select
                  aria-label="每页条数"
                  value={pageSize}
                  onChange={(e) => {
                    changePageSize(Number(e.target.value));
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
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
