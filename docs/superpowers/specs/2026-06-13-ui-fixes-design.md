# MailDock 前端视觉修复设计文档

> 创建日期：2026-06-13  
> 状态：待审批  
> 范围：修复顶栏下拉、收件箱桌面端、个人中心、账号列表移动端的视觉问题

## 背景

用户反馈前端四个区域与原型不符，需要修复：

1. **UserMenu 下拉菜单**：长邮箱未省略、菜单项背景色不对
2. **MailListPage 收件箱桌面端**：标题栏布局错误、收信缺少弹窗提示
3. **ProfilePage 个人中心**：邮箱过长未省略
4. **AccountsPage 移动端**：工具栏和复选框未完成（遗留任务）

## 目标与非目标

**目标**
- 修复四个页面/组件的视觉问题
- 实现邮箱中间省略（保留开头 + `...` + 域名）+ 悬浮展示
- 实现收信成功 Toast 弹窗（对照原型 section-11）
- 完成 AccountsPage 移动端遗留任务
- 保持所有现有功能不变
- 保持所有测试通过（或调整断言）

**非目标**
- 不改变业务逻辑、API、后端
- 不新增功能
- 不影响桌面端已完成的部分

## 设计方案

### 1. 邮箱中间省略工具函数

新增 `truncateEmail` 工具函数，用于长邮箱中间省略：

```typescript
/**
 * 邮箱中间省略：保留开头 8 字符 + "..." + "@" 后的域名。
 * 示例：iog9k1hbmg2q141ftn9zyy9pxn7lzb0p7tb7dakdeagzue8y4@privaterelay.linux.do
 *      → iog9k1hb...privaterelay.linux.do
 */
function truncateEmail(email: string, headLength = 8): string {
  if (!email || email.length <= headLength + 15) return email;
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  const head = email.slice(0, headLength);
  const domain = email.slice(atIndex + 1);
  return `${head}...${domain}`;
}
```

### 2. UserMenu 修复

**邮箱省略：**
```tsx
<div className="truncate text-xs text-slate-500" title={user.primaryEmail}>
  {truncateEmail(user.primaryEmail || '', 8)}
</div>
```

**菜单项样式：** 对照原型确认无多余背景色

### 3. MailListPage 收件箱桌面端修复

**标题栏布局：**
```tsx
<div className="flex items-center justify-between">
  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
    <Mail className="h-5 w-5 text-emerald-600" />
    alice@163.com
  </h2>
  <div className="flex items-center gap-2">
    <button>收取邮件</button>
    <button>返回</button>
  </div>
</div>
```

**Toast 弹窗结构：**
```typescript
const toast = document.createElement('div');
toast.className = 'flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-lg shadow-emerald-100/50 animate-slide-in-right fixed right-4 top-20 z-40 max-w-sm';
toast.innerHTML = `
  <div class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
    <svg>...</svg>
  </div>
  <div class="flex-1">
    <div class="font-medium text-emerald-800">操作成功</div>
    <div class="mt-0.5 text-sm text-emerald-700">新增 ${res.newCount} 封邮件</div>
  </div>
`;
```

### 4. ProfilePage 个人中心修复

```tsx
<dd className="text-slate-700" title={user.primaryEmail ?? ''}>
  {truncateEmail(user.primaryEmail ?? '—', 8)}
</dd>
```

### 5. AccountsPage 移动端完成

**移动端工具栏：**
- 搜索行 → 下拉行（状态+排序，flex-1）→ 操作按钮行（测活/删除/导入，flex-1）→ 添加按钮（整行）

**移动端复选框：**
- 卡片左侧添加 20px 方形复选框（`borderRadius: 4px`），点击只勾选不触发 onOpenAccount

## 测试策略

- 邮箱省略：显示 `xxx...domain`，title 完整
- 标题栏：左侧邮箱图标，右侧按钮顺序
- Toast：结构完整（圆形图标+标题+描述）
- 移动端：工具栏文字显示，复选框可勾选

## 实施顺序（TDD）

1. Task 1: 邮箱省略工具函数
2. Task 2: UserMenu 修复
3. Task 3: MailListPage 标题栏
4. Task 4: MailListPage Toast
5. Task 5: ProfilePage 邮箱省略
6. Task 6: AccountsPage 移动端工具栏
7. Task 7: AccountsPage 移动端复选框
8. Task 8: 全量测试
