import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Upload,
  Trash2,
  Mail,
  Search,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import type {
  Account,
  AccountStatusFilter,
} from '../api/client';
import {
  DEFAULT_PAGE_SIZE,
  emailToAvatarGradient,
  formatRelativeTime,
  runBatchRefresh,
  statusDot,
  statusOf,
} from './accountsPageModel';
import type { AccountsPageProps } from './accountsPageModel';
import { AddAccountModal } from './accounts/AddAccountModal';
import { ConfirmDeleteModal } from './accounts/ConfirmDeleteModal';
import type { DeleteTarget } from './accounts/ConfirmDeleteModal';
import { ConfirmTestModal } from './accounts/ConfirmTestModal';
import type { TestTarget } from './accounts/ConfirmTestModal';
import { ImportModal } from './accounts/ImportModal';
import { RowMenu } from './accounts/RowMenu';

/**
 * 账号管理页：白色卡片工具栏（搜索 + 状态/排序 + 批量按钮 + 已选中提示条）、
 * 白色卡片表格（彩色头像 + 状态徽章带圆点 + 三点菜单），
 * 弹窗新增账号、弹窗批量导入（文本 + 文件上传）、单个测活、批量测活、删除。
 */
export function AccountsPage({ api }: AccountsPageProps) {
  const navigate = useNavigate();
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

  // 删除确认弹窗目标：单个（含邮箱）或批量（含数量）。
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // 测活确认弹窗目标：单个（含邮箱）或批量（ids 为空表示测全部）。
  const [testTarget, setTestTarget] = useState<TestTarget | null>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

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
  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    setPage(1);
    setEmail(searchInput.trim());
  }

  /** 切换状态过滤：回到第 1 页。 */
  function handleStatusChange(value: string) {
    setPage(1);
    setStatus(value as AccountStatusFilter | '');
  }

  /** 打开单个删除确认弹窗。 */
  function handleDelete(id: number, email: string) {
    setDeleteTarget({ type: 'one', id, email });
  }

  /** 打开单个测活确认弹窗。 */
  function handleTestOne(id: number, email: string) {
    setTestTarget({ type: 'one', id, email });
  }

  /** 打开批量测活确认弹窗（未选中则 ids 为空，表示测全部）。 */
  function handleTestBatch() {
    setTestTarget({ type: 'batch', ids: selectedIds });
  }

  /** 批量收信：选中则收选中项，未选中则收当前用户全部账号。 */
  async function handleRefreshBatch() {
    setError('');
    setBusy(true);
    try {
      let ids = selectedIds;
      if (ids.length === 0) {
        // 未选中：收当前用户全部账号（取全量 id，而非当前页）
        const all = await api.listAccounts({ size: 1000 });
        ids = all.items.map((a) => a.id);
      }
      const summary = await runBatchRefresh(api.refresh.bind(api), ids);
      await reload();
      setSelectedIds([]);
      const failPart = summary.failCount > 0 ? `，失败 ${summary.failCount}` : '';
      showToast(
        `✓ 收信完成：成功 ${summary.successCount}/${ids.length}，新增 ${summary.newTotal} 封${failPart}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 执行测活（确认弹窗「确认测活」回调）。 */
  async function confirmTest() {
    if (!testTarget) return;
    setError('');
    if (testTarget.type === 'one') {
      setTestingId(testTarget.id);
      setTestTarget(null);
      try {
        await api.testConnection(testTarget.id);
        await reload();
        showToast('✓ 测活完成');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setTestingId(null);
      }
      return;
    }
    // 批量：选中则测选中项，未选中传 undefined 测全部
    const ids = testTarget.ids;
    setBusy(true);
    setTestTarget(null);
    try {
      await api.testBatch(ids.length > 0 ? ids : undefined);
      await reload();
      setSelectedIds([]);
      showToast('✓ 批量测活完成');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 打开批量删除确认弹窗。 */
  function handleDeleteBatch() {
    if (selectedIds.length === 0) return;
    setDeleteTarget({ type: 'batch', ids: selectedIds });
  }

  /** 执行删除（确认弹窗「确认删除」回调）。 */
  async function confirmDelete() {
    if (!deleteTarget) return;
    setError('');
    setBusy(true);
    try {
      if (deleteTarget.type === 'one') {
        await api.deleteAccount(deleteTarget.id);
        showToast('✓ 成功删除账号');
      } else {
        await api.deleteBatch(deleteTarget.ids);
        setSelectedIds([]);
        showToast(`✓ 成功删除 ${deleteTarget.ids.length} 个账号`);
      }
      await reload();
      setDeleteTarget(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 弹出短暂成功提示。 */
  function showToast(text: string) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  /** 切换单个选择。 */
  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  /** 当前页是否已全选（有账号且每个都在选中集合内）。 */
  const allSelected =
    accounts.length > 0 && accounts.every((a) => selectedIds.includes(a.id));

  /** 切换全选：已全选则清空，否则选中当前页全部账号。 */
  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : accounts.map((a) => a.id));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="app-main">
      {/* 页标题 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">邮箱账号</h2>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}

      {/* 白色卡片工具栏 */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* 桌面端工具栏：单行布局 */}
        <div className="hidden flex-wrap items-center gap-3 sm:flex">
          {/* 搜索框（带 Search 图标） */}
          <form onSubmit={handleSearch} className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="搜索邮箱地址..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
            />
          </form>

          {/* 状态筛选 */}
          <select
            aria-label="状态过滤"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
          >
            <option value="">全部状态</option>
            <option value="pending">待检测</option>
            <option value="ok">正常</option>
            <option value="fail">异常</option>
          </select>

          {/* 排序 */}
          <select
            aria-label="排序方式"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order as 'asc' | 'desc');
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
          >
            <option value="lastSyncAt-desc">最近收信</option>
            <option value="lastSyncAt-asc">最早收信</option>
            <option value="lastTestAt-desc">最近测活</option>
            <option value="lastTestAt-asc">最早测活</option>
          </select>

          {/* 按钮组 */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleTestBatch}
              className="inline-flex h-[40px] w-[120px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                批量测活{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRefreshBatch()}
              className="inline-flex h-[40px] w-[120px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                批量收信{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busy}
              onClick={handleDeleteBatch}
              className="inline-flex h-[40px] w-[120px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">批量删除</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex h-[40px] w-[100px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">导入</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex h-[40px] w-[120px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">添加账号</span>
            </button>
          </div>
        </div>

        {/* 移动端工具栏：搜索行 → 下拉行 → 操作按钮行 → 添加按钮 */}
        <div data-testid="mobile-toolbar" className="flex flex-col gap-3 sm:hidden">
          {/* 搜索行 */}
          <form onSubmit={handleSearch} className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="搜索邮箱地址..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
            />
          </form>

          {/* 下拉行：状态筛选 + 排序，各占一半 */}
          <div className="flex gap-2">
            <select
              aria-label="状态过滤"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
            >
              <option value="">全部状态</option>
              <option value="pending">待检测</option>
              <option value="ok">正常</option>
              <option value="fail">异常</option>
            </select>
            <select
              aria-label="排序方式"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:focus:border-emerald-500 dark:focus:ring-emerald-900/40"
            >
              <option value="lastSyncAt-desc">最近收信</option>
              <option value="lastSyncAt-asc">最早收信</option>
              <option value="lastTestAt-desc">最近测活</option>
              <option value="lastTestAt-asc">最早测活</option>
            </select>
          </div>

          {/* 操作按钮行：测活 / 删除 / 导入，均分宽度 */}
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="移动端批量测活"
              disabled={busy}
              onClick={handleTestBatch}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              <span>测活{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}</span>
            </button>
            <button
              type="button"
              aria-label="移动端批量收信"
              disabled={busy}
              onClick={() => void handleRefreshBatch()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>收信{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}</span>
            </button>
            <button
              type="button"
              aria-label="移动端批量删除"
              disabled={selectedIds.length === 0 || busy}
              onClick={handleDeleteBatch}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-rose-500/30 transition hover:from-rose-600 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>删除</span>
            </button>
            <button
              type="button"
              aria-label="移动端导入"
              onClick={() => setShowImport(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>导入</span>
            </button>
          </div>

          {/* 添加按钮：整行渐变主按钮 */}
          <button
            type="button"
            aria-label="移动端添加"
            onClick={() => setShowAdd(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>添加</span>
          </button>
        </div>
      </div>

      {/* 桌面端表格 */}
      <div className="hidden overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full">
          <thead className="bg-gradient-to-br from-slate-50 to-white text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:from-slate-800/60 dark:to-slate-900 dark:text-slate-400">
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
                      backgroundColor: allSelected ? 'rgb(16, 185, 129)' : 'white',
                      borderColor: allSelected ? 'rgb(16, 185, 129)' : 'rgb(203, 213, 225)',
                      boxShadow: allSelected ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!allSelected) e.currentTarget.style.borderColor = 'rgb(52, 211, 153)';
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
              <th className="px-6 py-4 text-center">邮件数</th>
              <th className="px-6 py-4 text-center">最后同步</th>
              <th className="px-6 py-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  <p className="text-slate-400 dark:text-slate-500">暂无邮箱账号</p>
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const st = statusOf(a);
                const isSelected = selectedIds.includes(a.id);
                return (
                  <tr
                    key={a.id}
                    className={`transition ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/30' : ''}`}
                  >
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
                            backgroundColor: isSelected ? 'rgb(16, 185, 129)' : 'white',
                            borderColor: isSelected ? 'rgb(16, 185, 129)' : 'rgb(203, 213, 225)',
                            boxShadow: isSelected ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.borderColor = 'rgb(52, 211, 153)';
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
                    <td className="cursor-pointer px-6 py-4 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={() => navigate(`/accounts/${a.id}/messages`)}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(
                            a.email,
                          )} text-sm font-semibold text-white shadow-sm`}
                          aria-hidden="true"
                        >
                          {a.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {a.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
                          title={a.lastTestMsg || ''}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(st.label)}`} />
                          {st.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                      {a.messageCount}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                      {formatRelativeTime(a.lastSyncAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <RowMenu
                          testing={testingId === a.id}
                          onTest={() => handleTestOne(a.id, a.email)}
                          onDelete={() => handleDelete(a.id, a.email)}
                        />
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
      <div className="space-y-3 sm:hidden">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="text-slate-400 dark:text-slate-500">暂无邮箱账号</p>
          </div>
        ) : (
          accounts.map((a) => {
            const st = statusOf(a);
            const isSelected = selectedIds.includes(a.id);
            return (
              <div
                key={a.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-slate-900 ${
                  isSelected ? 'border-emerald-300 ring-1 ring-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:ring-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    {/* 方形选择框 */}
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
                        width: '20px',
                        height: '20px',
                        minWidth: '20px',
                        minHeight: '20px',
                        padding: 0,
                        margin: 0,
                        border: '2px solid',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                        backgroundColor: isSelected ? 'rgb(16, 185, 129)' : 'white',
                        borderColor: isSelected ? 'rgb(16, 185, 129)' : 'rgb(203, 213, 225)',
                        boxShadow: isSelected ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none',
                      }}
                    >
                      <svg
                        className={`text-white transition-all duration-200 ${
                          isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                        }`}
                        style={{ width: '13px', height: '13px' }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(
                        a.email,
                      )} text-base font-semibold text-white shadow-md`}
                      aria-hidden="true"
                    >
                      {a.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 cursor-pointer" onClick={() => navigate(`/accounts/${a.id}/messages`)}>
                      <div className="font-medium text-slate-800 dark:text-slate-100">{a.email}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(a.lastSyncAt)}</div>
                    </div>
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
                      title={a.lastTestMsg || ''}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(st.label)}`} />
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">邮件数：{a.messageCount}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 分页 */}
      <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:text-slate-400">
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
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
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

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <ConfirmDeleteModal
          target={deleteTarget}
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {/* 测活确认弹窗 */}
      {testTarget && (
        <ConfirmTestModal
          target={testTarget}
          busy={busy}
          onCancel={() => setTestTarget(null)}
          onConfirm={() => void confirmTest()}
        />
      )}
    </div>
  );
}
