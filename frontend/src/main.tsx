import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { api } from './api/client';
import './styles.css';

// 应用入口：挂载根组件，注入全局共享的 API 客户端
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('未找到挂载节点 #root');
}

createRoot(rootEl).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
