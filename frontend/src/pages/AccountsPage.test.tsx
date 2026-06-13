import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    messageCount: 0,
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
    deleteBatch: vi.fn().mockResolvedValue(undefined),
    importText: vi.fn().mockResolvedValue({ total: 0, success: 0, failed: 0, skipped: 0, results: [] }),
    ...overrides,
  };
}

/** 打开第一个行三点菜单（桌面表格优先）。 */
function openFirstRowMenu() {
  const moreBtns = screen.getAllByRole('button', { name: '更多操作' });
  fireEvent.click(moreBtns[0]);
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== 原型对齐测试（新增） =====

  it('页面顶部显示独立标题"邮箱账号"', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account()])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: '邮箱账号' })).toBeInTheDocument();
  });

  it('桌面端表格包含"邮件数"列', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([account({ id: 1, email: 'alice@163.com', messageCount: 128 })]),
      ),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    // 表头包含"邮件数"
    expect(screen.getByRole('columnheader', { name: '邮件数' })).toBeInTheDocument();
    // 数据行显示邮件数
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('最后同步时间显示为相对格式', async () => {
    const now = Date.now();
    const twoMinutesAgo = now - 2 * 60 * 1000;
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([account({ id: 1, email: 'alice@163.com', lastSyncAt: twoMinutesAgo })]),
      ),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    // 应显示相对时间（精确匹配可能因时间漂移略有差异，检查包含"分钟"）
    expect(screen.getAllByText(/\d+\s*分钟前/).length).toBeGreaterThan(0);
  });

  it('从未同步的账号显示"从未同步"', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([account({ id: 1, email: 'bob@163.com', lastSyncAt: 0 })]),
      ),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('bob@163.com');
    const syncTexts = screen.getAllByText('从未同步');
    expect(syncTexts.length).toBeGreaterThan(0);
  });

  it('选中行带浅绿背景（bg-emerald-50）', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 alice@163.com' });
    fireEvent.click(checkboxes[0]);

    // 找到包含邮箱的行，检查是否有 emerald 背景类
    const emailCell = screen.getAllByText('alice@163.com')[0];
    let row: HTMLElement | null = emailCell.closest('tr');
    if (!row) {
      // 移动端可能是 div 卡片
      row = emailCell.closest('div[class*="rounded"]');
    }
    expect(row?.className).toMatch(/bg-emerald/);
  });

  it('新增账号按钮文字为"添加账号"', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account()])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    // 桌面端显示"添加账号"
    expect(await screen.findByRole('button', { name: /添加账号/ })).toBeInTheDocument();
  });

  it('添加账号表单标题为"添加邮箱账号"', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /添加账号/ }));
    expect(await screen.findByRole('heading', { name: '添加邮箱账号' })).toBeInTheDocument();
  });

  it('添加账号表单确认按钮文字为"添加账号"', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /添加账号/ }));
    expect(await screen.findByRole('button', { name: '添加账号' })).toBeInTheDocument();
  });

  // ===== 原有功能测试保持 =====

  it('加载后展示账号列表', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'alice@163.com' }),
          account({ id: 2, email: 'bob@163.com', lastTestOk: false, lastTestMsg: '认证失败' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    expect((await screen.findAllByText('alice@163.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('bob@163.com').length).toBeGreaterThan(0);
  });

  it('通过弹窗新增账号后刷新列表', async () => {
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([]))
      .mockResolvedValueOnce(paged([account({ id: 9, email: 'new@163.com' })]));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /添加账号/ }));

    fireEvent.change(screen.getByLabelText(/邮箱地址/), { target: { value: 'new@163.com' } });
    fireEvent.change(screen.getByLabelText(/授权码/), { target: { value: 'auth-code' } });
    fireEvent.click(screen.getByRole('button', { name: '添加账号' }));

    await waitFor(() => {
      expect(api.createAccount).toHaveBeenCalledWith('new@163.com', 'auth-code');
    });
    expect((await screen.findAllByText('new@163.com')).length).toBeGreaterThan(0);
  });

  it('确认后删除账号并从列表移除', async () => {
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([account({ id: 3, email: 'del@163.com' })]))
      .mockResolvedValueOnce(paged([]));
    const api = stubApi({ listAccounts });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('del@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(api.deleteAccount).toHaveBeenCalledWith(3);
    });
    confirmSpy.mockRestore();
  });

  it('取消确认时不删除账号', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 3, email: 'del@163.com' })])),
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('del@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.deleteAccount).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('点击账号行触发 onOpenAccount', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 7, email: 'open@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('open@163.com');

    // 在桌面端视图中找到表格行并点击
    const rows = screen.getAllByRole('row');
    const accountRow = rows.find(row => row.textContent?.includes('open@163.com'));
    expect(accountRow).toBeDefined();
    fireEvent.click(accountRow!);

    expect(onOpenAccount).toHaveBeenCalledWith(7);
  });

  it('批量测活后刷新列表', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 alice@163.com' });
    fireEvent.click(checkboxes[0]);

    const batchBtn = await screen.findByRole('button', { name: /批量测活/ });
    fireEvent.click(batchBtn);

    await waitFor(() => {
      expect(api.testBatch).toHaveBeenCalledWith([1]);
    });
  });

  it('点击表头全选框选中当前页全部账号', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'a@163.com' }),
          account({ id: 2, email: 'b@163.com' }),
          account({ id: 3, email: 'c@163.com' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');

    fireEvent.click(screen.getByRole('checkbox', { name: '全选' }));

    expect(await screen.findByText(/已选中 3 个账号/)).toBeInTheDocument();
  });

  it('全选后再次点击表头全选框取消全选', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'a@163.com' }),
          account({ id: 2, email: 'b@163.com' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');

    const selectAll = screen.getByRole('checkbox', { name: '全选' });
    fireEvent.click(selectAll);
    expect(await screen.findByText(/已选中 2 个账号/)).toBeInTheDocument();

    fireEvent.click(selectAll);
    await waitFor(() => {
      expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();
    });
  });

  it('全选后取消某行选择时表头全选框变为未选中', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([
          account({ id: 1, email: 'a@163.com' }),
          account({ id: 2, email: 'b@163.com' }),
        ]),
      ),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');

    const selectAll = screen.getByRole('checkbox', { name: '全选' });
    fireEvent.click(selectAll);
    expect(selectAll).toHaveAttribute('aria-checked', 'true');

    const aCheckboxes = screen.getAllByRole('checkbox', { name: '选择 a@163.com' });
    fireEvent.click(aCheckboxes[0]);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '全选' })).toHaveAttribute('aria-checked', 'false');
    });
    expect(await screen.findByText(/已选中 1 个账号/)).toBeInTheDocument();
  });

  it('单个账号测活后刷新列表', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 5, email: 'one@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('one@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /测活/ }));

    await waitFor(() => {
      expect(api.testConnection).toHaveBeenCalledWith(5);
    });
  });

  it('通过弹窗批量导入文本后展示汇总', async () => {
    const api = stubApi({
      importText: vi.fn().mockResolvedValue({ total: 2, success: 2, failed: 0, skipped: 0, results: [] }),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    fireEvent.change(screen.getByLabelText('批量导入'), {
      target: { value: 'a@163.com code1\nb@163.com code2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));

    await waitFor(() => {
      expect(api.importText).toHaveBeenCalledWith('a@163.com code1\nb@163.com code2', false, false);
    });
    expect(await screen.findByText(/成功 2/)).toBeInTheDocument();
  });

  it('展示三态测活状态：待检测 / 正常 / 异常', async () => {
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
    await screen.findAllByText('pending@163.com');

    expect(screen.getAllByText('待检测').length).toBeGreaterThan(0);
    expect(screen.getAllByText('正常').length).toBeGreaterThan(0);
    expect(screen.getAllByText('异常').length).toBeGreaterThan(0);
  });

  it('按邮箱搜索时带上 email 查询条件', async () => {
    const listAccounts = vi.fn().mockResolvedValue(paged([]));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1));

    const search = screen.getByPlaceholderText('搜索邮箱地址...');
    fireEvent.change(search, { target: { value: 'alic' } });
    fireEvent.submit(search.closest('form')!);

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: 'alic', page: 1 }),
      );
    });
  });

  it('按状态过滤时带上 status 查询条件', async () => {
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
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([account({ id: 1, email: 'a@163.com' })], 25))
      .mockResolvedValueOnce(paged([account({ id: 21, email: 'b@163.com' })], 25));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it('修改每页条数时回到第 1 页并带上新的 size', async () => {
    const listAccounts = vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })], 80));
    const api = stubApi({ listAccounts });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');

    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '50' } });

    await waitFor(() => {
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ size: 50, page: 1 }),
      );
    });
  });

  it('工具栏在白色卡片容器内', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const search = await screen.findByPlaceholderText('搜索邮箱地址...');
    const toolbar = search.closest('.rounded-2xl');
    expect(toolbar).toHaveClass('bg-white');
  });

  it('搜索框带左内边距给 Search 图标留位', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const search = await screen.findByPlaceholderText('搜索邮箱地址...');
    expect(search).toHaveClass('pl-10');
  });

  it('已选中时显示提示条与取消选择', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: '选择 alice@163.com' });
    fireEvent.click(rowCheckboxes[0]);
    expect(screen.getByText(/已选中 1 个账号/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }));
    expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();
  });

  it('表格在白色卡片容器内', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    const table = screen.getByRole('table');
    expect(table.closest('.rounded-2xl')).toHaveClass('bg-white');
  });

  it('邮箱列有彩色头像', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    const row = screen.getByRole('table').querySelector('tbody tr');
    const avatar = row?.querySelector('.rounded-full.bg-gradient-to-br');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent('A');
  });

  it('状态徽章带圆点', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'ok@163.com', lastTestOk: true })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('正常');
    const badges = screen.getByRole('table').querySelectorAll('span.rounded-full.bg-emerald-100');
    const badge = badges[0];
    const dot = badge?.querySelector('span.rounded-full.bg-emerald-500');
    expect(dot).toBeInTheDocument();
  });

  it('操作列三点菜单展开测活与删除', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    openFirstRowMenu();
    expect(screen.getByRole('menuitem', { name: /测活/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /删除/ })).toBeInTheDocument();
  });

  it('三点菜单内删除项带图标', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'a@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('a@163.com');
    openFirstRowMenu();
    const delItem = screen.getByRole('menuitem', { name: /删除/ });
    expect(delItem.querySelector('svg')).toBeInTheDocument();
  });

  it('桌面端邮箱显示为纯文本而非按钮', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    // 桌面端表格内应该有纯文本显示邮箱
    const allEmailElements = screen.getAllByText('alice@163.com');
    const desktopEmailSpan = allEmailElements.find(el =>
      el.tagName === 'SPAN' && el.classList.contains('font-medium')
    );
    expect(desktopEmailSpan).toBeDefined();
  });

  it('邮箱列不包含背景框', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    const emailButtons = screen.getAllByText('alice@163.com');
    emailButtons.forEach(btn => {
      expect(btn).not.toHaveClass('bg-white');
      expect(btn).not.toHaveClass('bg-slate-50');
      expect(btn).not.toHaveClass('rounded-lg');
      expect(btn).not.toHaveClass('rounded-xl');
      expect(btn).not.toHaveClass('border');
      expect(btn).not.toHaveClass('shadow');
    });
  });

  it('操作列三点按钮不包含背景框', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    const moreBtn = screen.getAllByRole('button', { name: '更多操作' })[0];
    expect(moreBtn).not.toHaveClass('bg-slate-50');
    expect(moreBtn).not.toHaveClass('rounded-lg');
  });

  it('移动端邮箱显示为纯文本而非按钮', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    // 移动端卡片内应该有纯文本显示邮箱
    const mobileCards = document.querySelectorAll('.sm\\:hidden [class*="rounded-2xl"]');
    expect(mobileCards.length).toBeGreaterThan(0);

    // 邮箱文本不应该是按钮
    const allEmailElements = screen.getAllByText('alice@163.com');
    const mobileEmailText = allEmailElements.find(el =>
      el.tagName === 'DIV' && el.classList.contains('font-medium')
    );
    expect(mobileEmailText).toBeDefined();
  });

  it('移动端邮箱按钮不包含背景框', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    // 移动端邮箱现在是纯文本 div，不是按钮
    const allEmailElements = screen.getAllByText('alice@163.com');
    const mobileEmailDiv = allEmailElements.find(el =>
      el.tagName === 'DIV' && el.classList.contains('font-medium')
    );

    expect(mobileEmailDiv).toBeDefined();
    if (mobileEmailDiv) {
      expect(mobileEmailDiv).not.toHaveClass('bg-white');
      expect(mobileEmailDiv).not.toHaveClass('border');
      expect(mobileEmailDiv).not.toHaveClass('rounded-lg');
    }
  });

  it('表格行不包含 hover 背景色', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');
    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0]).not.toHaveClass('hover:bg-slate-50/50');
    expect(rows[0]).not.toHaveClass('hover:bg-slate-50');
  });
});
