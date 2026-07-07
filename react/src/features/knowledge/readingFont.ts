/**
 * 阅读字号(正文/导读/问答基础字号 px)—— 标题等相对它按 em 缩放,默认「标准 17」。
 * 存 localStorage(按浏览器/设备,不跟账号走);阅读页顶栏与「个人设置 · 阅读偏好」共用同一 key:
 * 阅读页每次进文章都在 useState 初始化器里重读,所以在个人设置改完即对下一次阅读生效。
 */
export const FONT_OPTIONS = [
  { px: 15, label: "小" },
  { px: 17, label: "标准" },
  { px: 19, label: "大" },
  { px: 22, label: "特大" },
];
export const FONT_STORAGE_KEY = "knowledge-font-px";
export const DEFAULT_FONT_PX = 17;

export function initialFontPx(): number {
  const v = Number(localStorage.getItem(FONT_STORAGE_KEY));
  return FONT_OPTIONS.some((o) => o.px === v) ? v : DEFAULT_FONT_PX;
}

export function storeFontPx(px: number) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(px));
  } catch {
    /* 隐私模式写不了忽略 */
  }
}
