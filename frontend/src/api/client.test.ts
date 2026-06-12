import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiClient } from './client';

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 构造一个成功的 JSON 响应。 */
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('login posts email password and relies on cookie session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, primaryEmail: 'a@example.com', displayName: 'a@example.com' }),
    );
    const client = new ApiClient();

    const user = await client.login('a@example.com', 'pass');

    expect(user.primaryEmail).toBe('a@example.com');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com', password: 'pass' });
  });

  it('登录失败抛出错误', async () => {
    // 401 时应抛出包含错误信息的异常
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: '邮箱或密码错误' }, 401));
    const client = new ApiClient();

    await expect(client.login('a@example.com', 'wrong')).rejects.toThrow('邮箱或密码错误');
  });

  it('me calls auth me with credentials include', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, primaryEmail: 'a@example.com' }));
    const client = new ApiClient();

    await client.me();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/me');
    expect(init.credentials).toBe('include');
  });

  it('linuxDoLoginUrl returns start endpoint', () => {
    const client = new ApiClient();

    expect(client.linuxDoLoginUrl()).toBe('/api/v1/auth/linuxdo/start');
  });

  it('受保护请求自动携带 Cookie 凭据', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await client.listAccounts();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts?page=1&size=20');
    expect(init.credentials).toBe('include');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('listAccounts 返回分页结构 { total, items }', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, items: [{ id: 1, email: 'a@163.com' }] }));

    const paged = await client.listAccounts();

    expect(paged.total).toBe(1);
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0].email).toBe('a@163.com');
  });

  it('createAccount 提交邮箱与授权码', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 5, email: 'new@163.com' }, 201));

    const created = await client.createAccount('new@163.com', 'auth-code');

    expect(created.id).toBe(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'new@163.com', authCode: 'auth-code' });
  });

  it('refresh 调用刷新接口返回新邮件数', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ newCount: 3, syncedAt: 123 }));

    const result = await client.refresh(7);

    expect(result.newCount).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/7/refresh');
    expect(init.method).toBe('POST');
  });

  it('listMessages 带分页参数', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, items: [] }));

    await client.listMessages(7, 2, 20);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/7/messages?page=2&size=20');
  });

  it('getMessage 返回邮件详情', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 9, subject: '主题', bodyText: '正文', attachments: [] }));

    const detail = await client.getMessage(9);

    expect(detail.subject).toBe('主题');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messages/9');
  });

  it('logout posts with credentials include', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.logout();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/logout');
    expect(init.credentials).toBe('include');
  });

  it('testBatch 提交 id 列表', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    await client.testBatch([1, 2, 3]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/test-batch');
    expect(JSON.parse(init.body)).toEqual({ ids: [1, 2, 3] });
  });

  it('importText 以纯文本提交', async () => {
    const client = new ApiClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2, success: 2, failed: 0, skipped: 0, results: [] }));

    await client.importText('a@163.com code1\nb@163.com code2');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/import');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toContain('text/plain');
    expect(init.body).toContain('a@163.com');
  });
});
