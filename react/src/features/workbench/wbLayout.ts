import type { ElementType } from "react";
import {
  MegaphoneIcon,
  ShieldCheckIcon,
  LayoutGridIcon,
  ClipboardListIcon,
  SparklesIcon,
  CalendarDaysIcon,
  UserCircle2Icon,
  BarChart3Icon,
  ZapIcon,
} from "lucide-react";

/* ═══ 全卡片工作台 · 网格标准 + 设计标准 ═══
 *
 * 【网格标准】
 *   - 桌面 4 列等宽(响应式:sm 2 列 / 移动 1 列;span 超出列数时由 CSS Grid 自动收窄)。
 *   - 纵向以 ROW_UNIT 为「一个行格」,卡片纵向占 h 个行格,实际高 = h*ROW_UNIT + (h-1)*GRID_GAP。
 *   - 列间/行间统一 GRID_GAP。
 *   - grid-auto-flow: dense —— 自动把后面的小卡回填到前面的空缺里,杜绝「找平留白」。
 *
 * 【设计标准】每个小组件 = 横 w 格 × 纵 h 格,由内容自然占用决定(w∈[1..4],h∈[1..3]):
 *   组件        w×h   依据
 *   通知公告    2×2   3 条公告列表
 *   应用治理    2×1   2 项并排(管理员)
 *   我的应用    4×2   整行 8 个应用磁贴(4 列 × 2 行,正好填满)
 *   智能待办    2×2   3 条待办
 *   猜你喜欢    2×2   3 条带图标推荐
 *   今日安排    2×2   双周迷你日历(7 列需要宽度)
 *   关键指标    2×1   3 个指标一行
 *   快捷入口    2×1   4 个动作一行
 *   个人画像    2×1   4 项画像(2×2 紧排)
 *   智能助手    2×2   说明 + 3 条建议
 *
 * 用户可在「编辑桌面」里用 宽/高 步进按钮微调每张卡的 w、h(夹在 [1..4]×[1..3])。
 */

export type WbCardType =
  | "notice"
  | "governance"
  | "apps"
  | "todo"
  | "recommend"
  | "calendar"
  | "persona"
  | "kpi"
  | "quick"
  | "assistant";

/* ── 网格常量(WbCardFrame / WorkbenchHome 共用) ── */
export const GRID_COLS = 4;
export const ROW_UNIT = 120; // px:一个纵向行格的高
export const GRID_GAP = 14; // px:行/列间距
export const MAX_W = GRID_COLS;
export const MAX_H = 3;

export interface WbCard {
  id: string;
  type: WbCardType;
  w: number; // 横向格子数 [1..MAX_W]
  h: number; // 纵向格子数 [1..MAX_H]
}
export type WbLayout = WbCard[];

export interface CardMeta {
  title: string;
  icon: ElementType;
  w: number; // 默认横向格
  h: number; // 默认纵向格
  admin: boolean;
  desc: string;
}
export const CARD_META: Record<WbCardType, CardMeta> = {
  notice: { title: "通知公告", icon: MegaphoneIcon, w: 2, h: 2, admin: true, desc: "管理员发布,全员可见" },
  governance: { title: "应用治理", icon: ShieldCheckIcon, w: 2, h: 1, admin: true, desc: "权限 / 虚拟组织(管理员)" },
  apps: { title: "我的应用", icon: LayoutGridIcon, w: 4, h: 2, admin: false, desc: "常用业务应用入口" },
  todo: { title: "智能待办", icon: ClipboardListIcon, w: 2, h: 2, admin: false, desc: "跨应用待我处理" },
  recommend: { title: "猜你喜欢", icon: SparklesIcon, w: 2, h: 2, admin: false, desc: "智能推荐" },
  calendar: { title: "今日安排", icon: CalendarDaysIcon, w: 2, h: 2, admin: false, desc: "日历与日程" },
  persona: { title: "个人画像", icon: UserCircle2Icon, w: 2, h: 1, admin: false, desc: "岗位 / 偏好" },
  kpi: { title: "关键指标", icon: BarChart3Icon, w: 2, h: 1, admin: false, desc: "进度 / 业绩" },
  quick: { title: "快捷入口", icon: ZapIcon, w: 2, h: 1, admin: false, desc: "高频动作" },
  assistant: { title: "智能助手", icon: SparklesIcon, w: 2, h: 2, admin: false, desc: "自然语言调应用" },
};

