import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';

// 端口约定:对外只有 5173(react)/3001(backend)。
// 本工程 build 产物由后端 3001 静态托管在 /exhibition/(见 backend/src/main.ts),
// 与 /api 同源,零 CORS。下面的 dev server(5174)仅本机改代码热更时用,不对外。
export default defineConfig({
  base: '/exhibition/',
  server: {
    host: 'localhost', // 仅本机,对外一律走 3001/exhibition
    port: 5174,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  plugins: [
    checker({
      typescript: true,
      eslint: { lintCommand: 'eslint "./src/**/*.ts"', useFlatConfig: true },
      overlay: false,
    }),
  ],
});
