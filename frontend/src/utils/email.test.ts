import { describe, it, expect } from 'vitest';
import { truncateEmail } from './email';

describe('truncateEmail', () => {
  it('should not truncate short emails (≤ 23 chars)', () => {
    expect(truncateEmail('alice@163.com')).toBe('alice@163.com');
    expect(truncateEmail('bob@example.com')).toBe('bob@example.com');
  });

  it('should truncate long emails with default headLength (8)', () => {
    expect(truncateEmail('iog9k1hbmg2q141ftn9zyy9pxn7lzb0p7tb7dakdeagzue8y4@privaterelay.linux.do'))
      .toBe('iog9k1hb...privaterelay.linux.do');
  });

  it('should truncate long emails with custom headLength', () => {
    expect(truncateEmail('verylongemail@example.com', 4))
      .toBe('very...example.com');
  });

  it('should handle empty string', () => {
    expect(truncateEmail('')).toBe('');
  });

  it('should handle email without @ symbol', () => {
    expect(truncateEmail('notanemail')).toBe('notanemail');
  });

  it('should handle boundary length (exactly 23 chars)', () => {
    // 8 chars head + 15 chars = 23 total
    expect(truncateEmail('12345678@12345.com')).toBe('12345678@12345.com');
  });
});
