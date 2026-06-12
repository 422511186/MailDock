# MailDock 前端 UI 视觉升级设计

> 创建日期：2026-06-12
> 状态：已批准
> 范围：纯视觉升级，不改变任何已实现的功能

## 背景

MailDock 前端功能已完整实现（登录、账号管理、批量操作、导入、邮件查看、个人中心）。本次工作是**纯视觉层升级**，目标是让现有界面对齐 `design-prototypes/` 目录中的现代设计原型，不新增、不删减任何功能。

## 目标与非目标

**目标**
- 统一视觉语言：色彩、圆角、阴影、间距、图标
- 引入图标库与轻量动画，提升交互质感
- 保持所有现有功能行为完全不变
- 保持响应式适配（375px 移动端 / 1024px+ 桌面端）
- 保持可访问性（键盘导航、aria 属性、屏幕阅读器）

**非目标**
- 不改动后端、API、数据模型
- 不引入 react-router（继续使用 `App.tsx` 的 `View` 状态机）
- 不改变业务逻辑、网络请求方式（继续 `credentials: 'include'`）
- 不新增功能

## 架构与升级策略

采用**组件级渐进升级（方案 A）**：每个组件独立升级、独立测试、独立提交。升级期间新旧风格短暂共存，最终全部统一。

升级顺序（按用户体验影响力排序）：

1. 全局配置（Tailwind 动画、图标库依赖）
2. LoginPage（第一印象）
3. AccountsPage（主功能页）
4. MailListPage（次高频）
5. ProfilePage（重要但低频）
6. UserMenu（小组件收尾）

## 技术栈与依赖

**新增依赖**
- `lucide-react`（图标库）

**核心技术（保持不变）**
- React 18 + TypeScript + Vite 6
- Tailwind CSS 3.4.19
- vitest + @testing-library/react

## 设计系统

| 维度 | 取值 |
| --- | --- |
| 主色调 | `emerald-500/600/700`（按钮、链接、高亮） |
| 复选框特例 | `accent-blue-600`（与原型保持一致） |
| 中性色 | `slate-*`（文字、边框、背景） |
| 危险色 | `red-500/600/700` |
| 常规圆角 | `rounded-lg`（8px） |
| 卡片圆角 | `rounded-xl` / `rounded-2xl`（登录卡片） |
| 阴影 | `shadow-sm` / `shadow-md` / `shadow-xl` / `shadow-2xl`（模态框） |
| 常规图标 | `w-5 h-5`（20px） |
| 小图标 | `w-4 h-4`（16px） |

## 全局配置变更

### Tailwind 自定义动画（`tailwind.config.js`）

```js
theme: {
  extend: {
    keyframes: {
      'fade-in': {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      },
      'slide-down': {
        '0%': { transform: 'translateY(-10px)', opacity: '0' },
        '100%': { transform: 'translateY(0)', opacity: '1' },
      },
      'slide-up': {
        '0%': { transform: 'translateY(10px)', opacity: '0' },
        '100%': { transform: 'translateY(0)', opacity: '1' },
      },
    },
    animation: {
      'fade-in': 'fade-in 0.2s ease-out',
      'slide-down': 'slide-down 0.2s ease-out',
      'slide-up': 'slide-up 0.2s ease-out',
    },
  },
}
```

### 安装图标库

```bash
npm install lucide-react
```

## 各组件详细设计

### LoginPage

- 布局：居中卡片 `max-w-md`，背景渐变 `bg-gradient-to-br from-emerald-50 to-slate-50`，卡片 `rounded-2xl shadow-xl`
- Logo：`Mail` 图标 `w-12 h-12 text-emerald-600`，标题 `text-3xl font-bold text-slate-800`
- 输入框：`border-2 border-slate-200 focus:border-emerald-500 rounded-lg h-12`，邮箱 `Mail`、密码 `Lock` 图标（`w-5 h-5 text-slate-400`），`focus:ring-2 focus:ring-emerald-200`
- 登录按钮：`bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-12 transition-colors`，禁用态 `disabled:bg-slate-300 disabled:cursor-not-allowed`
- OAuth 按钮：`border-2 border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50`，`ExternalLink` 图标
- 错误提示：`bg-red-50 border-l-4 border-red-500`，`AlertCircle` 图标，`animate-slide-down`

### AccountsPage（参考 design-prototype.html section-5）

