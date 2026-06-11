// MailDock 前端 API 客户端：封装与后端 REST API（/api/v1）的通信。
// 统一处理版本前缀、Bearer Token 注入、JSON 解析与错误抛出。
// Token 持久化到 localStorage，刷新页面或新建实例时自动恢复。

/** API 路径前缀（含版本号），与后端 ApiRouter.API 保持一致。 */
const API = '/api/v1';

/** localStorage 中保存 Token 的键名。 */
const TOKEN_KEY = 'maildock_token';

/** 邮箱账号（不含授权码，与后端 accountToJson 对齐）。 */
export interface Account {
  id: number;
  email: string;
  imapHost: string;
  imapPort: number;
  lastUid: number;
  lastSyncAt: number;
  lastTestAt: number;
  lastTestOk: boolean;
  lastTestMsg: string | null;
}

/** 邮件摘要（列表用，不含正文）。 */
export interface MessageSummary {
  id: number;
  accountId: number;
  uid: number;
  subject: string;
  fromAddr: string;
  toAddr: string;
  sentAt: number;
  receivedAt: number;
  hasAttach: boolean;
  isRead: boolean;
}

/** 附件元数据。 */
export interface AttachmentMeta {
  id: number;
  filename: string;
  contentType: string;
  size: number;
}

/** 邮件详情（含正文与附件列表）。 */
export interface MessageDetail {
  id: number;
  accountId: number;
  uid: number;
  messageId: string | null;
  subject: string;
  fromAddr: string;
  toAddr: string;
  ccAddr: string | null;
  sentAt: number;
  receivedAt: number;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  attachments: AttachmentMeta[];
}

/** 分页邮件列表。 */
export interface PagedMessages {
  total: number;
  items: MessageSummary[];
}

/** 刷新结果。 */
export interface RefreshResult {
  newCount: number;
  syncedAt: number;
}

/** 单个账号测活结果。 */
export interface TestResult {
  id: number;
  email: string;
  ok: boolean;
  message: string;
  latencyMs: number;
}

/** 批量测活结果。 */
export interface TestBatchResult {
  results: TestResult[];
}

/** 批量删除结果。 */
export interface DeleteBatchResult {
  deleted: number;
}

/** 批量导入单行结果。 */
export interface ImportItem {
  email: string;
  status: string;
  message: string;
}

/** 批量导入汇总结果。 */
export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: ImportItem[];
}

/** 账号三态过滤值：待检测 / 正常 / 异常；不传表示全部。 */
export type AccountStatusFilter = 'pending' | 'ok' | 'fail';

/** 账号列表查询条件（邮箱子串 + 状态 + 分页）。 */
export interface AccountQuery {
  email?: string;
  status?: AccountStatusFilter;
  page?: number;
  size?: number;
}

/** 分页账号列表（与后端 { total, items } 对齐）。 */
export interface PagedAccounts {
  total: number;
  items: Account[];
}

/**
 * MailDock API 客户端。每个实例从 localStorage 恢复 Token，
 * 受保护请求自动携带 Authorization 头。
 */
export class ApiClient {
  private token: string | null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  /** 返回当前 Token，未登录为 null。 */
  getToken(): string | null {
    return this.token;
  }

  /** 设置并持久化 Token。 */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  /** 清除本地 Token。 */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  /** 管理员登录，成功保存并返回 Token。 */
  async login(username: string, password: string): Promise<string> {
    const body = await this.request<{ token: string }>('/auth/login', {
      method: 'POST',
      json: { username, password },
      auth: false,
    });
    this.setToken(body.token);
    return body.token;
  }

