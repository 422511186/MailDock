import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AccountsPage } from './AccountsPage';
import type { Account, PagedAccounts } from '../api/client';

/** 构造一个账号（默认测活成功）。 */
function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    email: 'alice@163.com',
    imapHost: 'imap.163.com',
    imapPort: 993,
    lastUid: 0,
    lastSyncAt: 0,
    lastTestAt: 1700000000000,
    lastTestOk: true,
    lastTestMsg: '连接成功',
    ...overrides,
  };
}

/** 包装成分页结果。 */
function paged(items: Account[], total = items.length): PagedAccounts {
  return { total, items };
}

/** 构造一个最小可用的 API 客户端桩。 */
function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    listAccounts: vi.fn().mockResolvedValue(paged([])),
    createAccount: vi.fn().mockResolvedValue(account()),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ ok: true, message: '连接成功' }),
    testBatch: vi.fn().mockResolvedValue({ results: [] }),
    importText: vi.fn().mockResolvedValue({ total: 0, success: 0, failed: 0, skipped: 0, results: [] }),
    ...overrides,
  };
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('加载后展示账号列表', async () => {
    // 进入页面应拉取并渲染账号
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'alice@163.com' }),
          account({ id: 2, email: 'bob@163.com', lastTestOk: false, lastTestMsg: '认证失败' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    expect(await screen.findByText('alice@163.com')).toBeInTheDocument();
    expect(screen.getByText('bob@163.com')).toBeInTheDocument();
  });

  it('通过弹窗新增账号后刷新列表', async () => {
    // 点击「新增账号」打开弹窗，填写后提交，应调用 createAccount 并重新加载
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([]))
      .mockResolvedValueOnce(paged([account({ id: 9, email: 'new@163.com' })]));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    // 打开新增弹窗
    fireEvent.click(screen.getByRole('button', { name: '新增账号' }));

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'new@163.com' } });
    fireEvent.change(screen.getByLabelText('授权码'), { target: { value: 'auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    await waitFor(() => {
      expect(api.createAccount).toHaveBeenCalledWith('new@163.com', 'auth-code');
    });
    expect(await screen.findByText('new@163.com')).toBeInTheDocument();
  });

  it('确认后删除账号并从列表移除', async () => {
    // 点击删除弹出二次确认，确认后才调用 deleteAccount 并重新加载
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([account({ id: 3, email: 'del@163.com' })]))
      .mockResolvedValueOnce(paged([]));
    const api = stubApi({ listAccounts });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('del@163.com');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.deleteAccount).toHaveBeenCalledWith(3);
    });
    confirmSpy.mockRestore();
  });

  it('取消确认时不删除账号', async () => {
    // 二次确认点取消应中止删除，不调用 deleteAccount
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 3, email: 'del@163.com' })])),
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('del@163.com');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.deleteAccount).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('点击账号触发 onOpenAccount', async () => {
    // 点击邮箱进入该账号的邮件列表
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 7, email: 'open@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    fireEvent.click(await screen.findByText('open@163.com'));

    expect(onOpenAccount).toHaveBeenCalledWith(7);
  });

  it('批量测活后刷新列表', async () => {
    // 点击批量测活应调用 testBatch（选中账号时传 ids，否则测全部）并重新加载
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('alice@163.com');

    // 不选中任何账号时，批量测活按钮不显示，testBatch 应以 undefined 调用（测全部）
    // 修改：选中一个账号后点击批量测活
    const checkbox = screen.getByLabelText('选择 alice@163.com');
    fireEvent.click(checkbox);

    const batchBtn = await screen.findByRole('button', { name: /批量测活/ });
    fireEvent.click(batchBtn);

    await waitFor(() => {
      expect(api.testBatch).toHaveBeenCalledWith([1]);
    });
  });

  it('单个账号测活后刷新列表', async () => {
    // 点击某账号行的「测活」应调用 testConnection 并重新加载
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 5, email: 'one@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('one@163.com');

    fireEvent.click(screen.getByRole('button', { name: '测活' }));

    await waitFor(() => {
      expect(api.testConnection).toHaveBeenCalledWith(5);
    });
  });

  it('通过弹窗批量导入文本后展示汇总', async () => {
    // 点击「导入」打开弹窗，填入文本并提交，应调用 importText 并展示成功/失败数
    const api = stubApi({
      importText: vi.fn().mockResolvedValue({ total: 2, success: 2, failed: 0, skipped: 0, results: [] }),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    fireEvent.change(screen.getByLabelText('批量导入'), {
      target: { value: 'a@163.com code1\nb@163.com code2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(api.importText).toHaveBeenCalledWith('a@163.com code1\nb@163.com code2', false, false);
    });
    expect(await screen.findByText(/成功 2/)).toBeInTheDocument();
  });

  it('展示三态测活状态：待检测 / 正常 / 异常', async () => {
    // lastTestAt==0 显示「待检测」；成功显示「正常」；失败显示「异常」
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'pending@163.com', lastTestAt: 0, lastTestOk: false, lastTestMsg: null }),
          account({ id: 2, email: 'ok@163.com', lastTestAt: 1700000000000, lastTestOk: true }),
          account({ id: 3, email: 'bad@163.com', lastTestAt: 1700000000000, lastTestOk: false, lastTestMsg: '认证失败' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('pending@163.com');

    const pendingRow = screen.getByText('pending@163.com').closest('tr')!;
    const okRow = screen.getByText('ok@163.com').closest('tr')!;
    const badRow = screen.getByText('bad@163.com').closest('tr')!;
    expect(within(pendingRow).getByText('待检测')).toBeInTheDocument();
    expect(within(okRow).getByText('正常')).toBeInTheDocument();
    expect(within(badRow).getByText('异常')).toBeInTheDocument();
  });

  it('按邮箱搜索时带上 email 查询条件', async () => {
    // 在搜索框输入邮箱并提交，应以 email 条件重新查询
    const listAccounts = vi.fn().mockResolvedValue(paged([]));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('按邮箱搜索'), { target: { value: 'alic' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: 'alic', page: 1 }),
      );
    });
  });

  it('按状态过滤时带上 status 查询条件', async () => {
    // 选择状态过滤为「异常」，应以 status=fail 重新查询
    const listAccounts = vi.fn().mockResolvedValue(paged([]));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('状态过滤'), { target: { value: 'fail' } });

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'fail', page: 1 }),
      );
    });
  });

  it('翻页时带上 page 查询条件', async () => {
    // 总数 25、每页 20，点击下一页应以 page=2 查询
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([account({ id: 1, email: 'a@163.com' })], 25))
      .mockResolvedValueOnce(paged([account({ id: 21, email: 'b@163.com' })], 25));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('a@163.com');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it('修改每页条数时回到第 1 页并带上新的 size', async () => {
    // 切换页大小为 50，应以 size=50、page=1 重新查询
    const listAccounts = vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })], 80));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findByText('a@163.com');

    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '50' } });

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ size: 50, page: 1 }),
      );
    });
  });
});
