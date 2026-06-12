import { describe, it, expect } from 'vitest';
// @ts-expect-error tailwind.config.js 为无类型声明的 JS 模块，运行时由 vitest 解析
import config from '../tailwind.config.js';

/** 主题色守护：确保 brand 调色板已切换为 emerald 绿色系，
 *  防止后续误改回蓝色。色值对齐 Tailwind 内置 emerald。 */
describe('brand 调色板', () => {
  const brand = (config as any).theme.extend.colors.brand as Record<string, string>;

  it('brand-500 为 emerald-500 (#10b981)', () => {
    expect(brand['500'].toLowerCase()).toBe('#10b981');
  });

  it('brand-600 为 emerald-600 (#059669)', () => {
    expect(brand['600'].toLowerCase()).toBe('#059669');
  });

  it('brand-50 为 emerald-50 (#ecfdf5)', () => {
    expect(brand['50'].toLowerCase()).toBe('#ecfdf5');
  });
});
