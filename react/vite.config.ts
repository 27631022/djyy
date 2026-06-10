import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import checker from "vite-plugin-checker";

// https://vite.dev/config/
//
// 已移除 unplugin-auto-import:
//   过去配置它自动注入 react / lucide-react 的 import,看似省事,实际带来:
//     1. transform 链中与显式 import 命名冲突时会静默失败(Vite 返回空模块,浏览器报 "no default export")
//     2. dts 类型注入跟实际 TS 解析时有时序问题
//   IDE(VS Code / WebStorm)早就能 auto-import,真正的好处微乎其微,代价是脆弱。
//
// vite-plugin-checker 现在同时跑 typescript + eslint,
// 任何未使用 / 隐式 any / 漏 await 等问题都会在 dev overlay 直接报。
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    checker({
      typescript: {
        tsconfigPath: "tsconfig.app.json",
      },
      eslint: {
        useFlatConfig: true,
        lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
      },
      enableBuild: true,
      // 关闭浏览器里全屏黑色 overlay —— 实际开发时太挡视野
      //   错误依然会在:
      //     1. 启动 vite 的那个终端窗口里打印
      //     2. IDE(VS Code/WebStorm)的 Problems 面板
      //     3. git commit 时被 husky hook 拦截
      //   有这三道防线就够了,不需要浏览器里再弹窗
      overlay: false,
      // 同时关闭终端里 vite-plugin-checker 自己的特效输出(只用原生 tsc/eslint 的简洁输出)
      terminal: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // 监听所有网络接口,允许局域网内其他设备通过 IP 访问
    // 在开发机控制台启动后,Vite 会打印 Network: http://<lan-ip>:5173/
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      // 3D 展厅(exhibition-client 构建产物,由后端 3001 托管在 /exhibition/)
      // 经此代理后,用户从前台 5173 直接开 /exhibition/ 即可,符合「页面都走 5173」直觉
      "/exhibition": { target: "http://localhost:3001", changeOrigin: true },
      // 展厅页内的接口走相对路径 /api(react 自身用绝对地址推断,不受影响)
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
