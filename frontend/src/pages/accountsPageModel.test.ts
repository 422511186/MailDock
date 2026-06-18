import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../api/client';
import {
  DEFAULT_PAGE_SIZE,
  countAccountLines,
  emailToAvatarGradient,
  formatRelativeTime,
  runBatchRefresh,
  statusDot,
  statusOf,
} from './accountsPageModel';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    email: 'alice@163.com',
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

describe('accountsPageModel', () => {
  it('keeps account pagination default aligned with the page', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it('derives account status from the latest connection test fields', () => {
    expect(statusOf(account({ lastTestAt: 0, lastTestOk: false }))).toMatchObject({ label: '待检测' });
    expect(statusOf(account({ lastTestAt: 1700000000000, lastTestOk: true }))).toMatchObject({ label: '正常' });
    expect(statusOf(account({ lastTestAt: 1700000000000, lastTestOk: false }))).toMatchObject({ label: '异常' });
  });

  it('maps status labels to stable dot colors', () => {
    expect(statusDot('正常')).toBe('bg-emerald-500');
    expect(statusDot('异常')).toBe('bg-rose-500');
    expect(statusDot('待检测')).toBe('bg-amber-500');
  });

  it('assigns a stable avatar gradient from email text', () => {
    expect(emailToAvatarGradient('alice@163.com')).toBe(emailToAvatarGradient('alice@163.com'));
    expect(emailToAvatarGradient('alice@163.com')).toMatch(/^from-.+ to-.+$/);
  });

  it('formats synchronization timestamps as relative display text', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00+08:00'));

    expect(formatRelativeTime(0)).toBe('从未同步');
    expect(formatRelativeTime(Date.now() - 30 * 1000)).toBe('刚刚');
    expect(formatRelativeTime(Date.now() - 2 * 60 * 1000)).toBe('2 分钟前');
    expect(formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000)).toBe('3 小时前');
    expect(formatRelativeTime(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe('2 天前');

    vi.useRealTimers();
  });

  it('counts import account lines while ignoring blanks and comments', () => {
    const text = `
      # comment
      alice@163.com----code

      bob@163.com----code
        # another comment
    `;

    expect(countAccountLines(text)).toBe(2);
  });
});

describe('runBatchRefresh', () => {
  it('refreshes each id once in the same order as input', async () => {
    const calls: number[] = [];
    const refresh = vi.fn(async (id: number) => {
      calls.push(id);
      return { newCount: 0 };
    });

    await runBatchRefresh(refresh, [3, 1, 2]);

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([3, 1, 2]);
  });

  it('reports incrementing progress after each id completes', async () => {
    const refresh = vi.fn(async () => ({ newCount: 0 }));
    const progress: Array<[number, number]> = [];

    await runBatchRefresh(refresh, [10, 20, 30], (done, total) => {
      progress.push([done, total]);
    });

    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('summarizes success count and sums new mail totals', async () => {
    const refresh = vi.fn(async (id: number) => ({ newCount: id }));

    const summary = await runBatchRefresh(refresh, [2, 3, 5]);

    expect(summary).toEqual({
      successCount: 3,
      failCount: 0,
      newTotal: 10,
      failures: [],
    });
  });

  it('counts failures without aborting the remaining ids', async () => {
    const calls: number[] = [];
    const refresh = vi.fn(async (id: number) => {
      calls.push(id);
      if (id === 2) throw new Error('boom');
      return { newCount: 1 };
    });

    const summary = await runBatchRefresh(refresh, [1, 2, 3]);

    expect(calls).toEqual([1, 2, 3]);
    expect(summary).toEqual({
      successCount: 2,
      failCount: 1,
      newTotal: 2,
      failures: [{ id: 2, message: 'boom' }],
    });
  });

  it('runs serially, awaiting each id before starting the next', async () => {
    let active = 0;
    let maxActive = 0;
    const refresh = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { newCount: 0 };
    });

    await runBatchRefresh(refresh, [1, 2, 3]);

    expect(maxActive).toBe(1);
  });
});
