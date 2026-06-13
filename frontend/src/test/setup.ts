import '@testing-library/jest-dom';

// jsdom 未实现 window.scrollTo，App 视图切换会调用它；提供空实现避免噪声警告。
window.scrollTo = () => {};