  /** 登出，撤销服务端 Token 并清空本地保存。 */
  async logout(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST', raw: true });
    } finally {
      this.clearToken();
    }
  }

  /** 账号列表：支持邮箱搜索、状态过滤、分页，返回 { total, items }。 */
  listAccounts(query: AccountQuery = {}): Promise<PagedAccounts> {
    const params = new URLSearchParams();
    if (query.email && query.email.trim()) params.set('email', query.email.trim());
    if (query.status) params.set('status', query.status);
    params.set('page', String(query.page ?? 1));
    params.set('size', String(query.size ?? 20));
    return this.request<PagedAccounts>(`/accounts?${params.toString()}`, { method: 'GET' });
  }

  /** 创建账号。 */
  createAccount(email: string, authCode: string): Promise<Account> {
    return this.request<Account>('/accounts', {
      method: 'POST',
      json: { email, authCode },
    });
  }

  /** 删除账号。 */
  deleteAccount(id: number): Promise<void> {
    return this.request<void>(`/accounts/${id}`, { method: 'DELETE', raw: true });
  }

  /** 单个测活。 */
  testConnection(id: number): Promise<{ ok: boolean; message: string }> {
    return this.request(`/accounts/${id}/test`, { method: 'POST' });
  }

  /** 批量测活，不传 ids 则后端测试全部。 */
  testBatch(ids?: number[]): Promise<TestBatchResult> {
    return this.request<TestBatchResult>('/accounts/test-batch', {
      method: 'POST',
      json: ids ? { ids } : {},
    });
  }

  /** 批量删除，返回实际删除数量。 */
  deleteBatch(ids: number[]): Promise<DeleteBatchResult> {
    return this.request<DeleteBatchResult>('/accounts/delete-batch', {
      method: 'POST',
      json: { ids },
    });
  }

  /** 批量导入（纯文本，每行 "账号 授权码"）。 */
  importText(text: string, test = false, overwrite = false): Promise<ImportResult> {
    const params = new URLSearchParams();
    if (test) params.set('test', 'true');
    if (overwrite) params.set('overwrite', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<ImportResult>(`/accounts/import${query}`, {
      method: 'POST',
      text,
    });
  }

  /** 刷新某账号，触发增量同步。 */
  refresh(accountId: number): Promise<RefreshResult> {
    return this.request<RefreshResult>(`/accounts/${accountId}/refresh`, { method: 'POST' });
  }

  /** 分页查询某账号的邮件。 */
  listMessages(accountId: number, page = 1, size = 20): Promise<PagedMessages> {
    return this.request<PagedMessages>(
      `/accounts/${accountId}/messages?page=${page}&size=${size}`,
      { method: 'GET' }
    );
  }

  /** 邮件详情。 */
  getMessage(id: number): Promise<MessageDetail> {
    return this.request<MessageDetail>(`/messages/${id}`, { method: 'GET' });
  }

  /** 标记已读 / 未读。 */
  markRead(id: number, read: boolean): Promise<unknown> {
    return this.request(`/messages/${id}/read`, {
      method: 'PATCH',
      json: { read },
    });
  }

  /** 附件下载地址（带 token 由调用方处理，这里返回相对路径）。 */
  attachmentUrl(messageId: number, attachmentId: number): string {
    return `${API}/messages/${messageId}/attachments/${attachmentId}`;
  }

  /**
   * 统一请求方法：拼接版本前缀、注入 Token、提交 JSON 或纯文本、解析响应。
   * 非 2xx 时抛出携带后端 message 的错误。
   */
  private async request<T>(
    path: string,
    opts: {
      method: string;
      json?: unknown;
      text?: string;
      raw?: boolean;
      auth?: boolean;
    }
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const auth = opts.auth !== false;
    if (auth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let body: string | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.text !== undefined) {
      headers['Content-Type'] = 'text/plain; charset=utf-8';
      body = opts.text;
    }

    const resp = await fetch(`${API}${path}`, { method: opts.method, headers, body });

    if (!resp.ok) {
      let message = `请求失败 (${resp.status})`;
      try {
        const err = await resp.json();
        if (err && err.message) message = err.message;
      } catch {
        // 响应体不是 JSON 时沿用默认信息
      }
      throw new Error(message);
    }

    // 204 或显式 raw：不解析响应体
    if (opts.raw || resp.status === 204) {
      return undefined as T;
    }
    return (await resp.json()) as T;
  }
}

/** 全局共享的单例客户端。 */
export const api = new ApiClient();
