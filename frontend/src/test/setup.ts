import '@testing-library/jest-dom';

// jsdom 未实现 window.scrollTo，App 视图切换会调用它；提供空实现避免噪声警告。
window.scrollTo = () => {};

// jsdom 未实现 window.matchMedia，ThemeProvider 初始化会读取系统颜色偏好；
// 默认返回不匹配（亮色），各测试可按需覆盖。
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
