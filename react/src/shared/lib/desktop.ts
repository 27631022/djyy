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
interface PhysPos {
  x: number;
  y: number;
}
interface TauriMonitor {
  position: PhysPos;
  size: { width: number; height: number };
  scaleFactor: number;
}
interface TauriWindowHandle {
  setSize: (size: unknown) => Promise<void>;
  setPosition: (pos: unknown) => Promise<void>;
  outerPosition: () => Promise<PhysPos>;
  center: () => Promise<void>;
  setFocus: () => Promise<void>;
  minimize: () => Promise<void>;
  hide: () => Promise<void>;
  setAlwaysOnBottom: (v: boolean) => Promise<void>;
  setSkipTaskbar: (v: boolean) => Promise<void>;
}
type SizeCtor = new (width: number, height: number) => unknown;
type PosCtor = new (x: number, y: number) => unknown;
interface TauriWindowApi {
  getCurrentWindow?: () => TauriWindowHandle; // v2 名
  getCurrent?: () => TauriWindowHandle; // v1 名(兜底)
  // ⚠ currentMonitor 是 window 模块的**独立函数**(不是 Window 方法),v2 必须模块级调用
  currentMonitor?: () => Promise<TauriMonitor | null>;
  LogicalSize?: SizeCtor; // v1 位置(兜底)
}
interface TauriDpi {
  LogicalSize?: SizeCtor; // v2 位置(@tauri-apps/api/dpi)
  PhysicalPosition?: PosCtor;
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
  const Ctor = tauri()?.dpi?.LogicalSize ?? tauri()?.window?.LogicalSize;
  return Ctor ? new Ctor(width, height) : { type: 'Logical', width, height };
}
/** 构造 PhysicalPosition(物理像素;v2 在 dpi 模块,缺失则兜底对象)。 */
function physicalPosition(x: number, y: number): unknown {
  const Ctor = tauri()?.dpi?.PhysicalPosition;
  return Ctor ? new Ctor(x, y) : { type: 'Physical', x, y };
}

const WIDGET_W = 380;
const WIDGET_H = 680;
const WORKBENCH_W = 1350; // 工作台展开宽度(填报/新建共用);较初版 1080 加宽约 1/4,填报表单更舒展
const WORKBENCH_H = 760;
/** 放大成工作台前的挂件位置(物理像素);收起时还原,避免挂件位移。 */
let savedWidgetPos: PhysPos | null = null;

export async function setClientMode(mode: 'widget' | 'workbench'): Promise<void> {
  const w = tauri()?.window;
  const win = currentWindow();
  if (!win) return;
  try {
    if (mode === 'workbench') {
      // 智能定位:把放大的窗口锚定在挂件「靠屏幕边的角」、朝屏幕中心方向展开,夹在屏幕内 → 不出屏。
      //   挂件在右上 → 以右上为基点向左下开;右下 → 右下为基点向左上开;以此类推。
      let target: PhysPos | null = null;
      try {
        const pos = await win.outerPosition(); // 物理像素(Window 方法)
        const mon = w?.currentMonitor ? await w.currentMonitor() : null; // 模块级函数,非 Window 方法
        savedWidgetPos = pos ? { x: pos.x, y: pos.y } : null;
        if (pos && mon) {
          const s = mon.scaleFactor || 1;
          const wgW = WIDGET_W * s;
          const wgH = WIDGET_H * s;
          const wbW = WORKBENCH_W * s;
          const wbH = WORKBENCH_H * s;
          const { x: mx, y: my } = mon.position;
          const { width: mw, height: mh } = mon.size;
          // 挂件中心在屏幕右半 → 右对齐(向左展开);左半 → 左对齐(向右展开)
          let nx = pos.x + wgW / 2 > mx + mw / 2 ? pos.x + wgW - wbW : pos.x;
          // 下半 → 下对齐(向上展开);上半 → 上对齐(向下展开)
          let ny = pos.y + wgH / 2 > my + mh / 2 ? pos.y + wgH - wbH : pos.y;
          // 夹到显示器范围内,保证完整可见
          nx = Math.max(mx, Math.min(nx, mx + mw - wbW));
          ny = Math.max(my, Math.min(ny, my + mh - wbH));
          target = { x: Math.round(nx), y: Math.round(ny) };
        }
      } catch {
        /* 读位置/显示器失败 → 退回「原地长大」 */
      }
      if (target) await win.setPosition(physicalPosition(target.x, target.y));
      await win.setSize(logicalSize(WORKBENCH_W, WORKBENCH_H));
      await win.setAlwaysOnBottom(false);
      await win.setSkipTaskbar(false);
      await win.setFocus();
    } else {
      await win.setSize(logicalSize(WIDGET_W, WIDGET_H));
      await win.setAlwaysOnBottom(false);
      await win.setSkipTaskbar(false);
      // 收起回挂件 → 还原到放大前的位置(避免位移)
      if (savedWidgetPos) {
        await win.setPosition(physicalPosition(savedWidgetPos.x, savedWidgetPos.y));
        savedWidgetPos = null;
      }
    }
  } catch {
    /* 缩放失败不阻断:填报页仍可在当前窗口尺寸打开 */
  }
}

const WIDGET_POS_KEY = 'djyy_widget_pos_v1';

/** 保存当前窗口位置到 localStorage(挂件模式定时调用)。localStorage 跨更新/重装不丢。 */
export async function saveWidgetPos(): Promise<void> {
  const win = currentWindow();
  if (!win) return;
  try {
    const p = await win.outerPosition();
    if (p) localStorage.setItem(WIDGET_POS_KEY, JSON.stringify({ x: p.x, y: p.y }));
  } catch {
    /* ignore */
  }
}
/** 还原到上次保存的窗口位置(挂件挂载时调用;跨更新/重启复位)。 */
export async function restoreWidgetPos(): Promise<void> {
  const win = currentWindow();
  if (!win) return;
  try {
    const raw = localStorage.getItem(WIDGET_POS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p?.x === 'number' && typeof p?.y === 'number') {
      await win.setPosition(physicalPosition(p.x, p.y));
    }
  } catch {
    /* ignore */
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

/**
 * 回到本地「连接设置」页改服务器地址(仅桌面端)。
 * Windows 上本地页 origin 为 http://tauri.localhost;导航到 ?edit=1 让连接页显示表单并预填上次地址。
 * 与托盘「设置服务器地址」(lib.rs 的 open_config)同一入口。浏览器里 no-op。
 */
export function openServerConfig(): void {
  if (!isDesktop()) return;
  try {
    window.location.href = 'http://tauri.localhost/index.html?edit=1';
  } catch {
    /* ignore */
  }
}
