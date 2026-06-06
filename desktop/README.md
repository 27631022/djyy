# 党建益友 · 桌面客户端(Tauri v2 瘦壳)

任务分派系统 P5。**桌面任务挂件**:无边框 + 半透明窗口加载服务器的 `/widget` 透明小组件页
(身份 / 任务计数 / 日历待办 / 党建考核排名),常驻系统托盘,可「锁定」沉入桌面融入壁纸,
后台轮询「我的待办」→ 新任务弹**原生桌面通知**。前端改动零重打包。

之所以用 Tauri 而非 PWA:内网 HTTP 无 HTTPS,PWA 的安装/推送会失效;Tauri 不受限,
且托盘后台 + 原生通知正好补上平台缺失的通知机制。

## 形态 / 架构

- **无边框 + 透明挂件窗**:`tauri.conf.json` 主窗口 `decorations:false` + `transparent:true` +
  `shadow:false`(380×680);`react/src/features/task/pages/TaskWidget.tsx` 在桌面端把 html/body 设透明,
  露出壁纸。顶栏 `data-tauri-drag-region` 拖动整窗。
- **运行时自填服务器地址**:窗口默认加载**本地连接页** `src/index.html`,用户填服务器局域网地址
  (只填 IP 自动补 `http://` + 端口 `5173`),存 `localStorage`,连通后跳 `<地址>/widget`;下次自动直连;
  托盘「设置服务器地址」随时改(回 `index.html?edit=1` 预填)。**一个安装包发给任何局域网电脑都能自配**。
  `capabilities/default.json` 的 `remote.urls` 通配 `http://*:5173`,使挂件页 JS 能调 Tauri 通知 + 窗口 API
  (`withGlobalTauri` 暴露 `window.__TAURI__`)。
- **锁定 / 融入桌面**:挂件顶栏🔒按钮调 `setWidgetLocked`(`shared/lib/desktop.ts` → Tauri 窗口 API
  `setAlwaysOnBottom` + `setSkipTaskbar`,需 `capabilities` 里两个 `core:window:allow-*` 权限)→ 沉到桌面层。
  托盘「沉入桌面(挂件)」同效;「打开党建益友」/ 左键托盘 = 取消沉底 + 唤回前台(锁定后被遮挡时的出口)。
- **托盘 + 关闭最小化**:`src-tauri/src/lib.rs`(`TrayIconBuilder` 菜单「打开 / 沉入桌面 / 设置服务器地址 /
  退出」+ 左键唤起;`CloseRequested` → `hide()` 而非销毁,保持后台 webview 继续轮询)。
- **通知**:web 端 `react/src/shared/lib/desktop.ts`(`isDesktop()` / `desktopNotify()`)+
  `react/src/features/task/useDesktopInboxAlerts.ts`(挂在 `AdminLayout`,每 90s 轮询待办)。
  浏览器里全部 no-op(`window.__TAURI__` 不存在)。

## 界面规则(挂件 UI 约束 —— 改挂件前必读)

挂件是**无边框透明小窗**(380×680),内容必须服从这套约束,否则在透明窗上很丑:

1. **绝不出现窗口级原生滚动条**(用户已点名要彻底杜绝)。`TaskWidget` 根容器 `h-screen overflow-hidden`、
   卡片 `flex flex-col overflow-hidden`;头部 / Tab / 计数 / 日历 / 底栏一律 `shrink-0` 固定,
   **只有任务/清单区**用 `flex-1 min-h-0 overflow-y-auto no-scrollbar` 在内部滚动。
   新增任何内容务必放进这个可滚动区,**不要让卡片整体被撑高溢出** —— 一溢出,窗口右侧就冒出原生滚动条。
2. **滚动条隐藏**:可滚动区一律加 `no-scrollbar` 类(定义在 `react/src/index.css`,隐藏滚动条但保留滚轮/触摸滚动)。
3. **默认压缩高度给任务让位**:日历默认「周」视图(最矮),半月 / 整月为可选档位;任务流优先占据剩余高度,
   周视图一次性铺开整周待办。
