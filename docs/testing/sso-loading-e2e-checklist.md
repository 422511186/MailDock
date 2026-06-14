# SSO 加载页面 E2E 测试清单

## 测试日期
待执行

## 前置条件
- [ ] 后端已启动（`mvn package` + `java -jar target/maildock-backend-fat.jar`）
- [ ] 前端开发服务器已启动（`npm run dev`，端口 5173）
- [ ] 环境变量已配置（`MAILDOCK_SECRET_KEY`、LinuxDO OAuth 配置等）

## 测试场景

### 1. 初次访问（未登录状态）
- [ ] 访问 `http://localhost:5173/`
- [ ] 看到 LoadingPage（"登录中...正在验证您的身份"，呼吸动画）
- [ ] 约 1 秒后自动跳转到 `/login`
- [ ] `/login` 显示 LinuxDO 和邮箱登录两个按钮

### 2. Linux.do OAuth 登录流程
- [ ] 点击"使用 LinuxDO 继续"按钮
- [ ] 浏览器跳转到 Linux.do OAuth 授权页面
- [ ] 授权后跳转回 `/auth/callback`
- [ ] 看到 LoadingPage（"登录中...正在验证您的身份"）
- [ ] 约 1-2 秒后自动跳转到 `/accounts`
- [ ] Header 右上角显示用户菜单（头像/邮箱）

### 3. OAuth 失败场景
- [ ] 模拟 OAuth 失败（可通过暂时关闭后端或修改配置）
- [ ] 在 `/auth/callback` 看到错误页面（红色圆圈 + AlertCircle 图标）
- [ ] 显示错误信息
- [ ] 点击"返回登录"按钮跳转回 `/login`

### 4. 邮箱登录流程
- [ ] 在 `/login` 点击"使用 邮箱或用户名 登录"
- [ ] 表单展开，显示邮箱和密码输入框
- [ ] 输入有效凭证并提交
- [ ] 成功后跳转到 `/accounts`
- [ ] Header 右上角显示用户菜单

### 5. 邮箱登录失败
- [ ] 输入无效凭证
- [ ] 看到错误提示（slide-down 动画）
- [ ] 错误信息显示在表单下方
- [ ] 点击"返回"按钮回到选择界面

### 6. 已登录状态刷新页面
- [ ] 在 `/accounts` 页面刷新（F5）
- [ ] 短暂显示 LoadingPage
- [ ] Session 验证成功后继续显示 `/accounts`
- [ ] 用户状态保持（不需要重新登录）

### 7. 会话过期处理
- [ ] 在后端清除 session 或等待 session 过期
- [ ] 在前端执行任意 API 请求（如刷新账号列表）
- [ ] 收到 401 响应后自动跳转到 `/login`
- [ ] 不显示错误弹窗，静默跳转

### 8. 受保护路由访问
- [ ] 未登录状态直接访问 `/accounts`
- [ ] 看到 LoadingPage 然后跳转到 `/login`
- [ ] 未登录状态直接访问 `/profile`
- [ ] 看到 LoadingPage 然后跳转到 `/login`

### 9. 导航和路由
- [ ] 登录后在 Header 用户菜单点击"个人中心"
- [ ] 跳转到 `/profile`，URL 正确
- [ ] 点击浏览器后退按钮
- [ ] 正确返回 `/accounts`
- [ ] 点击"退出登录"
- [ ] 跳转到 `/login`

### 10. LoadingPage 视觉检查
- [ ] 呼吸动画流畅（emerald 圆圈 pulse 动画）
- [ ] Loader2 图标旋转正常
- [ ] 渐变背景（slate-50 → slate-100）
- [ ] 文字居中、间距合理
- [ ] 移动端显示正常（可用浏览器开发者工具测试）

## 问题记录
（测试时发现的问题记录在此）

## 测试结论
待执行后填写
