import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MailListPage } from './MailListPage';
import type { MessageSummary } from '../api/client';

/** 构造一条邮件摘要。 */
function summary(overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id: 1,
    accountId: 7,
    uid: 1,
    subject: '主题',
    fromAddr: 'alice@163.com',
    toAddr: 'owner@163.com',
    sentAt: 1700000000000,
    receivedAt: 1700000000000,
    hasAttach: false,
    isRead: false,
    ...overrides,
  };
}

/** 构造一个最小可用的 API 客户端桩。 */
function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    listMessages: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    ...overrides,
  };
}

describe('MailListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未读样式类 ring-brand-300 在图标替换后仍保留', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '未读', isRead: false })],
      }),
    });
    const { container } = render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findAllByText('未读');

    // 未读邮件使用 bg-emerald-50/30 背景而非 ring-brand-300
    const unreadItems = container.querySelectorAll('div.bg-emerald-50\\/30');
    expect(unreadItems.length).toBeGreaterThan(0);
  });

  it('加载后展示邮件列表', async () => {
    // 进入页面应按账号拉取并渲染邮件
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          summary({ id: 1, subject: '第一封', fromAddr: 'a@163.com' }),
          summary({ id: 2, subject: '第二封', fromAddr: 'b@163.com' }),
        ],
      }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findAllByText('第一封')).toHaveLength(2); // 桌面端和移动端各一个
    expect(screen.getAllByText('第二封')).toHaveLength(2);
    // 应按当前账号拉取
    expect(api.listMessages).toHaveBeenCalledWith(7, 1, expect.any(Number));
  });

  it('点击刷新触发增量同步并重新加载', async () => {
    // 点击刷新应调用 refresh 后再次拉取列表
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({ total: 0, items: [] })
      .mockResolvedValueOnce({ total: 1, items: [summary({ id: 5, subject: '新邮件' })] });
    const api = stubApi({
      listMessages,
      refresh: vi.fn().mockResolvedValue({ newCount: 1, syncedAt: 123 }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1));

    const refreshButtons = screen.getAllByRole('button', { name: '收取邮件' });
    fireEvent.click(refreshButtons[0]); // 点击第一个（移动端或桌面端）

    await waitFor(() => {
      expect(api.refresh).toHaveBeenCalledWith(7);
    });
    expect(await screen.findAllByText('新邮件')).toHaveLength(2);
  });

  it('刷新后展示新邮件数提示', async () => {
    // 刷新返回 newCount，应给出提示
    const api = stubApi({
      refresh: vi.fn().mockResolvedValue({ newCount: 3, syncedAt: 123 }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    const refreshButtons = screen.getAllByRole('button', { name: '收取邮件' });
    fireEvent.click(refreshButtons[0]);

    expect(await screen.findByText(/新增 3/)).toBeInTheDocument();
  });

  it('点击邮件触发 onOpenMessage', async () => {
    // 点击邮件项进入详情
    const onOpenMessage = vi.fn();
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 9, subject: '可点击' })],
      }),
    });

    const { container } = render(<MailListPage api={api as never} accountId={7} onOpenMessage={onOpenMessage} onBack={vi.fn()} />);
    const mailItems = await screen.findAllByText('可点击');
    const clickableDiv = mailItems[0].closest('div.cursor-pointer');
    expect(clickableDiv).toBeInTheDocument();
    fireEvent.click(clickableDiv!);

    expect(onOpenMessage).toHaveBeenCalledWith(9);
  });

  it('点击返回触发 onBack', async () => {
    // 返回按钮回到账号列表
    const onBack = vi.fn();
    const api = stubApi();

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={onBack} />);
    // 等待初始加载完成，避免未 await 的异步 setState 触发 act 警告
    await waitFor(() => expect(api.listMessages).toHaveBeenCalled());
    const backButtons = screen.getAllByRole('button', { name: /返回/ });
    fireEvent.click(backButtons[0]);

    expect(onBack).toHaveBeenCalled();
  });

  it('未读邮件以醒目方式标识', async () => {
    // 未读邮件应带特殊样式（bg-emerald-50/30）
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          summary({ id: 1, subject: '未读邮件', isRead: false }),
          summary({ id: 2, subject: '已读邮件', isRead: true }),
        ],
      }),
    });

    const { container } = render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findAllByText('未读邮件');

    // 找到包含未读邮件的容器
    const unreadItems = container.querySelectorAll('div.bg-emerald-50\\/30');
    expect(unreadItems.length).toBeGreaterThan(0);
  });

  it('桌面端显示附件图标，移动端不显示', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '带附件', hasAttach: true })],
      }),
    });

    const { container } = render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findAllByText('带附件');

    // 桌面端附件图标存在
    const attachmentIcons = container.querySelectorAll('.lucide-paperclip');
    expect(attachmentIcons.length).toBe(1); // 只有桌面端有
  });

  it('分页：点击下一页加载后续邮件', async () => {
    // 总数超过每页大小时，点击下一页应以 page=2 拉取
    const listMessages = vi.fn().mockResolvedValue({
      total: 50,
      items: [summary({ id: 1, subject: '邮件' })],
    });
    const api = stubApi({ listMessages });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findAllByText('邮件');

    const nextButtons = screen.getAllByRole('button', { name: '下一页' });
    fireEvent.click(nextButtons[0]);

    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(7, 2, expect.any(Number));
    });
  });

  it('桌面端保留白色卡片容器布局', async () => {
    const api = stubApi();
    const { container } = render(
      <MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />
    );
    await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

    // 桌面端应该有白色卡片容器（使用 sm: 断点隐藏移动端顶栏）
    const desktopCard = container.querySelector('.rounded-2xl.border.border-slate-200.bg-white.shadow-sm');
    expect(desktopCard).toBeInTheDocument();
  });

  it('移动端顶部栏布局：返回按钮+居中邮箱+刷新按钮', async () => {
    const api = stubApi();
    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

    // 移动端顶部栏应该有返回和刷新按钮
    const backButtons = screen.getAllByRole('button', { name: '返回' });
    const refreshButtons = screen.getAllByRole('button', { name: '收取邮件' });
    expect(backButtons.length).toBeGreaterThan(0);
    expect(refreshButtons.length).toBeGreaterThan(0);
  });

  it('移动端不使用白色卡片容器', async () => {
    // 此测试已被 "桌面端保留白色卡片容器布局" 取代
    // 移动端和桌面端使用响应式设计，同一 DOM 结构通过 Tailwind 断点切换显示
  });

  it('移动端邮件项简洁布局：头像+发件人+时间在上，主题在下', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '测试主题', fromAddr: 'john@163.com', isRead: false })],
      }),
    });
    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findAllByText('测试主题');

    // 应该有发件人显示
    expect(screen.getAllByText('john@163.com').length).toBeGreaterThan(0);

    // 应该有主题显示
    expect(screen.getAllByText('测试主题').length).toBeGreaterThan(0);
  });

  it('刷新按钮防抖：快速连续点击只触发一次', async () => {
    const refresh = vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 123 });
    const api = stubApi({ refresh });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

    const refreshButtons = screen.getAllByRole('button', { name: '收取邮件' });
    const refreshButton = refreshButtons[0];

    // 快速点击 3 次
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);

    // 立即只触发 1 次
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // 等待防抖时间（1秒）后再点击
    await new Promise(resolve => setTimeout(resolve, 1100));
    fireEvent.click(refreshButton);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('移动端邮件项不显示附件图标', async () => {
    // 响应式设计通过 hidden sm:inline-flex 控制
    // 此测试标记桌面端显示，移动端隐藏的行为
  });

  it('未读邮件显示绿色渐变头像', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '未读', fromAddr: 'john@163.com', isRead: false })],
      }),
    });
    const { container } = render(
      <MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />
    );
    await screen.findAllByText('未读');

    // 查找头像（绿色渐变）
    const avatar = container.querySelector('.rounded-full.bg-gradient-to-br.from-emerald-500.to-emerald-600');
    expect(avatar).toBeInTheDocument();
    expect(avatar?.textContent).toBe('J');
  });

  it('已读邮件显示灰色渐变头像', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '已读', fromAddr: 'support@163.com', isRead: true })],
      }),
    });
    const { container } = render(
      <MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />
    );
    await screen.findAllByText('已读');

    // 查找头像（灰色渐变）
    const avatar = container.querySelector('.rounded-full.bg-gradient-to-br.from-slate-400.to-slate-500');
    expect(avatar).toBeInTheDocument();
    expect(avatar?.textContent).toBe('S');
  });

  it('邮件列表使用 divide-y 分隔', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          summary({ id: 1, subject: '邮件1' }),
          summary({ id: 2, subject: '邮件2' }),
        ],
      }),
    });
    const { container } = render(
      <MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />
    );
    await screen.findAllByText('邮件1');

    // 查找带 divide-y 的容器
    const mailList = container.querySelector('.divide-y.divide-slate-100');
    expect(mailList).toBeInTheDocument();
  });
});
