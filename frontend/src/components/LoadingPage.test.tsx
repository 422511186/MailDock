import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingPage } from './LoadingPage';

describe('LoadingPage', () => {
  it('渲染默认标题和副标题', () => {
    render(<LoadingPage />);
    expect(screen.getByText('登录中...')).toBeInTheDocument();
    expect(screen.getByText('正在验证您的身份')).toBeInTheDocument();
  });

  it('渲染自定义标题和副标题', () => {
    render(<LoadingPage title="加载中" subtitle="请稍候" />);
    expect(screen.getByText('加载中')).toBeInTheDocument();
    expect(screen.getByText('请稍候')).toBeInTheDocument();
  });

  it('包含邮件图标和 spinner', () => {
    const { container } = render(<LoadingPage />);
    // 检查有 svg 元素（图标和 spinner）
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('具有无障碍属性', () => {
    const { container } = render(<LoadingPage />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeInTheDocument();
  });
});
