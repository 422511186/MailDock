/**
 * 邮箱中间省略：保留开头 8 字符 + "..." + "@" 后的域名。
 * 示例：iog9k1hbmg2q141ftn9zyy9pxn7lzb0p7tb7dakdeagzue8y4@privaterelay.linux.do
 *      → iog9k1hb...privaterelay.linux.do
 */
export function truncateEmail(email: string, headLength = 8): string {
  if (!email || email.length <= headLength + 15) return email;
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  const head = email.slice(0, headLength);
  const domain = email.slice(atIndex + 1);
  return `${head}...${domain}`;
}
