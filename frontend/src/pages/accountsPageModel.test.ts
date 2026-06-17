import { describe, expect, it, vi } from 'vitest';
import type { Account } from '../api/client';
import {
  DEFAULT_PAGE_SIZE,
  countAccountLines,
  emailToAvatarGradient,
  formatRelativeTime,
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
