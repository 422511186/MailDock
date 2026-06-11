import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MailDetailPage } from './MailDetailPage';
import type { MessageDetail } from '../api/client';

/** 构造一封邮件详情。 */
function detail(overrides: Partial<MessageDetail> = {}): MessageDetail {
  return {
    id: 1,
    accountId: 7,
    uid: 1,
    messageId: '<abc@163.com>',
    subject: '主题',
    fromAddr: 'alice@163.com',
    toAddr: 'owner@163.com',
    ccAddr: null,
    sentAt: 1700000000000,
    receivedAt: 1700000000000,
    bodyText: '纯文本正文',
    bodyHtml: null,
    isRead: false,
    attachments: [],
    ...overrides,
  };
}

/** 构造一个最小可用的 API 客户端桩。 */
function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    getMessage: vi.fn().mockResolvedValue(detail()),
    markRead: vi.fn().mockResolvedValue({}),
    attachmentUrl: vi.fn((mid: number, aid: number) => `/api/v1/messages/${mid}/attachments/${aid}`),
    ...overrides,
  };
}

describe('MailDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('加载后展示邮件主题、发件人、收件人', async () => {
    // 进入页面应按 ID 拉取详情并展示头部信息
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(
        detail({ subject: '你好世界', fromAddr: 'bob@163.com', toAddr: 'me@163.com' }),
      ),
    });

    render(<MailDetailPage api={api as never} messageId={1} onBack={vi.fn()} />);

    expect(await screen.findByText('你好世界')).toBeInTheDocument();
    expect(screen.getByText(/bob@163\.com/)).toBeInTheDocument();
    expect(screen.getByText(/me@163\.com/)).toBeInTheDocument();
    expect(api.getMessage).toHaveBeenCalledWith(1);
  });

  it('优先展示 HTML 正文', async () => {
    // 同时存在 HTML 与纯文本时应渲染 HTML
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(
        detail({ bodyHtml: '<p>HTML 正文</p>', bodyText: '纯文本正文' }),
      ),
    });

    render(<MailDetailPage api={api as never} messageId={1} onBack={vi.fn()} />);

    expect(await screen.findByText('HTML 正文')).toBeInTheDocument();
    expect(screen.queryByText('纯文本正文')).not.toBeInTheDocument();
  });

  it('无 HTML 时回退展示纯文本正文', async () => {
    // 仅有纯文本时应展示纯文本
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(detail({ bodyHtml: null, bodyText: '只有纯文本' })),
    });

    render(<MailDetailPage api={api as never} messageId={1} onBack={vi.fn()} />);

    expect(await screen.findByText('只有纯文本')).toBeInTheDocument();
  });

  it('展示附件下载链接', async () => {
    // 附件应渲染为带下载地址的链接
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(
        detail({
          attachments: [
            { id: 11, filename: '报告.pdf', contentType: 'application/pdf', size: 2048 },
          ],
        }),
      ),
    });

    render(<MailDetailPage api={api as never} messageId={1} onBack={vi.fn()} />);

    const link = await screen.findByText('报告.pdf');
    expect(link.closest('a')).toHaveAttribute('href', '/api/v1/messages/1/attachments/11');
    expect(api.attachmentUrl).toHaveBeenCalledWith(1, 11);
  });

  it('加载后自动标记为已读', async () => {
    // 未读邮件打开后应调用 markRead 标记已读
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(detail({ id: 9, isRead: false })),
    });

    render(<MailDetailPage api={api as never} messageId={9} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(api.markRead).toHaveBeenCalledWith(9, true);
    });
  });

  it('已读邮件不再重复标记', async () => {
    // 已读邮件无需再次调用 markRead
    const api = stubApi({
      getMessage: vi.fn().mockResolvedValue(detail({ id: 9, isRead: true })),
    });

    render(<MailDetailPage api={api as never} messageId={9} onBack={vi.fn()} />);

    await screen.findByText('主题');
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('点击返回触发 onBack', async () => {
    // 返回按钮回到邮件列表
    const onBack = vi.fn();
    const api = stubApi();

    render(<MailDetailPage api={api as never} messageId={1} onBack={onBack} />);
    await screen.findByText('主题');

    fireEvent.click(screen.getByRole('button', { name: /返回/ }));
    expect(onBack).toHaveBeenCalled();
  });
});
