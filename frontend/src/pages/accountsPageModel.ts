import type { Account, ApiClient } from '../api/client';

/** 账号管理页属性。 */
export interface AccountsPageProps {
  /** API 客户端。 */
  api: ApiClient;
}

/** 默认每页条数。 */
export const DEFAULT_PAGE_SIZE = 20;

/** 头像渐变色板：按邮箱 hash 取色，保证同一邮箱稳定同色。 */
export const AVATAR_GRADIENTS = [
  'from-emerald-500 to-emerald-600',
  'from-purple-500 to-purple-600',
  'from-rose-500 to-rose-600',
  'from-blue-500 to-blue-600',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-600',
];

export function emailToAvatarGradient(email: string): string {
  const hash = email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/** 账号三态：待检测 / 正常 / 异常，从 lastTestAt + lastTestOk 派生。 */
export function statusOf(a: Account): { label: string; cls: string } {
  if (!a.lastTestAt) {
    return { label: '待检测', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' };
  }
  if (a.lastTestOk) {
    return { label: '正常', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' };
  }
  return { label: '异常', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' };
}

/** 状态徽章圆点颜色。 */
export function statusDot(label: string): string {
  if (label === '正常') return 'bg-emerald-500';
  if (label === '异常') return 'bg-rose-500';
  return 'bg-amber-500';
}

/** 将毫秒时间戳转为相对时间字符串（如"2 分钟前"）。 */
export function formatRelativeTime(ts: number): string {
  if (!ts) return '从未同步';
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' });
}

/** 统计文本中的账号行数（忽略空行与 # 注释行）。 */
export function countAccountLines(text: string): number {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')).length;
}

/** 批量收信单项失败记录。 */
export interface BatchRefreshFailure {
  id: number;
  message: string;
}

/** 批量收信汇总。 */
export interface BatchRefreshSummary {
  successCount: number;
  failCount: number;
  newTotal: number;
  failures: BatchRefreshFailure[];
}

/**
 * 串行对一组账号触发收信。逐个 await，单个失败不中断其余；
 * 每完成一个调用 onProgress 上报进度。纯逻辑，便于单测与两页共用。
 */
export async function runBatchRefresh(
  refresh: (id: number) => Promise<{ newCount: number }>,
  ids: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<BatchRefreshSummary> {
  const summary: BatchRefreshSummary = { successCount: 0, failCount: 0, newTotal: 0, failures: [] };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const res = await refresh(id);
      summary.successCount += 1;
      summary.newTotal += res.newCount ?? 0;
    } catch (e) {
      summary.failCount += 1;
      summary.failures.push({ id, message: (e as Error).message });
    }
    onProgress?.(i + 1, ids.length);
  }
  return summary;
}
