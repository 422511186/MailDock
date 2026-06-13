# 添加/导入/删除 表单对齐原型设计

日期：2026-06-14

## 背景

账号管理页（`frontend/src/pages/AccountsPage.tsx`）中的弹窗与确认交互与设计原型
（`design-prototypes/design-prototype.html`）不一致。本次对齐以下四处：

1. 电脑端 - 添加表单（原型 §12 `section-12`）
2. 移动端 - 添加表单（原型 §12b `section-12b`）
3. 导入表单（原型 §12c `section-12c`，桌面/移动响应式一致）
4. 删除确认（原型 §12d `section-12d`，替换浏览器 `window.confirm`）

其它已审批通过的不一致不在本次范围内。

## 现状与差异

| 部分 | 原型 | 现状 |
| --- | --- | --- |
| Modal 外壳 | 头部带 `border-b` + `X` 图标；桌面居中、移动端底部滑出 bottom-sheet；底部按钮区带 `border-t` 全宽按钮 | 简单居中卡片，右上角 `✕` 文本，按钮右对齐 |
| 添加表单 | 授权码下方帮助文案；只读 `IMAP 服务器`/`端口` 字段；底部「取消 / 添加账号」全宽按钮 | 无帮助文案、无只读字段，右对齐小按钮 |
| 导入表单 | 虚线拖拽/点击上传区 + 已选文件预览卡片 | 文本粘贴框 + 「上传文件」按钮 + 覆盖复选框 |
| 删除确认 | 样式弹窗（玫红警告图标 + 文案 + 全宽按钮） | 浏览器 `window.confirm()` |

## 决策（已与用户确认）

- **导入表单**：以上传区为主（去掉文本粘贴框），但**保留**「已存在则覆盖授权码」复选框。
- **删除确认**：单个删除与批量删除**都用**新样式弹窗。
- **添加表单只读字段**：照原型加上 `IMAP 服务器 = imap.163.com`、`端口 = 993`，纯展示不参与提交（首期固定）。

## 设计

### 1. 重构 `Modal` 外壳（三弹窗共用）

- 响应式定位：
  - 桌面（`sm` 及以上）：遮罩 `items-center`，卡片 `rounded-2xl` + `animate-slide-up`。
  - 移动端：遮罩 `items-end`，卡片 `rounded-t-3xl` 从底部上滑（`animate-slide-up-mobile`），
    `max-h-[90vh] overflow-y-auto`，头部/底部 `sticky`。
- 头部：`border-b border-slate-100` + 标题 + 右上角关闭按钮，使用 lucide-react 的 `X` 图标
  （替换现有的 `✕` 文本）。
- 新增 CSS 动画 `slide-up-mobile`（`translateY(100%)` → `0`）。在 `sm` 断点用
  `animate-slide-up`，移动端用 `animate-slide-up-mobile`（通过响应式类切换）。
- 点击遮罩关闭、点击卡片阻止冒泡的行为保留。

### 2. 添加账号表单（§12 / §12b）

- 邮箱地址 / 授权码两个输入框保留。
- 授权码输入框下方新增帮助文案：`前往 163 邮箱设置获取 IMAP 授权码`（小字 + info 图标）。
- 新增只读字段（照原型）：
  - `IMAP 服务器`：值 `imap.163.com`，`readonly`，灰底样式。
  - `端口`：值 `993`，`readonly`，灰底样式。
  - 桌面端两列 grid（`grid-cols-2`），移动端堆叠。
  - 纯展示，不参与 `createAccount` 提交（仍只传 email + authCode）。
- 底部按钮区：`border-t` + 「取消」「添加账号」两个 `flex-1` 全宽按钮。
  submit 按钮保持在 `<form>` 内以保证回车/点击提交。

### 3. 导入表单（§12c，响应式一致）

- 去掉文本粘贴 `textarea`。
- 新增虚线拖拽/点击上传区（`border-2 border-dashed`，点击触发隐藏 `<input type=file accept=".txt">`，
  并支持拖拽 `onDrop`）。
- 选择文件后读 `file.text()` 存入内部 `text` 状态，并显示已选文件预览卡片：
  文件名、大小（KB）、账号行数（按非空非注释行计数）、移除按钮（清空选择）。
- **保留**「已存在则覆盖授权码」复选框。
- 提交仍调用现有 `api.importText(text, false, overwrite)`，导入汇总展示保留。
- 底部 `border-t` + 「取消」「开始导入」全宽按钮。

### 4. 删除确认弹窗（§12d，替换 `window.confirm`）

- 新增 `ConfirmDeleteModal` 组件：玫红圆底警告图标 + 文案 + 底部「取消」「确认删除」
  （玫红渐变 `from-rose-500 to-rose-600`）全宽按钮。
- 用 `deleteTarget` 状态驱动：`{ type: 'one'; id: number; email: string } | { type: 'batch'; ids: number[] } | null`。
- 文案：
  - 单个：`确定要删除邮箱账号 <email> 吗？此操作不可撤销。`
  - 批量：`确定要删除选中的 N 个账号吗？此操作不可撤销。`
- `handleDelete` / `handleDeleteBatch` 不再调用 `confirm`，改为设置 `deleteTarget`；
  弹窗「确认删除」回调执行真正的删除并刷新。

## 测试策略（TDD）

遵循项目强制 TDD 流程，先写/改失败测试再实现。

需要修改的现有测试：
- `通过弹窗批量导入文本后展示汇总`：改为通过文件上传（构造 `File` + `fireEvent` 上传），
  断言 `importText` 被调用且展示汇总。
- `确认后删除账号并从列表移除` / `取消确认时不删除账号`：去掉 `window.confirm` spy，
  改为断言新删除确认弹窗出现、点击「确认删除」触发 `deleteAccount`、点击「取消」不触发。

需要新增的测试：
- 添加表单含只读 `IMAP 服务器`/`端口` 字段且值正确。
- 添加表单授权码帮助文案存在。
- 添加表单底部「取消」「添加账号」按钮存在且 `flex-1`。
- Modal 头部含关闭按钮（`aria-label="关闭"`）。
- 导入表单含上传区，选择文件后显示预览卡片（文件名/行数），「覆盖」复选框仍存在。
- 删除确认弹窗：单个显示邮箱、批量显示数量；确认/取消行为正确。

## 非目标

- 不改动后端 API（`importText`、`deleteAccount`、`deleteBatch` 签名不变）。
- 不改动账号列表、工具栏、表格、移动端卡片等已审批部分。
- IMAP 服务器/端口只读展示，不开放编辑。
