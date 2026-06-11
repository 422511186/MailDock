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

  /** 切换全选。 */
  function toggleSelectAll() {
    if (selectedIds.length === accounts.length && accounts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(accounts.map(a => a.id));
    }
  }

  /** 切换单个选择。 */
  function toggleSelect(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** 切换排序。 */
  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }

  return (
    <div className="app-main">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">邮箱账号管理</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAdd(true)}
          >
            新增账号
          </button>
          <button type="button" onClick={() => setShowImport(true)}>
            导入
          </button>
          {selectedIds.length > 0 && (
            <>
              <button type="button" onClick={handleTestBatch} disabled={busy}>
                批量测活 ({selectedIds.length})
              </button>
              <button type="button" className="btn-danger" onClick={handleDeleteBatch} disabled={busy}>
                批量删除 ({selectedIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {/* 查询区：邮箱搜索 + 状态过滤 */}
      <form
        onSubmit={handleSearch}
        className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
      >
        <input
          type="text"
          placeholder="按邮箱搜索"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
          autoComplete="off"
        />
        <label htmlFor="status-filter" className="text-sm text-slate-500">
          状态
        </label>
        <select
          id="status-filter"
          aria-label="状态过滤"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">全部</option>
          <option value="pending">待检测</option>
          <option value="ok">正常</option>
          <option value="fail">异常</option>
        </select>
        <button type="submit" className="btn-primary">
          搜索
        </button>
      </form>

      {/* 账号列表 */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.length === accounts.length && accounts.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="全选"
                />
              </th>
              <th>邮箱</th>
              <th>状态</th>
              <th
                className="cursor-pointer select-none hover:bg-slate-100"
                onClick={() => toggleSort('lastTestAt')}
                title="点击排序"
              >
                上次测活时间 {sortBy === 'lastTestAt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th
                className="cursor-pointer select-none hover:bg-slate-100"
                onClick={() => toggleSort('lastSyncAt')}
                title="点击排序"
              >
                上次收信时间 {sortBy === 'lastSyncAt' && (sortOrder === 'desc' ? '↓' : '↑')}
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  暂无账号
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const st = statusOf(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        aria-label={`选择 ${a.email}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link"
                        onClick={() => onOpenAccount(a.id)}
                      >
                        {a.email}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${st.cls}`}
                        title={a.lastTestMsg || ''}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="text-sm text-slate-500">
                      {formatBeijingTime(a.lastTestAt)}
                    </td>
                    <td className="text-sm text-slate-500">
                      {formatBeijingTime(a.lastSyncAt)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mr-2"
                        onClick={() => handleTestOne(a.id)}
                        disabled={testingId === a.id}
                      >
                        {testingId === a.id ? '测活中…' : '测活'}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => handleDelete(a.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-3">
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
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            className="link"
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      <div className="flex flex-col gap-4">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="text-sm text-slate-500">
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
            className="font-mono text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
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
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            已存在则覆盖授权码
          </label>
        </div>

        {summary && (
          <p className="import-summary">
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
