import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App';
import type { Account, CurrentUser, MessageDetail, MessageSummary } from './api/client';

/** 构造当前用户。 */
function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    primaryEmail: 'alice@example.com',
    displayName: 'Alice',
    avatarUrl: null,
    hasPassword: true,
    ...overrides,
  };
}

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
    me: vi.fn().mockResolvedValue(user()),
    login: vi.fn().mockResolvedValue(user()),
    logout: vi.fn().mockResolvedValue(undefined),
    linuxDoLoginUrl: vi.fn().mockReturnValue('/api/v1/auth/linuxdo/start'),
    listAccounts: vi.fn().mockResolvedValue({ total: 1, items: [account()] }),
    listMessages: vi.fn().mockResolvedValue({ total: 1, items: [summary({ subject: '一封邮件' })] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    getMessage: vi.fn().mockResolvedValue(detail({ subject: '邮件详情主题' })),
    markRead: vi.fn().mockResolvedValue({}),
    attachmentUrl: vi.fn((mid: number, aid: number) => `/api/v1/messages/${mid}/attachments/${aid}`),
    updateDisplayName: vi.fn().mockResolvedValue(user()),
    changePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auth me 失败时展示登录页', async () => {
    const api = stubApi({ me: vi.fn().mockRejectedValue(new Error('未登录')) });
    render(<App api={api as never} />);
    expect(await screen.findByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
  });

  it('auth me 成功时直接进入账号列表', async () => {
    const api = stubApi({ me: vi.fn().mockResolvedValue(user()) });
    render(<App api={api as never} />);

    await waitFor(() => expect(api.me).toHaveBeenCalled());
    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
    // 用户名移入头像下拉，展开后可见
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
  });

  it('登录成功后进入账号列表', async () => {
    const api = stubApi({ me: vi.fn().mockRejectedValue(new Error('未登录')) });
    render(<App api={api as never} />);

    // 新 LoginPage 默认按钮式，先点开「邮箱或用户名」展开表单
    fireEvent.click(await screen.findByRole('button', { name: /使用 邮箱或用户名 登录/ }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
    expect(api.login).toHaveBeenCalledWith('alice@example.com', 'pw');
  });

  it('点击账号进入邮件列表，再点击邮件进入详情，并能逐级返回', async () => {
    // 账号列表 -> 邮件列表 -> 邮件详情 -> 返回邮件列表 -> 返回账号列表
    const api = stubApi();
    render(<App api={api as never} />);

    // 进入邮件列表
    const emailLinks = await screen.findAllByText('owner@163.com');
    fireEvent.click(emailLinks[0]);
    expect((await screen.findAllByText('一封邮件')).length).toBeGreaterThan(0);

    // 进入邮件详情（点击第一个，桌面端或移动端）
    const mailItems = screen.getAllByText('一封邮件');
    fireEvent.click(mailItems[0]);
    expect(await screen.findByText('邮件详情主题')).toBeInTheDocument();

    // 从详情返回邮件列表
    const backButtons1 = screen.getAllByRole('button', { name: /返回/ });
    fireEvent.click(backButtons1[0]);
    expect((await screen.findAllByText('一封邮件')).length).toBeGreaterThan(0);

    // 从邮件列表返回账号列表
    const backButtons2 = screen.getAllByRole('button', { name: /返回/ });
    fireEvent.click(backButtons2[0]);
    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
  });

  it('点击登出回到登录页', async () => {
    // 登出后清空状态并返回登录页
    const api = stubApi();
    render(<App api={api as never} />);
    await screen.findAllByText('owner@163.com');

    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
    });
    expect(await screen.findByRole('button', { name: /使用 邮箱或用户名 登录/ })).toBeInTheDocument();
  });

  it('从头像菜单进入个人中心，可返回账号列表', async () => {
    const api = stubApi();
    render(<App api={api as never} />);
    await screen.findAllByText('owner@163.com');

    fireEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '个人中心' }));

    expect(await screen.findByText('个人中心')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect((await screen.findAllByText('owner@163.com')).length).toBeGreaterThan(0);
  });
});