**查询/操作工具栏**（白色卡片容器）：
- 容器：`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-4`
- 搜索框：`relative flex-1 min-w-[240px]`，左侧 `Search` 图标（绝对定位 `absolute left-0 pl-3`），输入框 `rounded-lg border border-slate-200 py-2 pl-10 pr-4 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100`
- 按钮组：`flex gap-2`
  - 批量测活：`border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50`，`CheckCircle` 图标
  - 批量删除：`border border-rose-200 bg-rose-50 px-4 py-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50`，`Trash2` 图标
  - 添加账号：`bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700`，`Plus` 图标
- 已选中提示条（有选中时显示）：`mt-3 rounded-lg bg-emerald-50 px-4 py-2`，左侧 `CheckCircle` 图标 + "已选中 X 个账号"，右侧"取消选择"按钮

**表格**（白色卡片容器）：
- 容器：`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`
- 表头：`border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white`，列标题 `text-xs font-semibold uppercase tracking-wide text-slate-500`
- 复选框：表头/已选中用 `text-emerald-600`，未选中用 `text-blue-600`
- 邮箱列：头像圆形 `h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md`（首字母居中），邮箱地址 `font-medium text-slate-800`
- 状态徽章：`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium`
  - 正常：`bg-emerald-100 text-emerald-700`，圆点 `h-1.5 w-1.5 rounded-full bg-emerald-500`
  - 待测试：`bg-amber-100 text-amber-700`，圆点 `bg-amber-500`
  - 异常：`bg-rose-100 text-rose-700`，圆点 `bg-rose-500`
- 选中行：`bg-emerald-50/50 hover:bg-emerald-50`
- 未选中行：`hover:bg-emerald-50/50`
- 操作列：三点菜单 `MoreVertical` 图标（`text-slate-400 hover:text-slate-600`）

**模态框**（保持现有）：
- 遮罩：`bg-black/50 animate-fade-in`
- 卡片：`bg-white rounded-xl shadow-2xl animate-slide-up max-w-md`
- 标题：`PlusCircle`/`Upload` 图标
- 关闭：`X` + `hover:bg-slate-100 rounded-full`

### MailListPage

- 顶部栏：返回 `ArrowLeft` + `hover:bg-slate-100 rounded-lg`，刷新 `RefreshCw` + `bg-emerald-600`，账号信息 `Mail`
- 列表项：未读 `bg-emerald-50 border-l-4 border-emerald-500 font-semibold`，已读 `bg-white hover:bg-slate-50`，附件 `Paperclip`
- 详情模态框：标题 `Mail`，附件 `Paperclip` + `Download`，下载按钮 `text-emerald-600`

### ProfilePage

- 布局：`max-w-2xl mx-auto`，卡片 `bg-white rounded-xl shadow-md`
- 头像：占位 `User` `w-24 h-24 text-slate-400`，`bg-slate-100 rounded-full`，邮箱 `Mail`
- 编辑表单：`User`（显示名称）/`Lock`（密码）图标，保存 `bg-emerald-600` + `Save`，取消 `border-2 border-slate-300`
- OAuth 信息卡片：`bg-blue-50 border-l-4 border-blue-500`，`Info` 图标

### UserMenu

- 头像按钮：`bg-slate-100 hover:bg-slate-200 rounded-full w-10 h-10`，占位 `User w-6 h-6 text-slate-600`
- 下拉菜单：`bg-white rounded-lg shadow-xl border border-slate-200 animate-slide-down`，定位 `absolute top-14 right-4`
- 菜单项：个人中心 `UserCircle` + `hover:bg-slate-50`，退出 `LogOut` + `hover:bg-red-50 text-red-600`，分隔线 `border-t border-slate-100`

## 测试策略

遵循强制 TDD 约束：

- 每个组件升级前，先为现有功能补齐快照/行为测试（如缺失）
- 升级后运行测试，确保功能行为不变
- 视觉变更本身不新增测试逻辑，但需验证：交互事件正常触发、条件渲染正确、可访问性属性（aria-label、role）保留

测试覆盖文件：
- `LoginPage.test.tsx`：表单提交、OAuth 跳转
- `AccountsPage.test.tsx`：搜索、筛选、批量操作、模态框
- `MailListPage.test.tsx`：列表渲染、刷新、详情弹窗
- `ProfilePage.test.tsx`：显示名称更新、密码修改
- `UserMenu.test.tsx`：菜单展开/收起、跳转

## 实施检查点

每个组件完成标准：

1. 视觉符合设计原型
2. 所有测试通过
3. 响应式适配（375px / 1024px+）
4. 可访问性保留（键盘导航、屏幕阅读器）
5. Git commit（格式：`refactor(frontend): upgrade <ComponentName> UI`）
