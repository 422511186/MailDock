import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AggregateMailPage } from './AggregateMailPage';
import type { Account, MessageSummary } from '../api/client';

/** 探针：渲染当前 URL 查询串，便于断言视图状态写入 URL。 */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="search">{loc.search}</div>;
}

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

/** 构造一个账号。 */
function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 7,
    email: 'owner@163.com',
    imapHost: 'imap.163.com',
    imapPort: 993,
    lastUid: 0,
    lastSyncAt: 0,
    lastTestAt: 0,
    lastTestOk: false,
    lastTestMsg: null,
    messageCount: 0,
    ...overrides,
  };
}

/** 构造一个最小可用的 API 客户端桩。 */
function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    searchMessages: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    refresh: vi.fn().mockResolvedValue({ newCount: 0, syncedAt: 0 }),
    listAccounts: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    ...overrides,
  };
}

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage(api: any) {
  return render(
    <MemoryRouter initialEntries={['/messages']}>
      <Routes>
        <Route path="/messages" element={<AggregateMailPage api={api} />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 在指定 URL（可带查询串）下渲染，并附带 URL 探针。 */
function renderAt(api: any, entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/messages"
          element={
            <>
              <AggregateMailPage api={api} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AggregateMailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.querySelectorAll('.fixed.right-4.top-20').forEach((el) => el.remove());
  });

  it('初始渲染调用 searchMessages 并展示邮件与所属账号徽章', async () => {
    const api = stubApi({
      searchMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 1, subject: '第一封', fromAddr: 'a@163.com', accountId: 7 })],
      }),
      listAccounts: vi.fn().mockResolvedValue({
        total: 1,
        items: [account({ id: 7, email: 'owner@163.com' })],
      }),
    });

    renderPage(api);

    await waitFor(() => expect(api.searchMessages).toHaveBeenCalled());
    expect(await screen.findAllByText('第一封')).not.toHaveLength(0);
    expect(screen.getAllByText('a@163.com').length).toBeGreaterThan(0);
    // 所属账号徽章（标题含完整邮箱）
    await waitFor(() => {
      expect(document.querySelector('[title="owner@163.com"]')).toBeInTheDocument();
    });
  });

  it('输入关键字提交后带 keyword 再次调用 searchMessages', async () => {
    const api = stubApi();
    renderPage(api);
    await waitFor(() => expect(api.searchMessages).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('搜索主题 / 发件人 / 正文');
    fireEvent.change(input, { target: { value: '发票' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: '发票', page: 1 }),
      );
    });
  });

  it('切换已读状态下拉把 isRead 流入查询', async () => {
    const api = stubApi();
    renderPage(api);
    await waitFor(() => expect(api.searchMessages).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('已读状态'), { target: { value: 'unread' } });

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ isRead: false, page: 1 }),
      );
    });
  });

  it('切换附件状态下拉把 hasAttach 流入查询', async () => {
    const api = stubApi();
    renderPage(api);
    await waitFor(() => expect(api.searchMessages).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('附件状态'), { target: { value: 'with' } });

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ hasAttach: true, page: 1 }),
      );
    });
  });

  it('切换账号下拉把 accountId 流入查询', async () => {
    const api = stubApi({
      listAccounts: vi.fn().mockResolvedValue({
        total: 1,
        items: [account({ id: 7, email: 'owner@163.com' })],
      }),
    });
    renderPage(api);
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('所属账号'), { target: { value: '7' } });

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ accountId: 7, page: 1 }),
      );
    });
  });

  it('切换每页条数立即以新 size 重新搜索', async () => {
    const api = stubApi();
    renderPage(api);
    await waitFor(() => expect(api.searchMessages).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '50' } });

    await waitFor(() => {
      expect(api.searchMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ size: 50, page: 1 }),
      );
    });
  });

  it('点击邮件导航到详情页（按所属账号）', async () => {
    const api = stubApi({
      searchMessages: vi.fn().mockResolvedValue({
        total: 1,
        items: [summary({ id: 9, subject: '可点击', accountId: 12 })],
      }),
    });

    renderPage(api);
    const mailItems = await screen.findAllByText('可点击');
    const clickable = mailItems[0].closest('div.cursor-pointer');
    expect(clickable).toBeInTheDocument();
    fireEvent.click(clickable!);

    expect(mockNavigate).toHaveBeenCalledWith('/accounts/12/messages/9');
  });

  it('点击收取全部对每个账号调用 refresh 后重新搜索并提示', async () => {
    const refresh = vi.fn().mockResolvedValue({ newCount: 1, syncedAt: 0 });
    const api = stubApi({
      refresh,
      listAccounts: vi.fn().mockResolvedValue({
        total: 2,
        items: [account({ id: 7 }), account({ id: 8, email: 'b@163.com' })],
      }),
    });

    renderPage(api);
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalled());
    await waitFor(() => expect(api.searchMessages).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '收取全部' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledWith(7);
    expect(refresh).toHaveBeenCalledWith(8);
    // 收取后重新搜索
    await waitFor(() => expect(api.searchMessages.mock.calls.length).toBeGreaterThan(1));
    // 汇总 Toast
    await waitFor(() => {
      expect(document.querySelector('.fixed.right-4.top-20')).toBeInTheDocument();
    });
  });

  it('深链恢复：带 page/关键词/筛选查询串进入时按其加载并回显', async () => {
    const searchMessages = vi.fn().mockResolvedValue({ total: 100, items: [summary({ id: 1, subject: '深链邮件' })] });
    const api = stubApi({ searchMessages });

    renderAt(api, '/messages?page=2&q=发票&read=unread');
    await screen.findAllByText('深链邮件');

    expect(searchMessages).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, keyword: '发票', isRead: false }),
    );
    // 关键词输入框回显
    expect((screen.getByPlaceholderText('搜索主题 / 发件人 / 正文') as HTMLInputElement).value).toBe('发票');
    // 已读下拉回显未读
    expect((screen.getByLabelText('已读状态') as HTMLSelectElement).value).toBe('unread');
  });

  it('翻页把 page 写入 URL', async () => {
    const searchMessages = vi.fn().mockResolvedValue({ total: 50, items: [summary({ id: 1, subject: '翻页邮件' })] });
    const api = stubApi({ searchMessages });

    renderAt(api, '/messages');
    await screen.findAllByText('翻页邮件');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(screen.getByTestId('search').textContent).toContain('page=2');
    });
    await waitFor(() =>
      expect(searchMessages).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
  });

  it('在非第 1 页改筛选时把 page 重置为 1 并写入 URL', async () => {
    const searchMessages = vi.fn().mockResolvedValue({ total: 100, items: [summary({ id: 1, subject: '筛选邮件' })] });
    const api = stubApi({ searchMessages });

    renderAt(api, '/messages?page=3');
    await screen.findAllByText('筛选邮件');

    fireEvent.change(screen.getByLabelText('已读状态'), { target: { value: 'read' } });

    await waitFor(() => {
      const s = screen.getByTestId('search').textContent ?? '';
      expect(s).toContain('read=read');
      expect(s).not.toContain('page=3');
    });
    await waitFor(() =>
      expect(searchMessages).toHaveBeenLastCalledWith(expect.objectContaining({ isRead: true, page: 1 })),
    );
  });
});
