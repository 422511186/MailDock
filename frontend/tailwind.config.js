/** @type {import('tailwindcss').Config} */
// Tailwind 配置：扫描 index.html 与 src 下所有组件，按需生成原子类。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 品牌主色：青蓝渐变体系，营造现代、清爽的观感
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      keyframes: {
        // 弹窗淡入与上浮
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
