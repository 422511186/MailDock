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
