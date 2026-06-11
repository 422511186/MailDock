import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest 测试配置：独立于 vite.config.ts，避免 test 字段污染生产构建的类型检查。
// vitest 运行时优先读取本文件。
export default defineConfig({
  plugins: [react()],
  test: {
    // 使用 jsdom 模拟浏览器环境，启用全局测试 API
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
