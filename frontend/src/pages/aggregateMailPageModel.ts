import type { MessageQuery } from '../api/client';

/** 聚合邮件页过滤态。UI 友好的取值，提交前由 toMessageQuery 映射为后端 MessageQuery。 */
export interface AggregateFilterState {
  keyword: string;
  accountId: 'all' | number;
  readState: 'all' | 'read' | 'unread';
  attachState: 'all' | 'with' | 'without';
  startDate: string; // yyyy-mm-dd，空串表示不限
  endDate: string;
  sortBy: string;    // 后端识别值：received_at / sent_at
  sortOrder: 'asc' | 'desc';
}

/** 过滤态默认值。 */
export const DEFAULT_FILTER: AggregateFilterState = {
  keyword: '',
  accountId: 'all',
  readState: 'all',
  attachState: 'all',
  startDate: '',
  endDate: '',
  sortBy: 'received_at',
  sortOrder: 'desc',
};

/** 'yyyy-mm-dd' → 当日 00:00:00.000 本地毫秒；空串返回 undefined。 */
export function dateToStartMs(s: string): number | undefined {
  if (!s) return undefined;
  return new Date(`${s}T00:00:00.000`).getTime();
}

/** 'yyyy-mm-dd' → 当日 23:59:59.999 本地毫秒（含当天）；空串返回 undefined。 */
export function dateToEndMs(s: string): number | undefined {
  if (!s) return undefined;
  return new Date(`${s}T23:59:59.999`).getTime();
}

/** 把 UI 过滤态映射为后端 MessageQuery（仅含需要过滤的维度）。 */
export function toMessageQuery(filter: AggregateFilterState, page: number, size: number): MessageQuery {
  const q: MessageQuery = { page, size, sortBy: filter.sortBy, sortOrder: filter.sortOrder };
  const kw = filter.keyword.trim();
  if (kw) q.keyword = kw;
  if (filter.accountId !== 'all') q.accountId = filter.accountId;
  if (filter.readState === 'read') q.isRead = true;
  else if (filter.readState === 'unread') q.isRead = false;
  if (filter.attachState === 'with') q.hasAttach = true;
  else if (filter.attachState === 'without') q.hasAttach = false;
  const start = dateToStartMs(filter.startDate);
  if (start !== undefined) q.startDate = start;
  const end = dateToEndMs(filter.endDate);
  if (end !== undefined) q.endDate = end;
  return q;
}

/** 默认每页条数。 */
export const DEFAULT_PAGE_SIZE = 20;

/** 允许的每页条数白名单。 */
export const PAGE_SIZES = [10, 20, 50, 100];

/** 从 URL 查询参数解析出过滤态（缺省回退默认值）。 */
export function filterFromParams(sp: URLSearchParams): AggregateFilterState {
  const readState = sp.get('read');
  const attachState = sp.get('attach');
  const accountRaw = sp.get('account');
  const accountId = accountRaw && /^\d+$/.test(accountRaw) ? Number(accountRaw) : 'all';
  const sortBy = sp.get('sort') === 'sent_at' ? 'sent_at' : 'received_at';
  const sortOrder = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  return {
    keyword: sp.get('q') ?? '',
    accountId,
    readState: readState === 'read' || readState === 'unread' ? readState : 'all',
    attachState: attachState === 'with' || attachState === 'without' ? attachState : 'all',
    startDate: sp.get('from') ?? '',
    endDate: sp.get('to') ?? '',
    sortBy,
    sortOrder,
  };
}

/** 从 URL 解析页码（>=1，缺省 1）。 */
export function pageFromParams(sp: URLSearchParams): number {
  const n = parseInt(sp.get('page') ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 从 URL 解析每页条数（白名单内，缺省默认值）。 */
export function sizeFromParams(sp: URLSearchParams): number {
  const n = parseInt(sp.get('size') ?? '', 10);
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * 把过滤态 + 页码 + 每页条数序列化为 URLSearchParams（等于默认值的项不写入，保持 URL 干净）。
 */
export function paramsFromState(
  filter: AggregateFilterState,
  page: number,
  size: number,
): URLSearchParams {
  const sp = new URLSearchParams();
  const kw = filter.keyword.trim();
  if (kw) sp.set('q', kw);
  if (filter.accountId !== 'all') sp.set('account', String(filter.accountId));
  if (filter.readState !== 'all') sp.set('read', filter.readState);
  if (filter.attachState !== 'all') sp.set('attach', filter.attachState);
  if (filter.startDate) sp.set('from', filter.startDate);
  if (filter.endDate) sp.set('to', filter.endDate);
  if (filter.sortBy !== DEFAULT_FILTER.sortBy) sp.set('sort', filter.sortBy);
  if (filter.sortOrder !== DEFAULT_FILTER.sortOrder) sp.set('dir', filter.sortOrder);
  if (page > 1) sp.set('page', String(page));
  if (size !== DEFAULT_PAGE_SIZE) sp.set('size', String(size));
  return sp;
}