4. **计数即入口**:待完成 / 已完成 / 累计完成三个计数可点,点开在挂件内直显对应清单(`statView`),不跳浏览器。
5. 顶栏解锁态可 `startWidgetDrag()` 拖动整窗;锁定态(沉入桌面)不可拖动。

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

## 自动更新(一键升级,P5.c)

客户端用官方 **`tauri-plugin-updater`** 做自动更新:托盘**「检查更新」**→ 有新版即**下载→验签→安装→自动重启**,一键完成,不用手动找包/重装。

- **更新地址不写死**:服务器局域网 IP 会变,所以更新地址在运行时由 `src-tauri/src/lib.rs` 的 `check_for_update` 读 webview 当前 URL 的主机(= 用户连的那台服务器)拼成 `http://<host>:3001/api/desktop/latest.json` —— **连哪台、就从哪台更新**。
- **签名**:更新包必须用私钥签名、客户端用内嵌公钥验签(保证没被篡改;**正因有签名,内网 HTTP 也安全**)。
  - 密钥对在 `desktop/.tauri-keys/djyy.key`(私钥,**已 gitignore,绝不入库**)+ `djyy.key.pub`(公钥,已写进 `tauri.conf.json` 的 `plugins.updater.pubkey`)。口令:`djyy2026`。
  - 内网是 http(无 HTTPS),而 updater 默认只收 https,所以 `tauri.conf.json` 的 `plugins.updater.dangerousInsecureTransportProtocol: true` 放行 http 地址 —— 安全由**签名验签**保证,不靠传输层加密。⚠ 缺这一项 app 启动即 panic(updater 拒绝 http 地址)。
  - ⚠ **私钥或口令丢了 = 再也签不出能被老客户端接受的更新包**,只能换新密钥重打包让大家重装一次。务必备份 `.tauri-keys/`。
- **服务端发版口**(后端 `desktop` 模块,公开):
  - `GET /api/desktop/latest.json` —— updater 清单(下载地址动态回指本服务器)
  - `GET /api/desktop/download` —— 最新安装包(流式)
  - 读「分发目录」`DESKTOP_DIST_DIR`(默认 `backend/desktop-dist/`,已 gitignore)。

### 发一个新版本(发版清单)

1. 改版本号:`src-tauri/tauri.conf.json` 的 `version`(+ `src-tauri/Cargo.toml` 的 `version` 保持一致)。
2. **签名打包**(PowerShell):
   ```powershell
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "D:\web\djyy\desktop\.tauri-keys\djyy.key" -Raw)
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "djyy2026"
   cd D:\web\djyy\desktop ; npm run tauri build
   ```
   产物在 `src-tauri/target/release/bundle/nsis/`:`DjyyDesktop_<版本>_x64-setup.exe` + 同名 `.sig`(updater 用 NSIS 包)。
3. 把这两个文件拷进后端分发目录 `backend/desktop-dist/`,并写 `backend/desktop-dist/release.json`:
   ```json
   { "version": "0.3.0", "file": "DjyyDesktop_0.3.0_x64-setup.exe", "notes": "本次更新说明" }
   ```
4. 完事。各客户端托盘「检查更新」即可一键升级。
   - ⚠ **首个带更新器的版本(v0.2.0)要最后手动装一次**(老版 v0.1.0 里没有更新器);从 v0.2.0 起才能自动更新。

## 待打磨(P5 后续)

- 后台轮询目前在 web 端(JS),webview 最小化到托盘后 WebView2 会节流定时器、通知可能延迟;
  要绝对实时可改 **Rust 侧轮询**(需 web 端登录后把 token 经 IPC 传给 Rust)。
- 托盘**角标/未读数**、通知点击直达填报页、自动启动等可后续加。
