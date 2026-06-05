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
interface TauriGlobal {
  notification?: TauriNotification;
  core?: TauriCore;
  opener?: TauriOpener;
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** 是否运行在桌面客户端(Tauri 瘦壳)里。浏览器中为 false。 */
export function isDesktop(): boolean {
  return !!tauri();
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
export async function setWidgetLocked(locked: boolean): Promise<void> {
  const core = tauri()?.core;
  if (!core) return;
  try {
    await core.invoke('set_widget_locked', { locked });
  } catch {
    /* 桌面命令失败不影响页面交互 */
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
