import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：开发时把 /api 代理到后端 8080，生产构建产物由后端 StaticHandler 托管
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 后端 API 统一前缀 /api，开发期代理到本地 8080，避免跨域
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 构建产物输出到后端可托管的静态目录
    outDir: 'dist',
  },
});
