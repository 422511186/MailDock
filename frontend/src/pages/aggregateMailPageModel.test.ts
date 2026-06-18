import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTER,
  dateToStartMs,
  dateToEndMs,
  toMessageQuery,
  type AggregateFilterState,
} from './aggregateMailPageModel';

describe('DEFAULT_FILTER', () => {
  it('提供 UI 友好的默认过滤态', () => {
    expect(DEFAULT_FILTER.keyword).toBe('');
    expect(DEFAULT_FILTER.accountId).toBe('all');
    expect(DEFAULT_FILTER.readState).toBe('all');
    expect(DEFAULT_FILTER.attachState).toBe('all');
    expect(DEFAULT_FILTER.startDate).toBe('');
    expect(DEFAULT_FILTER.endDate).toBe('');
    expect(DEFAULT_FILTER.sortBy).toBe('received_at');
    expect(DEFAULT_FILTER.sortOrder).toBe('desc');
  });
});

describe('dateToStartMs / dateToEndMs', () => {
  it('空串返回 undefined', () => {
    expect(dateToStartMs('')).toBeUndefined();
    expect(dateToEndMs('')).toBeUndefined();
  });

  it('按本地时区映射当日起止毫秒', () => {
    // 用与实现相同的本地时间构造方式计算期望值，保证时区无关。
    expect(dateToStartMs('2026-06-01')).toBe(new Date('2026-06-01T00:00:00.000').getTime());
    expect(dateToEndMs('2026-06-01')).toBe(new Date('2026-06-01T23:59:59.999').getTime());
  });
});

describe('toMessageQuery', () => {
  function filter(overrides: Partial<AggregateFilterState> = {}): AggregateFilterState {
    return { ...DEFAULT_FILTER, ...overrides };
  }

  it('透传分页与排序', () => {
    const q = toMessageQuery(filter({ sortBy: 'sent_at', sortOrder: 'asc' }), 3, 50);
    expect(q.page).toBe(3);
    expect(q.size).toBe(50);
    expect(q.sortBy).toBe('sent_at');
    expect(q.sortOrder).toBe('asc');
  });

  it('readState 映射 isRead', () => {
    expect(toMessageQuery(filter({ readState: 'read' }), 1, 20).isRead).toBe(true);
    expect(toMessageQuery(filter({ readState: 'unread' }), 1, 20).isRead).toBe(false);
    expect('isRead' in toMessageQuery(filter({ readState: 'all' }), 1, 20)).toBe(false);
  });

  it('attachState 映射 hasAttach', () => {
    expect(toMessageQuery(filter({ attachState: 'with' }), 1, 20).hasAttach).toBe(true);
    expect(toMessageQuery(filter({ attachState: 'without' }), 1, 20).hasAttach).toBe(false);
    expect('hasAttach' in toMessageQuery(filter({ attachState: 'all' }), 1, 20)).toBe(false);
  });

  it('accountId 映射', () => {
    expect('accountId' in toMessageQuery(filter({ accountId: 'all' }), 1, 20)).toBe(false);
    expect(toMessageQuery(filter({ accountId: 42 }), 1, 20).accountId).toBe(42);
  });

  it('日期映射为本地毫秒时间戳，空串不出现', () => {
    const q = toMessageQuery(filter({ startDate: '2026-06-01', endDate: '2026-06-01' }), 1, 20);
    expect(q.startDate).toBe(new Date('2026-06-01T00:00:00.000').getTime());
    expect(q.endDate).toBe(new Date('2026-06-01T23:59:59.999').getTime());

    const empty = toMessageQuery(filter({ startDate: '', endDate: '' }), 1, 20);
    expect('startDate' in empty).toBe(false);
    expect('endDate' in empty).toBe(false);
  });

  it('keyword 去空白透传，空白返回 undefined', () => {
    expect(toMessageQuery(filter({ keyword: '  hello  ' }), 1, 20).keyword).toBe('hello');
    expect('keyword' in toMessageQuery(filter({ keyword: '   ' }), 1, 20)).toBe(false);
    expect('keyword' in toMessageQuery(filter({ keyword: '' }), 1, 20)).toBe(false);
  });
});
