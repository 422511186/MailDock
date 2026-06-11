import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiClient } from './client';

describe('ApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // 每个用例前清空本地存储的 token
    localStorage.clear();
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

  it('登录成功后保存 token', async () => {
    // 登录接口返回 token，客户端应保存以供后续请求使用
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'tok-123' }));
    const client = new ApiClient();

    const token = await client.login('admin', 'pass');

    expect(token).toBe('tok-123');
    expect(client.getToken()).toBe('tok-123');
    // 请求应打到带版本号的登录路径
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'admin', password: 'pass' });
  });

  it('登录失败抛出错误', async () => {
    // 401 时应抛出包含错误信息的异常
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: '用户名或密码错误' }, 401));
    const client = new ApiClient();

    await expect(client.login('admin', 'wrong')).rejects.toThrow('用户名或密码错误');
  });

  it('已认证请求自动携带 Bearer Token', async () => {
    // 设置 token 后，受保护请求头应带上 Authorization
    const client = new ApiClient();
    client.setToken('tok-abc');
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await client.listAccounts();

    const [url, init] = fetchMock.mock.calls[0];
    // 列表带默认分页参数（page=1&size=20）
    expect(url).toBe('/api/v1/accounts?page=1&size=20');
    expect(init.headers['Authorization']).toBe('Bearer tok-abc');
  });

  it('listAccounts 返回分页结构 { total, items }', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, items: [{ id: 1, email: 'a@163.com' }] }));

    const paged = await client.listAccounts();

    expect(paged.total).toBe(1);
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0].email).toBe('a@163.com');
  });

  it('createAccount 提交邮箱与授权码', async () => {
    const client = new ApiClient();
    client.setToken('t');
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
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ newCount: 3, syncedAt: 123 }));

    const result = await client.refresh(7);

    expect(result.newCount).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/7/refresh');
    expect(init.method).toBe('POST');
  });

  it('listMessages 带分页参数', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, items: [] }));

    await client.listMessages(7, 2, 20);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/7/messages?page=2&size=20');
  });

  it('getMessage 返回邮件详情', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 9, subject: '主题', bodyText: '正文', attachments: [] }));

    const detail = await client.getMessage(9);

    expect(detail.subject).toBe('主题');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/messages/9');
  });

  it('logout 撤销 token 并清空本地保存', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.logout();

    expect(client.getToken()).toBeNull();
  });

  it('token 持久化到 localStorage', async () => {
    // 新建客户端实例时应从 localStorage 恢复 token
    const client = new ApiClient();
    client.setToken('persisted-tok');

    const another = new ApiClient();
    expect(another.getToken()).toBe('persisted-tok');
  });

  it('testBatch 提交 id 列表', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    await client.testBatch([1, 2, 3]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/test-batch');
    expect(JSON.parse(init.body)).toEqual({ ids: [1, 2, 3] });
  });

  it('importText 以纯文本提交', async () => {
    const client = new ApiClient();
    client.setToken('t');
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2, success: 2, failed: 0, skipped: 0, results: [] }));

    await client.importText('a@163.com code1\nb@163.com code2');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/accounts/import');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toContain('text/plain');
    expect(init.body).toContain('a@163.com');
  });
});
