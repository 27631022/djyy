import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';

// dev 同源访问后端(免 CORS):/api → localhost:3001;生产经同域反代。
export default defineConfig({
  server: {
    host: true,
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
