import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiClient,
  Account,
  AccountStatusFilter,
  ImportResult,
} from '../api/client';

/** 账号管理页属性。 */
interface AccountsPageProps {
  /** API 客户端。 */
  api: ApiClient;
  /** 点击某账号进入其邮件列表的回调。 */
  onOpenAccount: (accountId: number) => void;
}

/** 默认每页条数。 */
const DEFAULT_PAGE_SIZE = 20;

/** 账号三态：待检测 / 正常 / 异常，从 lastTestAt + lastTestOk 派生。 */
function statusOf(a: Account): { label: string; cls: string } {
  if (!a.lastTestAt) {
    return { label: '待检测', cls: 'bg-amber-100 text-amber-700 ring-amber-200' };
  }
  if (a.lastTestOk) {
    return { label: '正常', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' };
  }
  return { label: '异常', cls: 'bg-rose-100 text-rose-700 ring-rose-200' };
}

/** 将毫秒时间戳转为北京时间字符串。 */
function formatBeijingTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 账号管理页：查询区（邮箱搜索 + 状态过滤）、分页列表（含三态测活状态）、
 * 弹窗新增账号、弹窗批量导入（文本 + 文件上传）、单个测活、批量测活、删除。
 */
export function AccountsPage({ api, onOpenAccount }: AccountsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 查询条件
  const [searchInput, setSearchInput] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<AccountStatusFilter | ''>('');

  // 排序
  const [sortBy, setSortBy] = useState('lastSyncAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 弹窗开关
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  /** 按当前条件加载账号列表。 */
  const reload = useCallback(async () => {
    try {
      const result = await api.listAccounts({
        email: email || undefined,
        status: status || undefined,
        sortBy,
        sortOrder,
        page,
        size: pageSize,
      });
      setAccounts(result.items);
      setTotal(result.total);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, email, status, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 提交搜索：回到第 1 页并应用邮箱条件。 */
  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setPage(1);
    setEmail(searchInput.trim());
  }

  /** 切换状态过滤：回到第 1 页。 */
  function handleStatusChange(value: string) {
    setPage(1);
    setStatus(value as AccountStatusFilter | '');
  }

  /** 删除账号。 */
  async function handleDelete(id: number) {
    if (!confirm('确认删除该账号吗？')) return;
    setError('');
    try {
      await api.deleteAccount(id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /** 单个测活。 */
  async function handleTestOne(id: number) {
    setError('');
    setTestingId(id);
    try {
      await api.testConnection(id);
      await reload();
      // 测活完成后弹窗通知
      const toast = document.createElement('div');
      toast.className = 'toast success';
      toast.textContent = '✓ 测活完成';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  /** 批量测活。 */
  async function handleTestBatch() {
    setError('');
    setBusy(true);
    try {
      await api.testBatch(selectedIds.length > 0 ? selectedIds : undefined);
      await reload();
      setSelectedIds([]);
      // 批量测活完成后弹窗通知
      const toast = document.createElement('div');
      toast.className = 'toast success';
      toast.textContent = '✓ 批量测活完成';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 批量删除。 */
  async function handleDeleteBatch() {
    if (selectedIds.length === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.length} 个账号吗？`)) return;
    setError('');
    setBusy(true);
    try {
      await api.deleteBatch(selectedIds);
      await reload();
      setSelectedIds([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 切换单个选择。 */
  function toggleSelect(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  /** 当前页是否已全选（有账号且每个都在选中集合内）。 */
  const allSelected = accounts.length > 0 && accounts.every(a => selectedIds.includes(a.id));

  /** 切换全选：已全选则清空，否则选中当前页全部账号。 */
  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : accounts.map(a => a.id));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="app-main">
      {/* 顶部操作栏 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">邮箱账号</h2>
        <div className="flex gap-2">
          {/* 视图切换 */}
          <div className="hidden sm:flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setViewMode('table')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setViewMode('grid')}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAdd(true)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增账号
          </button>
          <button type="button" onClick={() => setShowImport(true)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            导入
          </button>
          {selectedIds.length > 0 && (
            <>
              <button type="button" onClick={handleTestBatch} disabled={busy}>
                批量测活 ({selectedIds.length})
              </button>
              <button type="button" className="btn-danger" onClick={handleDeleteBatch} disabled={busy}>
                批量删除
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {/* 搜索过滤栏 */}
      <form
        onSubmit={handleSearch}
        className="mb-6 flex flex-wrap gap-3"
      >
        <input
          type="text"
          placeholder="搜索邮箱..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-[240px] rounded-lg border-0 bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
          autoComplete="off"
        />
        <select
          id="status-filter"
          aria-label="状态过滤"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-lg border-0 bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部状态</option>
          <option value="pending">待检测</option>
          <option value="ok">正常</option>
          <option value="fail">异常</option>
        </select>
        <select
          id="sort-by"
          aria-label="排序方式"
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-');
            setSortBy(field);
            setSortOrder(order as 'asc' | 'desc');
          }}
          className="rounded-lg border-0 bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500"
        >
          <option value="lastSyncAt-desc">最近收信</option>
          <option value="lastSyncAt-asc">最早收信</option>
          <option value="lastTestAt-desc">最近测活</option>
          <option value="lastTestAt-asc">最早测活</option>
        </select>
      </form>

      {/* 账号列表 */}
      {viewMode === 'table' ? (
        <>
          {/* 桌面端表格 */}
          <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-12 px-6 py-4">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allSelected}
                      aria-label="全选"
                      onClick={toggleSelectAll}
                      className="checkbox-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        minWidth: '18px',
                        minHeight: '18px',
                        padding: 0,
                        margin: 0,
                        border: '2px solid',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                        backgroundColor: allSelected ? 'rgb(59, 130, 246)' : 'white',
                        borderColor: allSelected ? 'rgb(59, 130, 246)' : 'rgb(203, 213, 225)',
                        boxShadow: allSelected ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!allSelected) e.currentTarget.style.borderColor = 'rgb(96, 165, 250)';
                      }}
                      onMouseLeave={(e) => {
                        if (!allSelected) e.currentTarget.style.borderColor = 'rgb(203, 213, 225)';
                      }}
                    >
                      <svg
                        className={`text-white transition-all duration-200 ${
                          allSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                        }`}
                        style={{ width: '12px', height: '12px' }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </th>
                <th className="px-6 py-4">邮箱</th>
                <th className="px-6 py-4 text-center">状态</th>
                <th className="px-6 py-4 text-center">最近测活</th>
                <th className="px-6 py-4 text-center">最近收信</th>
                <th className="px-6 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <svg className="mx-auto mb-4 h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <p className="text-slate-400">暂无邮箱账号</p>
                  </td>
                </tr>
              ) : (
                accounts.map((a) => {
                  const st = statusOf(a);
                  const isSelected = selectedIds.includes(a.id);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`选择 ${a.email}`}
                            onClick={() => toggleSelect(a.id)}
                            className="checkbox-btn"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '18px',
                              height: '18px',
                              minWidth: '18px',
                              minHeight: '18px',
                              padding: 0,
                              margin: 0,
                              border: '2px solid',
                              borderRadius: '4px',
                              boxSizing: 'border-box',
                              flexShrink: 0,
                              transition: 'all 0.2s',
                              backgroundColor: isSelected ? 'rgb(59, 130, 246)' : 'white',
                              borderColor: isSelected ? 'rgb(59, 130, 246)' : 'rgb(203, 213, 225)',
                              boxShadow: isSelected ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.borderColor = 'rgb(96, 165, 250)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.borderColor = 'rgb(203, 213, 225)';
                            }}
                          >
                            <svg
                              className={`text-white transition-all duration-200 ${
                                isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                              }`}
                              style={{ width: '12px', height: '12px' }}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          className="link text-sm font-medium text-slate-900 hover:text-brand-600"
                          onClick={() => onOpenAccount(a.id)}
                        >
                          {a.email}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}
                            title={a.lastTestMsg || ''}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              st.label === '正常' ? 'bg-emerald-500' : st.label === '异常' ? 'bg-red-500' : 'bg-amber-500'
                            }`} />
                            {st.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-slate-600">
                        {formatBeijingTime(a.lastTestAt)}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-slate-600">
                        {formatBeijingTime(a.lastSyncAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            onClick={() => handleTestOne(a.id)}
                            disabled={testingId === a.id}
                          >
                            {testingId === a.id ? '测活中...' : '测活'}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                            onClick={() => handleDelete(a.id)}
                            title="删除"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 移动端卡片 */}
        <div className="sm:hidden space-y-3">
          {accounts.length === 0 ? (
            <div className="rounded-2xl bg-white p-16 text-center shadow-sm">
              <svg className="mx-auto mb-4 h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-slate-400">暂无邮箱账号</p>
            </div>
          ) : (
            accounts.map((a) => {
              const st = statusOf(a);
              const isSelected = selectedIds.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={`overflow-hidden rounded-2xl bg-white shadow-sm transition-all ${
                    isSelected ? 'ring-2 ring-brand-500' : 'ring-1 ring-slate-200/50'
                  }`}
                >
                  <div className={`h-1 ${isSelected ? 'bg-brand-500' : 'bg-gradient-to-r from-slate-100 to-slate-50'}`} />
                  <div className="p-5">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="cursor-pointer" onClick={() => toggleSelect(a.id)}>
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                            isSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white hover:border-brand-400'
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`} title={a.lastTestMsg || ''}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          st.label === '正常' ? 'bg-emerald-500' : st.label === '异常' ? 'bg-red-500' : 'bg-amber-500'
                        }`} />
                        {st.label}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="link mb-4 block w-full break-all text-left text-base font-semibold text-slate-900 hover:text-brand-600"
                      onClick={() => onOpenAccount(a.id)}
                    >
                      {a.email}
                    </button>
                    <div className="mb-4 space-y-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-500">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{formatBeijingTime(a.lastTestAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>{formatBeijingTime(a.lastSyncAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => handleTestOne(a.id)}
                        disabled={testingId === a.id}
                      >
                        {testingId === a.id ? '测活中...' : '测活'}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                        onClick={() => handleDelete(a.id)}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.length === 0 ? (
          <div className="col-span-full rounded-2xl bg-white p-16 text-center shadow-sm">
            <svg className="mx-auto mb-4 h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-slate-400">暂无邮箱账号</p>
          </div>
        ) : (
          accounts.map((a) => {
            const st = statusOf(a);
            const isSelected = selectedIds.includes(a.id);
            return (
              <div
                key={a.id}
                className={`group relative overflow-hidden rounded-2xl bg-white shadow-sm transition-all hover:shadow-lg ${
                  isSelected ? 'ring-2 ring-brand-500' : 'ring-1 ring-slate-200/50'
                }`}
              >
                {/* 顶部装饰条 */}
                <div className={`h-1 ${isSelected ? 'bg-brand-500' : 'bg-gradient-to-r from-slate-100 to-slate-50'}`} />

                <div className="p-5">
                  {/* 顶栏：选择框 + 状态 */}
                  <div className="mb-4 flex items-start justify-between">
                    <div
                      className="cursor-pointer"
                      onClick={() => toggleSelect(a.id)}
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                          isSelected
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-slate-300 bg-white hover:border-brand-400'
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}
                      title={a.lastTestMsg || ''}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        st.label === '正常' ? 'bg-emerald-500' : st.label === '异常' ? 'bg-red-500' : 'bg-amber-500'
                      }`} />
                      {st.label}
                    </span>
                  </div>

                  {/* 邮箱地址 */}
                  <button
                    type="button"
                    className="link mb-4 block w-full break-all text-left text-base font-semibold text-slate-900 hover:text-brand-600"
                    onClick={() => onOpenAccount(a.id)}
                  >
                    {a.email}
                  </button>

                  {/* 信息栏 */}
                  <div className="mb-4 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{formatBeijingTime(a.lastTestAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>{formatBeijingTime(a.lastSyncAt)}</span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      onClick={() => handleTestOne(a.id)}
                      disabled={testingId === a.id}
                    >
                      {testingId === a.id ? '测活中...' : '测活'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                      onClick={() => handleDelete(a.id)}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* 分页 */}
      <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span>
            共 {total} 个账号，第 {page} / {totalPages} 页
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            下一页
          </button>
        </div>
      </div>

      {/* 新增账号弹窗 */}
      {showAdd && (
        <AddAccountModal
          api={api}
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false);
            await reload();
          }}
        />
      )}

      {/* 批量导入弹窗 */}
      {showImport && (
        <ImportModal
          api={api}
          onClose={() => setShowImport(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}

/** 弹窗外壳：遮罩 + 居中卡片 + 标题 + 关闭。 */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl animate-slide-up sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 sm:text-lg">{title}</h3>
          <button
            type="button"
            className="link text-lg"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 新增账号弹窗表单。 */
function AddAccountModal({
  api,
  onClose,
  onCreated,
}: {
  api: ApiClient;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
    <Modal title="新增账号" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-email" className="text-sm text-slate-500">
            邮箱
          </label>
          <input
            id="add-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="example@163.com"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-authcode" className="text-sm text-slate-500">
            授权码
          </label>
          <input
            id="add-authcode"
            type="password"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            autoComplete="off"
            placeholder="163 邮箱 IMAP 授权码"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            确认添加
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** 批量导入弹窗：支持文本粘贴与文件上传。 */
function ImportModal({
  api,
  onClose,
  onImported,
}: {
  api: ApiClient;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [summary, setSummary] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 读取上传的 txt 文件填入文本域。 */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
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
    <Modal title="批量导入账号" onClose={onClose}>
      <div className="flex flex-col gap-3 sm:gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-slate-500 sm:text-sm">
          每行一个账号，格式：<code className="rounded bg-slate-100 px-1">账号 授权码</code>
          （空格或 Tab 分隔），以 # 开头的行视为注释。
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-text" className="text-sm text-slate-500">
            批量导入
          </label>
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'a@163.com auth-code-1\nb@163.com auth-code-2'}
            rows={6}
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none transition focus:border-brand-500 sm:text-sm"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button type="button" onClick={() => fileRef.current?.click()}>
            上传文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            aria-label="上传文件"
            onChange={handleFile}
          />
          <label className="flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            已存在则覆盖授权码
          </label>
        </div>

        {summary && (
          <p className="rounded-lg bg-brand-50 p-3 text-xs text-brand-700 sm:text-sm">
            共 {summary.total}，成功 {summary.success}，失败 {summary.failed}，跳过{' '}
            {summary.skipped}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={busy}
          >
            确认导入
          </button>
        </div>
      </div>
    </Modal>
  );
}
