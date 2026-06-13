import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Upload,
  Trash2,
  Mail,
  Search,
  CheckCircle,
  MoreVertical,
} from 'lucide-react';
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

/** 头像渐变色板：按邮箱 hash 取色，保证同一邮箱稳定同色。 */
const AVATAR_GRADIENTS = [
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-rose-500 to-rose-600',
  'from-blue-500 to-blue-600',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-600',
];

function emailToAvatarGradient(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/** 账号三态：待检测 / 正常 / 异常，从 lastTestAt + lastTestOk 派生。 */
function statusOf(a: Account): { label: string; cls: string } {
  if (!a.lastTestAt) {
    return { label: '待检测', cls: 'bg-amber-100 text-amber-700' };
  }
  if (a.lastTestOk) {
    return { label: '正常', cls: 'bg-emerald-100 text-emerald-700' };
  }
  return { label: '异常', cls: 'bg-rose-100 text-rose-700' };
}

/** 状态徽章圆点颜色。 */
function statusDot(label: string): string {
  if (label === '正常') return 'bg-emerald-500';
  if (label === '异常') return 'bg-rose-500';
  return 'bg-amber-500';
}

/** 将毫秒时间戳转为北京时间字符串。 */
function formatBeijingTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/** 将毫秒时间戳转为相对时间字符串（如"2 分钟前"）。 */
function formatRelativeTime(ts: number): string {
  if (!ts) return '从未同步';
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' });
}

/**
 * 账号管理页：白色卡片工具栏（搜索 + 状态/排序 + 批量按钮 + 已选中提示条）、
 * 白色卡片表格（彩色头像 + 状态徽章带圆点 + 三点菜单），
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
        <h2 className="text-2xl font-bold text-slate-900">邮箱账号</h2>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      {/* 白色卡片工具栏 */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* 搜索框（带 Search 图标） */}
          <form onSubmit={handleSearch} className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="搜索邮箱地址..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-800 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </form>

          {/* 状态筛选 */}
          <select
            aria-label="状态过滤"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
              disabled={selectedIds.length === 0 || busy}
              onClick={handleTestBatch}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                批量测活{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busy}
              onClick={handleDeleteBatch}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">批量删除</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">导入</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:from-emerald-600 hover:to-emerald-700"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">添加账号</span>
              <span className="sm:hidden">添加</span>
            </button>
          </div>
        </div>

        {/* 已选中提示条 */}
        {selectedIds.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <span className="font-medium text-emerald-800">
                已选中 {selectedIds.length} 个账号
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-emerald-600 transition hover:text-emerald-700"
            >
              取消选择
            </button>
          </div>
        )}
      </div>

      {/* 桌面端表格 */}
      <div className="hidden overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <table className="w-full">
          <thead className="bg-gradient-to-br from-slate-50 to-white text-left text-xs font-medium uppercase tracking-wider text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300" aria-hidden="true" />
                  <p className="text-slate-400">暂无邮箱账号</p>
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const st = statusOf(a);
                const isSelected = selectedIds.includes(a.id);
                return (
                  <tr
                    key={a.id}
                    className={`cursor-pointer transition ${isSelected ? 'bg-emerald-50/50 hover:bg-emerald-50' : ''}`}
                    onClick={() => onOpenAccount(a.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`选择 ${a.email}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(a.id);
                          }}
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(
                            a.email,
                          )} text-sm font-semibold text-white shadow-sm`}
                          aria-hidden="true"
                        >
                          {a.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-800">
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
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      {a.messageCount}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600">
                      {formatRelativeTime(a.lastSyncAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <RowMenu
                          testing={testingId === a.id}
                          onTest={() => void handleTestOne(a.id)}
                          onDelete={() => void handleDelete(a.id)}
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
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm">
            <Mail className="mx-auto mb-4 h-16 w-16 text-slate-300" aria-hidden="true" />
            <p className="text-slate-400">暂无邮箱账号</p>
          </div>
        ) : (
          accounts.map((a) => {
            const st = statusOf(a);
            const isSelected = selectedIds.includes(a.id);
            return (
              <div
                key={a.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                  isSelected ? 'border-emerald-300 ring-1 ring-emerald-300 bg-emerald-50/50' : 'border-slate-200'
                }`}
              >
                <div className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
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
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(
                          a.email,
                        )} text-sm font-semibold text-white shadow-sm`}
                        aria-hidden="true"
                      >
                        {a.email.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <RowMenu
                      testing={testingId === a.id}
                      onTest={() => void handleTestOne(a.id)}
                      onDelete={() => void handleDelete(a.id)}
                    />
                  </div>
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${emailToAvatarGradient(
                        a.email,
                      )} text-base font-semibold text-white shadow-md`}
                      aria-hidden="true"
                    >
                      {a.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{a.email}</div>
                      <div className="text-xs text-slate-500">{formatRelativeTime(a.lastSyncAt)}</div>
                    </div>
                  </div>
                  <div className="mb-3 flex items-center gap-2 ml-[60px]">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
                      title={a.lastTestMsg || ''}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(st.label)}`} />
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-500">邮件数：{a.messageCount}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            上一页
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

/** 行操作三点菜单：展开「测活 / 删除」，点击外部或 Esc 关闭。 */
function RowMenu({
  onTest,
  onDelete,
  testing,
}: {
  onTest: () => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <div
        role="button"
        tabIndex={0}
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
        className="cursor-pointer p-1.5 text-slate-400 transition hover:text-slate-600"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </div>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            disabled={testing}
            onClick={() => {
              setOpen(false);
              onTest();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {testing ? '测活中…' : '测活'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            删除
          </button>
        </div>
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
    <Modal title="添加邮箱账号" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-email" className="mb-1.5 block text-sm font-medium text-slate-700">
            邮箱地址 *
          </label>
          <input
            id="add-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="your@163.com"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-authcode" className="mb-1.5 block text-sm font-medium text-slate-700">
            授权码 *
          </label>
          <input
            id="add-authcode"
            type="password"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            autoComplete="off"
            placeholder="163 邮箱 IMAP 授权码"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            添加账号
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
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none transition focus:border-emerald-500 sm:text-sm"
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
          <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 sm:text-sm">
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
            开始导入
          </button>
        </div>
      </div>
    </Modal>
  );
}
