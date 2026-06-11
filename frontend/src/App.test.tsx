import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App';
import type { Account, MessageDetail, MessageSummary } from './api/client';

/** 构造账号。 */
function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 7,
    email: 'owner@163.com',
    imapHost: 'imap.163.com',
    imapPort: 993,
    lastUid: 0,
    lastSyncAt: 0,
    lastTestAt: 0,
    lastTestOk: true,
    lastTestMsg: null,
    ...overrides,
  };
}

/** 构造邮件摘要。 */
function summary(overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    id: 1,
    accountId: 7,
    uid: 1,
    subject: '主题',
    fromAddr: 'a@163.com',
    toAddr: 'owner@163.com',
    sentAt: 0,
    receivedAt: 0,
    hasAttach: false,
    isRead: true,
    ...overrides,
  };
}

/** 构造邮件详情。 */
function detail(overrides: Partial<MessageDetail> = {}): MessageDetail {
  return {
    id: 1,
    accountId: 7,
    uid: 1,
    messageId: null,
    subject: '主题',
    fromAddr: 'a@163.com',
    toAddr: 'owner@163.com',
    ccAddr: null,
    sentAt: 0,
    receivedAt: 0,
    bodyText: '正文',
    bodyHtml: null,
    isRead: true,
    attachments: [],
    ...overrides,
  };
}

/** 构造一个最小可用的 API 客户端桩。 */
function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    getToken: vi.fn().mockReturnValue(null),
    login: vi.fn().mockResolvedValue('tok'),
    logout: vi.fn().mockResolvedValue(undefined),
    listAccounts: vi.fn().mockResolvedValue({ total: 1, items: [account()] }),
    listMessages: vi.fn().mockResolvedValue({ total: 1, items: [summary({ subject: '一封邮件' })] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    getMessage: vi.fn().mockResolvedValue(detail({ subject: '邮件详情主题' })),
    markRead: vi.fn().mockResolvedValue({}),
    attachmentUrl: vi.fn((mid: number, aid: number) => `/api/v1/messages/${mid}/attachments/${aid}`),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('未登录时展示登录页', () => {
    // 无 token 应显示登录界面
    const api = stubApi();
    render(<App api={api as never} />);
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });

  it('已有 token 时直接进入账号列表', async () => {
    // 已登录应跳过登录页，展示账号列表
    const api = stubApi({ getToken: vi.fn().mockReturnValue('tok') });
    render(<App api={api as never} />);
    expect(await screen.findByText('owner@163.com')).toBeInTheDocument();
  });

  it('登录成功后进入账号列表', async () => {
    // 提交登录后应调用 api.login 并展示账号列表
    const api = stubApi();
    render(<App api={api as never} />);

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('owner@163.com')).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith('admin', 'pw');
  });

  it('点击账号进入邮件列表，再点击邮件进入详情，并能逐级返回', async () => {
    // 账号列表 -> 邮件列表 -> 邮件详情 -> 返回邮件列表 -> 返回账号列表
    const api = stubApi({ getToken: vi.fn().mockReturnValue('tok') });
    render(<App api={api as never} />);

    // 进入邮件列表
    fireEvent.click(await screen.findByText('owner@163.com'));
    expect(await screen.findByText('一封邮件')).toBeInTheDocument();

    // 进入邮件详情
    fireEvent.click(screen.getByText('一封邮件'));
    expect(await screen.findByText('邮件详情主题')).toBeInTheDocument();

    // 从详情返回邮件列表
    fireEvent.click(screen.getByRole('button', { name: /返回/ }));
    expect(await screen.findByText('一封邮件')).toBeInTheDocument();

    // 从邮件列表返回账号列表
    fireEvent.click(screen.getByRole('button', { name: /返回/ }));
    expect(await screen.findByText('owner@163.com')).toBeInTheDocument();
  });

  it('点击登出回到登录页', async () => {
    // 登出后清空状态并返回登录页
    const api = stubApi({ getToken: vi.fn().mockReturnValue('tok') });
    render(<App api={api as never} />);
    await screen.findByText('owner@163.com');

    fireEvent.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
    });
    expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument();
  });
});
