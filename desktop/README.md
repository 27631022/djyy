# 党建益友 · 桌面客户端(Tauri v2 瘦壳)

任务分派系统 P5。**瘦壳**:窗口直接加载局域网 web 地址(前端改动零重打包),常驻系统托盘,
关闭=最小化到托盘,后台轮询「我的待办」→ 新任务弹**原生桌面通知**。

之所以用 Tauri 而非 PWA:内网 HTTP 无 HTTPS,PWA 的安装/推送会失效;Tauri 不受限,
且托盘后台 + 原生通知正好补上平台缺失的通知机制。

## 形态 / 架构

- **运行时自填服务器地址**:窗口默认加载**本地连接页** `src/index.html`(非远程 URL),用户在页里
  填党建益友服务的局域网地址(只填 IP 自动补 `http://` + 端口 `5173`),存浏览器 `localStorage`,
  下次自动直连;托盘右键「设置服务器地址」可随时改(导航回 `index.html?edit=1` 预填上次值)。
  **一个安装包发给任何局域网电脑都能自配**,无需为每台改配置重打包。
  `src-tauri/capabilities/default.json` 的 `remote.urls` 用通配 `http://*:5173`,使任意被填入的
  局域网地址其页面 JS 都能调 Tauri 通知 API(`withGlobalTauri` 暴露 `window.__TAURI__`)。
- **托盘 + 关闭最小化**:`src-tauri/src/lib.rs`(`TrayIconBuilder` 菜单「打开/退出」+ 左键唤起;
  `CloseRequested` → `hide()` 而非销毁,保持后台 webview 继续轮询)。
- **通知**:web 端 `react/src/shared/lib/desktop.ts`(`isDesktop()` / `desktopNotify()`)+
  `react/src/features/task/useDesktopInboxAlerts.ts`(挂在 `AdminLayout`,每 90s 轮询待办)。
  浏览器里全部 no-op(`window.__TAURI__` 不存在)。

## 前置(一次性)

- Rust(rustup,`stable-msvc`)+ **VS C++ 生成工具**(MSVC 链接器)
- WebView2 运行时(Win10+ 一般自带)

## 开发 / 打包

```bash
cd desktop
npm install            # 装 @tauri-apps/cli

# 开发:打开窗口加载 web(需先把 web 5173 + 后端 3001 跑起来)
npm run tauri dev

# 打包:出 .msi / .exe 安装包(target/release/bundle/ 下)
npm run tauri build
```

> 未签名内网分发会有 SmartScreen「仍要运行」提示;要去掉需代码签名证书。

## 服务器地址(运行时自填,无需改配置)

客户端**不写死地址**:首次启动弹连接页填服务器 IP,记住后自动直连;托盘右键「设置服务器地址」可改。
所以同一个安装包发到任何局域网电脑都能用 —— 各自填自己能访问到的服务地址即可。

> 默认端口 `5173`(web)。若 web 改了端口,连接页里连端口一起填(如 `10.0.0.5:8080`),
> 并把 `capabilities/default.json` 的 `remote.urls` 通配项加上该端口后重打包。

## 待打磨(P5 后续)

- 后台轮询目前在 web 端(JS),webview 最小化到托盘后 WebView2 会节流定时器、通知可能延迟;
  要绝对实时可改 **Rust 侧轮询**(需 web 端登录后把 token 经 IPC 传给 Rust)。
- 托盘**角标/未读数**、通知点击直达填报页、自动启动等可后续加。