/** 添加目录:个人卡(全员)/ 管理员卡(仅管理员可加) */
export const PERSONAL_CATALOG: WbCardType[] = [
  "apps",
  "todo",
  "recommend",
  "kpi",
  "quick",
  "calendar",
  "persona",
  "assistant",
];
export const ADMIN_CATALOG: WbCardType[] = ["notice", "governance"];

/* ── 尺寸夹取 / 步进 ── */
export function clampW(w: number): number {
  return Math.max(1, Math.min(MAX_W, Math.round(w || 1)));
}
export function clampH(h: number): number {
  return Math.max(1, Math.min(MAX_H, Math.round(h || 1)));
}
export function cycleW(w: number): number {
  return w >= MAX_W ? 1 : w + 1; // 1→2→3→4→1
}
export function cycleH(h: number): number {
  return h >= MAX_H ? 1 : h + 1; // 1→2→3→1
}

export function isAdminCard(type: WbCardType): boolean {
  return CARD_META[type].admin;
}
/** 该卡对当前用户是否锁定:管理员卡 且 非管理员 → 锁定(不可移除/拖动/改尺寸) */
export function isLockedFor(type: WbCardType, viewerIsAdmin: boolean): boolean {
  return CARD_META[type].admin && !viewerIsAdmin;
}

function mkCard(type: WbCardType, id?: string): WbCard {
  const m = CARD_META[type];
  return { id: id ?? type, type, w: m.w, h: m.h };
}
export function newCardId(type: WbCardType): string {
  return `${type}_${Date.now().toString(36)}`;
}

/* ─── 持久化:localStorage v3(w/h 单元格模型)─── */
const LKEY = (uid: string) => `djyy_wb_layout_v3_${uid}`;
const LKEY_V2 = (uid: string) => `djyy_wb_layout_v2_${uid}`; // 旧 size 模型,自动迁移

export function loadPersonalLayout(uid: string): WbLayout | null {
  try {
    const raw = localStorage.getItem(LKEY(uid));
    if (raw) return JSON.parse(raw) as WbLayout;
    // 旧 v2(sm/md/lg size 模型)→ 保留卡集合与顺序,尺寸采用新设计默认
    const v2 = localStorage.getItem(LKEY_V2(uid));
    if (v2) {
      const old = JSON.parse(v2) as { id?: string; type: WbCardType }[];
      return old.filter((c) => c && c.type in CARD_META).map((c) => mkCard(c.type, c.id));
    }
    return null;
  } catch {
    return null;
  }
}
export function savePersonalLayout(uid: string, layout: WbLayout) {
  try {
    localStorage.setItem(LKEY(uid), JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}
export function clearPersonalLayout(uid: string) {
  try {
    localStorage.removeItem(LKEY(uid));
    localStorage.removeItem(LKEY_V2(uid));
  } catch {
    /* ignore */
  }
}

/** 角色模板(千人千面骨架):默认含管理员锁定卡 + 个人默认卡。将来按 roleCodes 分支或后台配。 */
export function roleTemplate(_roleCodes: string[]): WbLayout {
  const order: WbCardType[] = [
    "notice",
    "apps",
    "todo",
    "recommend",
    "kpi",
    "quick",
    "calendar",
    "persona",
    "governance",
  ];
  return order.map((t) => mkCard(t));
}

/** 有效布局 = (个人覆盖 ?? 角色模板) + 强制并回模板里的管理员卡;并 sanitize 非法卡 / 夹取 w,h */
export function getEffectiveLayout(uid: string, _viewerIsAdmin: boolean, roleCodes: string[]): WbLayout {
  const template = roleTemplate(roleCodes);
  const base = loadPersonalLayout(uid) ?? template;
  const result: WbLayout = base
    .filter((c) => c && c.type in CARD_META)
    .map((c) => ({
      id: c.id ?? c.type,
      type: c.type,
      w: clampW(c.w ?? CARD_META[c.type].w),
      h: clampH(c.h ?? CARD_META[c.type].h),
    }));
  for (const adm of template.filter((c) => isAdminCard(c.type))) {
    if (!result.some((c) => c.id === adm.id)) result.unshift({ ...adm });
  }
  return result;
}
