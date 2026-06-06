/**
 * 桌面客户端(Tauri 瘦壳)集成 —— 仅在运行于 Tauri 里时生效,普通浏览器中全部 no-op。
 *
 * 用 Tauri 的 `withGlobalTauri`(已在 desktop/src-tauri/tauri.conf.json 开启)暴露的
 * `window.__TAURI__`,不给 web 端引入任何 `@tauri-apps/*` npm 依赖(瘦壳:web 改动零重打包)。
 * 通知权限由 capability 的 remote 白名单授予本局域网地址。
 */

interface TauriNotification {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
  sendNotification: (o: { title: string; body?: string } | string) => void;
}
interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}
interface TauriOpener {
  openUrl: (url: string) => Promise<void>;
}
/** @tauri-apps/api 的 window 模块(withGlobalTauri 暴露)。只声明用到的方法。 */
interface TauriWindowHandle {
  setSize: (size: unknown) => Promise<void>;
  center: () => Promise<void>;
  setFocus: () => Promise<void>;
  minimize: () => Promise<void>;
  hide: () => Promise<void>;
  setAlwaysOnBottom: (v: boolean) => Promise<void>;
  setSkipTaskbar: (v: boolean) => Promise<void>;
}
type SizeCtor = new (width: number, height: number) => unknown;
interface TauriWindowApi {
  getCurrentWindow?: () => TauriWindowHandle; // v2 名
  getCurrent?: () => TauriWindowHandle; // v1 名(兜底)
  LogicalSize?: SizeCtor; // v1 位置(兜底)
}
interface TauriDpi {
  LogicalSize?: SizeCtor; // v2 位置(@tauri-apps/api/dpi)
}
interface TauriGlobal {
  notification?: TauriNotification;
  core?: TauriCore;
  opener?: TauriOpener;
  window?: TauriWindowApi;
  dpi?: TauriDpi;
  app?: { getVersion: () => Promise<string> };
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** 是否运行在桌面客户端(Tauri 瘦壳)里。浏览器中为 false。 */
export function isDesktop(): boolean {
  return !!tauri();
}

/** 当前客户端版本号(如 "0.2.0");浏览器里返回 null。 */
export async function getAppVersion(): Promise<string | null> {
  const app = tauri()?.app;
  if (!app) return null;
  try {
    return await app.getVersion();
  } catch {
    return null;
  }
}

let permissionAsked = false;

/** 发一条原生桌面通知(仅桌面端;无权限时先申请一次)。失败静默,不影响主流程。 */
export async function desktopNotify(title: string, body?: string): Promise<void> {
  const n = tauri()?.notification;
  if (!n) return;
  try {
    let granted = await n.isPermissionGranted();
    if (!granted && !permissionAsked) {
      permissionAsked = true;
      granted = (await n.requestPermission()) === 'granted';
    }
    if (granted) n.sendNotification({ title, body });
  } catch {
    /* 通知失败不影响主流程 */
  }
}

/**
 * 锁定/解锁桌面挂件 —— 锁定时窗体沉入桌面层(always_on_bottom + 不显示任务栏),融入壁纸。
 * 经 Rust 命令 `set_widget_locked`(在 desktop/src-tauri/src/lib.rs)生效;浏览器里 no-op。
 */
/**
 * 锁定/解锁桌面挂件。锁定 → 沉入桌面层 + 任务栏隐藏(固定不可移);解锁 → 恢复浮动可移动。
 * 远程挂件页:**自定义命令被 ACL 拦**,改经 core IPC 直调 window 插件命令(窗口标签固定 "main",
 * 权限 core:window:allow-* 已在 capability 授予远程)。浏览器 no-op;失败**抛出**供调用方提示定位。
 */
export async function setWidgetLocked(locked: boolean): Promise<void> {
  const core = tauri()?.core;
  if (!core) return;
  await core.invoke('plugin:window|set_always_on_bottom', { label: 'main', value: locked });
  await core.invoke('plugin:window|set_skip_taskbar', { label: 'main', value: locked });
}

/** 开始拖动无边框窗口(挂件解锁态顶栏按下时调用),经 core IPC 调 window 插件命令。浏览器 no-op。 */
export async function startWidgetDrag(): Promise<void> {
  const core = tauri()?.core;
  if (!core) return;
  try {
    await core.invoke('plugin:window|start_dragging', { label: 'main' });
  } catch {
    /* 拖动失败忽略 */
  }
}

/**
 * 切换客户端窗口形态(单窗双形态):
 *   'widget'    → 挂件尺寸(380×680),可继续锁定沉底;
 *   'workbench' → 工作台尺寸(展开领/填任务、办事),居中 + 显示任务栏 + 聚焦。
 * 走 @tauri-apps/api 的 window API(LogicalSize 由其构造,避免手拼 IPC),
 * 权限 core:window:allow-set-size/center/set-focus 已在 capability 授予远程页;浏览器里 no-op。
 */
/** 取当前窗口句柄(兼容 v2 getCurrentWindow / v1 getCurrent)。 */
function currentWindow(): TauriWindowHandle | null {
  const w = tauri()?.window;
  const get = w?.getCurrentWindow ?? w?.getCurrent;
  return get ? get() : null;
}
/** 构造 LogicalSize(v2 在 dpi 模块 / v1 在 window 模块;都没有则给结构相同的兜底对象)。 */
function logicalSize(width: number, height: number): unknown {
  const g = tauri();
  const Ctor = g?.dpi?.LogicalSize ?? g?.window?.LogicalSize;
  return Ctor ? new Ctor(width, height) : { type: 'Logical', width, height };
}

export async function setClientMode(mode: 'widget' | 'workbench'): Promise<void> {
  const win = currentWindow();
  if (!win) return;
  try {
    if (mode === 'workbench') {
      // 注意:不调 center() —— 从挂件当前左上角原地长大,收起时再缩回同一左上角,挂件不位移。
      await win.setSize(logicalSize(1080, 760));
      await win.setAlwaysOnBottom(false);
      await win.setSkipTaskbar(false);
      await win.setFocus();
    } else {
      await win.setSize(logicalSize(380, 680));
      await win.setAlwaysOnBottom(false);
      await win.setSkipTaskbar(false);
    }
  } catch {
    /* 缩放失败不阻断:填报页仍可在当前窗口尺寸打开 */
  }
}

/** 最小化客户端窗口(无边框窗自带控件用)。浏览器 no-op。 */
export async function minimizeWindow(): Promise<void> {
  const win = currentWindow();
  if (win) {
    try {
      await win.minimize();
    } catch {
      /* ignore */
    }
  }
}

/** 关闭窗口 = 隐藏到托盘(壳的 CloseRequested 同样是 hide,保持后台轮询)。浏览器 no-op。 */
export async function hideWindow(): Promise<void> {
  const win = currentWindow();
  if (win) {
    try {
      await win.hide();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 在外部打开 URL —— 桌面端用系统默认浏览器(`tauri-plugin-opener`),普通浏览器里开新标签页。
 * 用于从挂件跳「完整版」后台页,而不替换掉挂件本身。
 */
export function openExternal(url: string): void {
  const opener = tauri()?.opener;
  if (opener) {
    void runOpener(opener, url);
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
  }
}

async function runOpener(opener: TauriOpener, url: string): Promise<void> {
  try {
    await opener.openUrl(url);
  } catch {
    /* 打开失败忽略,不影响页面 */
  }
}
