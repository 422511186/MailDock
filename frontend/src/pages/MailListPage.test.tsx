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

    expect(await screen.findByText('第一封')).toBeInTheDocument();
    expect(screen.getByText('第二封')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

    await waitFor(() => {
      expect(api.refresh).toHaveBeenCalledWith(7);
    });
    expect(await screen.findByText('新邮件')).toBeInTheDocument();
  });

  it('刷新后展示新邮件数提示', async () => {
    // 刷新返回 newCount，应给出提示
    const api = stubApi({
      refresh: vi.fn().mockResolvedValue({ newCount: 3, syncedAt: 123 }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    expect(await screen.findByText(/新增 3/)).toBeInTheDocument();
  });

  it('点击邮件触发 onOpenMessage', async () => {
    // 点击邮件主题进入详情
    const onOpenMessage = vi.fn();
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 9, subject: '可点击' })],
      }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={onOpenMessage} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByText('可点击'));

    expect(onOpenMessage).toHaveBeenCalledWith(9);
  });

  it('点击返回触发 onBack', async () => {
    // 返回按钮回到账号列表
    const onBack = vi.fn();
    const api = stubApi();

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={onBack} />);
    // 等待初始加载完成，避免未 await 的异步 setState 触发 act 警告
    await waitFor(() => expect(api.listMessages).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /返回/ }));

    expect(onBack).toHaveBeenCalled();
  });

  it('未读邮件以醒目方式标识', async () => {
    // 未读邮件应带特殊样式（ring-2 ring-brand-300）
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 2,
        items: [
          summary({ id: 1, subject: '未读邮件', isRead: false }),
          summary({ id: 2, subject: '已读邮件', isRead: true }),
        ],
      }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('未读邮件');

    // 找到包含未读邮件的最外层卡片容器
    const unreadSubject = screen.getByText('未读邮件');
    let unreadCard: HTMLElement | null = unreadSubject.closest('div');
    // 向上查找带 ring-brand-300 的父容器
    while (unreadCard && !unreadCard.className.includes('ring-brand-300')) {
      unreadCard = unreadCard.parentElement as HTMLElement;
    }
    expect(unreadCard).toBeTruthy();
    expect(unreadCard!.className).toContain('ring-brand-300');
  });

  it('有附件的邮件显示附件标识', async () => {
    // 含附件的邮件应展示 SVG 图标
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '带附件', hasAttach: true })],
      }),
    });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('带附件');

    const card = screen.getByText('带附件').closest('div')!;
    // 检查是否有 SVG 附件图标
    expect(card.querySelector('svg')).toBeInTheDocument();
  });

  it('分页：点击下一页加载后续邮件', async () => {
    // 总数超过每页大小时，点击下一页应以 page=2 拉取
    const listMessages = vi.fn().mockResolvedValue({
      total: 50,
      items: [summary({ id: 1, subject: '邮件' })],
    });
    const api = stubApi({ listMessages });

    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('邮件');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(listMessages).toHaveBeenLastCalledWith(7, 2, expect.any(Number));
    });
  });

  it('未读样式类 ring-brand-300 在图标替换后仍保留', async () => {
    const api = stubApi({
      listMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '未读', isRead: false })],
      }),
    });
    render(<MailListPage api={api as never} accountId={7} onOpenMessage={vi.fn()} onBack={vi.fn()} />);
    await screen.findByText('未读');
    let card: HTMLElement | null = screen.getByText('未读').closest('div');
    while (card && !card.className.includes('ring-brand-300')) {
      card = card.parentElement as HTMLElement;
    }
    expect(card).toBeTruthy();
  });
});
