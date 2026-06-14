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
    expect((await screen.findAllByRole('button', { name: /添加账号/ })).length).toBeGreaterThan(0);
  });

  it('添加账号表单标题为"添加邮箱账号"', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const addButtons = screen.getAllByRole('button', { name: /添加账号/ });
    fireEvent.click(addButtons[0]);
    expect(await screen.findByRole('heading', { name: '添加邮箱账号' })).toBeInTheDocument();
  });

  it('添加账号表单确认按钮文字为"添加账号"', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const addButtons = screen.getAllByRole('button', { name: /添加账号/ });
    fireEvent.click(addButtons[0]);
    // 弹窗内应该有提交按钮"添加账号"
    const submitButtons = await screen.findAllByRole('button', { name: '添加账号' });
    const submitBtn = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    expect(submitBtn).toBeInTheDocument();
  });

  it('添加账号表单含只读 IMAP 服务器与端口字段', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /添加账号/ })[0]);
    await screen.findByRole('heading', { name: '添加邮箱账号' });

    const host = screen.getByDisplayValue('imap.163.com') as HTMLInputElement;
    const port = screen.getByDisplayValue('993') as HTMLInputElement;
    expect(host).toBeInTheDocument();
    expect(host).toHaveAttribute('readonly');
    expect(port).toBeInTheDocument();
    expect(port).toHaveAttribute('readonly');
  });

  it('添加账号表单授权码下方有帮助文案', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /添加账号/ })[0]);
    await screen.findByRole('heading', { name: '添加邮箱账号' });
    expect(screen.getByText(/前往 163 邮箱设置获取 IMAP 授权码/)).toBeInTheDocument();
  });

  it('添加账号表单底部「取消」「添加账号」按钮均分宽度', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /添加账号/ })[0]);
    await screen.findByRole('heading', { name: '添加邮箱账号' });

    const cancelBtn = screen.getByRole('button', { name: '取消' });
    const submitBtn = screen
      .getAllByRole('button', { name: '添加账号' })
      .find(btn => btn.getAttribute('type') === 'submit')!;
    expect(cancelBtn).toHaveClass('flex-1');
    expect(submitBtn).toHaveClass('flex-1');
  });

  it('弹窗头部不含右上角关闭叉叉（与底部取消按钮重复）', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /添加账号/ })[0]);
    await screen.findByRole('heading', { name: '添加邮箱账号' });
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
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

    const addButtons = screen.getAllByRole('button', { name: /添加账号/ });
    fireEvent.click(addButtons[0]);

    fireEvent.change(screen.getByLabelText(/邮箱地址/), { target: { value: 'new@163.com' } });
    fireEvent.change(screen.getByLabelText(/授权码/), { target: { value: 'auth-code' } });
    const submitButtons = screen.getAllByRole('button', { name: '添加账号' });
    const submitBtn = submitButtons.find(btn => btn.getAttribute('type') === 'submit')!;
    fireEvent.click(submitBtn);

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

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('del@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    // 弹出删除确认弹窗，显示账号邮箱
    expect(await screen.findByRole('heading', { name: '确认删除' })).toBeInTheDocument();
    const confirmDialog = screen.getByRole('heading', { name: '确认删除' }).closest('div[class*="rounded"]')!;
    expect(confirmDialog.textContent).toContain('del@163.com');

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(api.deleteAccount).toHaveBeenCalledWith(3);
    });
  });

  it('取消确认时不删除账号', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 3, email: 'del@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('del@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    // 弹窗出现后点击取消
    await screen.findByRole('heading', { name: '确认删除' });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(api.deleteAccount).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '确认删除' })).not.toBeInTheDocument();
    });
  });

  it('批量删除走确认弹窗并显示数量', async () => {
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

    fireEvent.click(screen.getByRole('checkbox', { name: '全选' }));
    const delBtns = await screen.findAllByRole('button', { name: /批量删除/ });
    fireEvent.click(delBtns[0]);

    const dialog = (await screen.findByRole('heading', { name: '确认删除' })).closest('div[class*="rounded"]')!;
    expect(dialog.textContent).toContain('2');

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => {
      expect(api.deleteBatch).toHaveBeenCalledWith([1, 2]);
    });
  });

  it('点击账号行触发 onOpenAccount（桌面端）', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 7, email: 'open@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('open@163.com');

    // 在桌面端表格中找到邮箱列并点击
    const emailCells = screen.getAllByText('open@163.com');
    const emailInTable = emailCells.find(el => el.closest('table'));
    expect(emailInTable).toBeDefined();
    fireEvent.click(emailInTable!);

    expect(onOpenAccount).toHaveBeenCalledWith(7, 'open@163.com');
  });

  it('点击账号卡片触发 onOpenAccount（移动端）', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 8, email: 'mobile@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('mobile@163.com');

    // 移动端卡片中的邮箱文字区域是点击目标
    const emailTexts = screen.getAllByText('mobile@163.com');
    const mobileEmailText = emailTexts.find(el => {
      const card = el.closest('.space-y-3.sm\\:hidden');
      return card !== null;
    });
    expect(mobileEmailText).toBeDefined();
    fireEvent.click(mobileEmailText!);

    expect(onOpenAccount).toHaveBeenCalledWith(8, 'mobile@163.com');
  });

  it('移动端卡片布局符合原型：只有一个大头像，无小头像', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([account({ id: 1, email: 'test@163.com', messageCount: 128, lastSyncAt: Date.now() - 3600000 })]),
      ),
    });

    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    // 移动端卡片容器
    const mobileCards = container.querySelectorAll('.space-y-3.sm\\:hidden > div');
    expect(mobileCards.length).toBeGreaterThan(0);

    const card = mobileCards[0];

    // 应该只有一个大头像（h-12 w-12），没有小头像（h-9 w-9）
    const largeAvatars = card.querySelectorAll('.h-12.w-12.rounded-full');
    const smallAvatars = card.querySelectorAll('.h-9.w-9.rounded-full');

    expect(largeAvatars.length).toBe(1);
    expect(smallAvatars.length).toBe(0);
  });

  it('移动端工具栏按钮显示文字标签（测活/删除/导入）', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    // 移动端工具栏（sm:hidden）应显示文字标签
    const mobileToolbar = container.querySelector('[data-testid="mobile-toolbar"]');
    expect(mobileToolbar).toBeInTheDocument();
    expect(mobileToolbar!.textContent).toContain('测活');
    expect(mobileToolbar!.textContent).toContain('删除');
    expect(mobileToolbar!.textContent).toContain('导入');
    expect(mobileToolbar!.textContent).toContain('添加');
  });

  it('移动端操作按钮均分宽度（flex-1）', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    const mobileToolbar = container.querySelector('[data-testid="mobile-toolbar"]');
    // 测活/删除/导入 三个按钮应使用 flex-1 均分宽度
    const testBtn = mobileToolbar!.querySelector('[aria-label="移动端批量测活"]');
    const delBtn = mobileToolbar!.querySelector('[aria-label="移动端批量删除"]');
    const importBtn = mobileToolbar!.querySelector('[aria-label="移动端导入"]');
    expect(testBtn).toHaveClass('flex-1');
    expect(delBtn).toHaveClass('flex-1');
    expect(importBtn).toHaveClass('flex-1');
  });

  it('移动端卡片左侧显示方形选择框，可勾选而不进入详情', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 8, email: 'mobile@163.com' })])),
    });
    const { container } = render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('mobile@163.com');

    // 移动端卡片内应有选择框
    const mobileCards = container.querySelectorAll('.space-y-3.sm\\:hidden > div');
    const card = Array.from(mobileCards).find(c => c.textContent?.includes('mobile@163.com'))!;
    const checkbox = card.querySelector('[role="checkbox"][aria-label="选择 mobile@163.com"]');
    expect(checkbox).toBeInTheDocument();

    // 点击选择框只勾选，不触发 onOpenAccount
    fireEvent.click(checkbox!);
    expect(onOpenAccount).not.toHaveBeenCalled();

    // 验证复选框被选中
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('移动端方形选择框为正方形圆角（rounded 而非 rounded-full）', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 8, email: 'mobile@163.com' })])),
    });
    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('mobile@163.com');

    const mobileCards = container.querySelectorAll('.space-y-3.sm\\:hidden > div');
    const card = Array.from(mobileCards).find(c => c.textContent?.includes('mobile@163.com'))!;
    const checkbox = card.querySelector('[role="checkbox"][aria-label="选择 mobile@163.com"]') as HTMLElement;
    // 方形选择框不应是圆形
    expect(checkbox.className).not.toContain('rounded-full');
  });

  it('移动端卡片：状态徽章和邮件数在同一行，无左侧缩进', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(
        paged([account({ id: 1, email: 'test@163.com', messageCount: 128, lastSyncAt: Date.now() - 3600000 })]),
      ),
    });

    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    const mobileCards = container.querySelectorAll('.space-y-3.sm\\:hidden > div');
    const card = mobileCards[0];

    // 找到状态徽章的父容器，不应该有 ml-[60px] 这样的左边距
    const statusRow = card.querySelector('.inline-flex.items-center.gap-1\\.5.rounded-full')?.parentElement;
    expect(statusRow).toBeInTheDocument();

    // 该行不应该有 ml-[60px] 类
    const hasLeftMargin = statusRow?.className.includes('ml-[60px]');
    expect(hasLeftMargin).toBe(false);
  });

  it('批量测活经确认弹窗后刷新列表', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 alice@163.com' });
    fireEvent.click(checkboxes[0]);

    const batchBtns = await screen.findAllByRole('button', { name: /批量测活/ });
    fireEvent.click(batchBtns[0]);

    // 二次确认弹窗
    expect(await screen.findByRole('heading', { name: '确认测活' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认测活' }));

    await waitFor(() => {
      expect(api.testBatch).toHaveBeenCalledWith([1]);
    });
  });

  it('未选中任何账号时批量测活按钮仍可点击，确认后测全部', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    // 未选中：按钮不禁用
    const batchBtns = screen.getAllByRole('button', { name: /批量测活/ });
    expect(batchBtns[0]).not.toBeDisabled();

    fireEvent.click(batchBtns[0]);
    expect(await screen.findByRole('heading', { name: '确认测活' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认测活' }));

    // 未选中 → 测全部（testBatch 不传 ids）
    await waitFor(() => {
      expect(api.testBatch).toHaveBeenCalledWith(undefined);
    });
  });

  it('未选中任何账号时批量删除按钮保持禁用', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    const delBtns = screen.getAllByRole('button', { name: /批量删除/ });
    expect(delBtns[0]).toBeDisabled();
  });

  it('选中后桌面端批量删除按钮为实心红渐变 + 白字', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('alice@163.com');

    fireEvent.click(screen.getByRole('checkbox', { name: '全选' }));

    const delBtns = await screen.findAllByRole('button', { name: /批量删除/ });
    const desktopDel = delBtns[0];
    expect(desktopDel.className).toContain('from-rose-500');
    expect(desktopDel.className).toContain('to-rose-600');
    expect(desktopDel.className).toContain('text-white');
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

    const selectAllCheckbox = screen.getByRole('checkbox', { name: '全选' });
    fireEvent.click(selectAllCheckbox);

    // 验证全选框被选中
    expect(selectAllCheckbox).toHaveAttribute('aria-checked', 'true');

    // 验证所有行的复选框都被选中
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: /选择/ });
    rowCheckboxes.forEach(cb => {
      if (cb.getAttribute('aria-label') !== '全选') {
        expect(cb).toHaveAttribute('aria-checked', 'true');
      }
    });
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

    // 验证全选框被选中
    expect(selectAll).toHaveAttribute('aria-checked', 'true');

    // 再次点击取消全选
    fireEvent.click(selectAll);

    // 验证全选框变为未选中
    expect(selectAll).toHaveAttribute('aria-checked', 'false');
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

    // 验证 b@163.com 仍然被选中
    const bCheckboxes = screen.getAllByRole('checkbox', { name: '选择 b@163.com' });
    expect(bCheckboxes[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('单个账号测活后刷新列表', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 5, email: 'one@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('one@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /测活/ }));

    // 行内测活也走二次确认
    expect(await screen.findByRole('heading', { name: '确认测活' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认测活' }));

    await waitFor(() => {
      expect(api.testConnection).toHaveBeenCalledWith(5);
    });
  });

  it('点击菜单项测活不触发进入收件箱', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 5, email: 'one@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('one@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /测活/ }));

    expect(await screen.findByRole('heading', { name: '确认测活' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认测活' }));

    await waitFor(() => {
      expect(api.testConnection).toHaveBeenCalledWith(5);
    });
    expect(onOpenAccount).not.toHaveBeenCalled();
  });

  it('点击菜单项删除不触发进入收件箱', async () => {
    const onOpenAccount = vi.fn();
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 3, email: 'del@163.com' })])),
    });

    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);
    await screen.findAllByText('del@163.com');

    openFirstRowMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    expect(await screen.findByRole('heading', { name: '确认删除' })).toBeInTheDocument();
    expect(onOpenAccount).not.toHaveBeenCalled();
  });

  it('桌面端：点击邮箱列触发进入收件箱', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 7, email: 'open@163.com' })])),
    });
    const onOpenAccount = vi.fn();
    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);

    await screen.findAllByText('open@163.com');

    // 桌面端表格里的邮箱单元格
    const emailCells = screen.getAllByText('open@163.com');
    const desktopEmailCell = emailCells.find((el) => el.closest('table'));
    expect(desktopEmailCell).toBeDefined();

    fireEvent.click(desktopEmailCell!);
    expect(onOpenAccount).toHaveBeenCalledWith(7, 'open@163.com');
  });

  it('桌面端：点击其他列（状态/邮件数）不触发进入收件箱', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com', messageCount: 99 })])),
    });
    const onOpenAccount = vi.fn();
    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);

    await screen.findAllByText('alice@163.com');

    // 点击状态列 - 使用 getAllByText 因为筛选器也有"正常"
    const statusBadges = screen.getAllByText('正常');
    const statusInTable = statusBadges.find((el) => el.closest('table'));
    expect(statusInTable).toBeDefined();
    fireEvent.click(statusInTable!);
    expect(onOpenAccount).not.toHaveBeenCalled();

    // 点击邮件数
    const messageCount = screen.getByText('99');
    fireEvent.click(messageCount);
    expect(onOpenAccount).not.toHaveBeenCalled();
  });

  it('桌面端：点击复选框不触发进入收件箱', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    const onOpenAccount = vi.fn();
    render(<AccountsPage api={api as never} onOpenAccount={onOpenAccount} />);

    await screen.findAllByText('alice@163.com');

    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 alice@163.com' });
    fireEvent.click(checkboxes[0]);
    expect(onOpenAccount).not.toHaveBeenCalled();
  });

  it('删除账号后显示成功 Toast', async () => {
    const listAccounts = vi
      .fn()
      .mockResolvedValueOnce(paged([account({ id: 1, email: 'del@163.com' })]))
      .mockResolvedValueOnce(paged([]));
    const api = stubApi({ listAccounts });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    await screen.findAllByText('del@163.com');

    // 选中账号
    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 del@163.com' });
    fireEvent.click(checkboxes[0]);

    // 点击批量删除
    const deleteBtn = screen.getAllByRole('button', { name: /批量删除/ })[0];
    fireEvent.click(deleteBtn);

    // 确认删除
    const confirmBtn = await screen.findByRole('button', { name: '确认删除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const toasts = document.querySelectorAll('.toast.success');
      const deleteToast = Array.from(toasts).find((t) => t.textContent?.includes('成功删除'));
      expect(deleteToast).toBeInTheDocument();
      expect(deleteToast?.textContent).toContain('成功删除');
    });
  });

  it('通过弹窗上传文件后展示导入汇总', async () => {
    const api = stubApi({
      importText: vi.fn().mockResolvedValue({ total: 2, success: 2, failed: 0, skipped: 0, results: [] }),
    });

    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);

    const importBtns = screen.getAllByRole('button', { name: '导入' });
    fireEvent.click(importBtns[0]);

    const content = 'a@163.com code1\nb@163.com code2';
    const file = new File([content], 'accounts.txt', { type: 'text/plain' });
    // jsdom 的 File 缺少 text()，补上以模拟浏览器行为
    if (typeof file.text !== 'function') {
      Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
    }
    const fileInput = screen.getByLabelText('上传文件') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 选择文件后显示预览卡片（文件名 + 行数）
    expect(await screen.findByText('accounts.txt')).toBeInTheDocument();
    // "2 个账号" 文字既在预览卡片也在删除 toast 里，这里只检查文件名即可验证预览功能

    fireEvent.click(screen.getByRole('button', { name: '开始导入' }));

    await waitFor(() => {
      expect(api.importText).toHaveBeenCalledWith(content, false, false);
    });
    expect(await screen.findByText(/成功 2/)).toBeInTheDocument();
  });

  it('选中行时批量删除按钮样式保持一致不跳动', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'test@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    // 获取桌面端批量删除按钮
    const deleteButtons = screen.getAllByRole('button', { name: /批量删除/ });
    const desktopDeleteBtn = deleteButtons[0]; // 第一个是桌面端

    // 未选中时按钮应该是禁用的但样式稳定
    expect(desktopDeleteBtn).toBeDisabled();

    // 选中一行
    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 test@163.com' });
    fireEvent.click(checkboxes[0]);

    // 选中后按钮启用，但宽度、布局不应该改变（只颜色/启用状态变化）
    expect(desktopDeleteBtn).not.toBeDisabled();
    const selectedClasses = desktopDeleteBtn.className;

    // 确保按钮的核心结构类（padding, flex, gap 等）保持一致
    expect(selectedClasses).toContain('inline-flex');
    expect(selectedClasses).toContain('items-center');
    expect(selectedClasses).toContain('gap-2');
    expect(selectedClasses).toContain('rounded-lg');
    expect(selectedClasses).toContain('px-4');
    expect(selectedClasses).toContain('py-2');
  });

  it('选中行时不显示"已选中X个账号"提示条，避免布局跳动', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'test@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    // 选中前不应该有"已选中"提示
    expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();

    // 选中一行
    const checkboxes = screen.getAllByRole('checkbox', { name: '选择 test@163.com' });
    fireEvent.click(checkboxes[0]);

    // 选中后仍然不应该有"已选中"提示条（避免布局跳动）
    expect(screen.queryByText(/已选中/)).not.toBeInTheDocument();
  });

  it('导入弹窗保留"已存在则覆盖授权码"复选框', async () => {
    const api = stubApi();
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '导入' })[0]);
    expect(await screen.findByText(/已存在则覆盖授权码/)).toBeInTheDocument();
  });

  it('导入弹窗含虚线拖拽上传区', async () => {
    const api = stubApi();
    const { container } = render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '导入' })[0]);
    await screen.findByRole('heading', { name: '批量导入账号' });
    const dashed = container.querySelector('.border-dashed');
    expect(dashed).toBeInTheDocument();
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

    const searches = screen.getAllByPlaceholderText('搜索邮箱地址...');
    fireEvent.change(searches[0], { target: { value: 'alic' } });
    fireEvent.submit(searches[0].closest('form')!);

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

    fireEvent.change(screen.getAllByLabelText('状态过滤')[0], { target: { value: 'fail' } });

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
    const searches = await screen.findAllByPlaceholderText('搜索邮箱地址...');
    const toolbar = searches[0].closest('.rounded-2xl');
    expect(toolbar).toHaveClass('bg-white');
  });

  it('搜索框带左内边距给 Search 图标留位', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'alice@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    const searches = await screen.findAllByPlaceholderText('搜索邮箱地址...');
    expect(searches[0]).toHaveClass('pl-10');
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

  it('桌面端操作列三点图标不是按钮元素', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'test@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    // 查找操作列的容器，应该是 div 而非 button
    const rows = screen.getAllByRole('row');
    const accountRow = rows.find(row => row.textContent?.includes('test@163.com'));
    expect(accountRow).toBeDefined();

    // 查找三点图标的父元素，应该是 div
    const threeDotsContainer = accountRow!.querySelector('svg[class*="h-5"]')?.parentElement;
    expect(threeDotsContainer).toBeDefined();
    expect(threeDotsContainer?.tagName).toBe('DIV');
  });

  it('移动端操作列三点图标不是按钮元素', async () => {
    window.innerWidth = 500;
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'mobile@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('mobile@163.com');

    // 查找 RowMenu 组件的三点图标容器（通过 aria-label="更多操作" 定位）
    const threeDotsContainers = document.querySelectorAll('[aria-label="更多操作"]');
    expect(threeDotsContainers.length).toBeGreaterThan(0);
    expect(threeDotsContainers[0].tagName).toBe('DIV');
  });

  it('添加账号按钮有 text-white 类名', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue(paged([account({ id: 1, email: 'test@163.com' })])),
    });
    render(<AccountsPage api={api as never} onOpenAccount={vi.fn()} />);
    await screen.findAllByText('test@163.com');

    const addButtons = screen.getAllByRole('button', { name: /添加账号/ });
    const addButton = addButtons[0];
    expect(addButton).toBeInTheDocument();
    expect(addButton.className).toContain('text-white');
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
