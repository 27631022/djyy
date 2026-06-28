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

/* ═══ 全卡片工作台 · iOS/Android 服务卡片模型 ═══
 *
 * 思路对齐手机系统的「服务卡片 / 小组件」:
 *   一个组件(WbCardType)= 一组「固定尺寸」的卡片设计(小 / 中 / 大…),
 *   每个尺寸在设计时就定死宽高,并各自独立排版(不是一套内容拉伸),效果最好。
 *   用户改尺寸 = 在该组件「支持的设计尺寸」之间切换。
 *
 * 【网格】桌面 4 列等宽 + 行格 ROW_UNIT=120px + gap GRID_GAP + grid-auto-flow:dense(回填空缺)。
 * 【尺寸令牌】SIZE_DIM:令牌 → {w 横格, h 纵格, label}。卡片在栅格里占 w 列 × h 行。
 *   2x1 宽条 / 2x2 小(方) / 4x2 中(宽) / 4x4 大(整行高)。
 * 【每组件支持尺寸】CARD_META[type].sizes:该组件做了设计的尺寸集合 + 默认尺寸。
 *   —— 多尺寸组件(如「待办」)= 小/中/大三套真设计;其余组件暂各保留一个当前尺寸,后续逐个升级。
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

export const GRID_COLS = 4;
export const ROW_UNIT = 120; // px:一个纵向行格
export const GRID_GAP = 14; // px

/* ── 尺寸令牌(固定设计尺寸)── */
export type WbCardSize = "2x1" | "2x2" | "4x2" | "4x4";
export const SIZE_DIM: Record<WbCardSize, { w: number; h: number; label: string }> = {
  "2x1": { w: 2, h: 1, label: "宽条" },
  "2x2": { w: 2, h: 2, label: "小" },
  "4x2": { w: 4, h: 2, label: "中" },
  "4x4": { w: 4, h: 4, label: "大" },
};

export interface WbCard {
  id: string;
  type: WbCardType;
  size: WbCardSize;
}
export type WbLayout = WbCard[];

export interface CardMeta {
  title: string;
  icon: ElementType;
  admin: boolean;
  desc: string;
  sizes: WbCardSize[]; // 该组件做了设计、可选的固定尺寸(第一个为默认)
  defaultSize: WbCardSize;
}
function meta(
  title: string,
  icon: ElementType,
  admin: boolean,
  desc: string,
  sizes: WbCardSize[],
): CardMeta {
  return { title, icon, admin, desc, sizes, defaultSize: sizes[0] };
}
export const CARD_META: Record<WbCardType, CardMeta> = {
  // ★「待办」= 首个真数据多尺寸卡:小/中/大三套设计
  todo: meta("智能待办", ClipboardListIcon, false, "跨应用待我处理(真实数据)", ["4x2", "2x2", "4x4"]),
  // 其余组件暂各保留一个当前尺寸(后续逐个升级成多尺寸真卡)
  notice: meta("通知公告", MegaphoneIcon, true, "管理员发布,全员可见", ["2x2"]),
  governance: meta("应用治理", ShieldCheckIcon, true, "权限 / 虚拟组织(管理员)", ["2x1"]),
  apps: meta("我的应用", LayoutGridIcon, false, "常用业务应用入口", ["4x2"]),
  recommend: meta("猜你喜欢", SparklesIcon, false, "智能推荐", ["2x2"]),
  calendar: meta("今日安排", CalendarDaysIcon, false, "日历与日程", ["2x2"]),
  persona: meta("个人画像", UserCircle2Icon, false, "岗位 / 偏好", ["2x1"]),
  kpi: meta("关键指标", BarChart3Icon, false, "进度 / 业绩", ["2x1"]),
  quick: meta("快捷入口", ZapIcon, false, "高频动作", ["2x1"]),
  assistant: meta("智能助手", SparklesIcon, false, "自然语言调应用", ["2x2"]),
};

/** 添加目录:个人卡(全员)/ 管理员卡(仅管理员可加) */
export const PERSONAL_CATALOG: WbCardType[] = [
  "todo",
  "apps",
  "recommend",
  "kpi",
  "quick",
  "calendar",
  "persona",
  "assistant",
];
export const ADMIN_CATALOG: WbCardType[] = ["notice", "governance"];

/* ── 尺寸:取维度 / 校验 / 在支持集合内切换 ── */
export function dimOf(size: WbCardSize): { w: number; h: number } {
  return SIZE_DIM[size] ?? SIZE_DIM["2x2"];
}
/** 把任意 size 收敛到该组件支持的尺寸(非法 → 默认) */
export function saneSize(type: WbCardType, size: unknown): WbCardSize {
  const m = CARD_META[type];
  return m.sizes.includes(size as WbCardSize) ? (size as WbCardSize) : m.defaultSize;
}
/** 在该组件支持的尺寸里循环切换(只有一个尺寸则不变) */
export function nextSize(type: WbCardType, current: WbCardSize): WbCardSize {
  const list = CARD_META[type].sizes;
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}
export function hasMultipleSizes(type: WbCardType): boolean {
  return CARD_META[type].sizes.length > 1;
}

export function isAdminCard(type: WbCardType): boolean {
  return CARD_META[type].admin;
}
/** 该卡对当前用户是否锁定:管理员卡 且 非管理员 → 锁定(不可移除/拖动/改尺寸) */
export function isLockedFor(type: WbCardType, viewerIsAdmin: boolean): boolean {
  return CARD_META[type].admin && !viewerIsAdmin;
}

function mkCard(type: WbCardType, id?: string): WbCard {
  return { id: id ?? type, type, size: CARD_META[type].defaultSize };
}
export function newCardId(type: WbCardType): string {
  return `${type}_${Date.now().toString(36)}`;
}

/* ─── 持久化:localStorage v4(size 令牌模型;旧 v2/v3 卡集合迁移、尺寸用各组件默认)─── */
const LKEY = (uid: string) => `djyy_wb_layout_v4_${uid}`;
const LEGACY_KEYS = (uid: string) => [`djyy_wb_layout_v3_${uid}`, `djyy_wb_layout_v2_${uid}`];

export function loadPersonalLayout(uid: string): WbLayout | null {
  try {
    const raw = localStorage.getItem(LKEY(uid));
    if (raw) return JSON.parse(raw) as WbLayout;
    for (const k of LEGACY_KEYS(uid)) {
      const old = localStorage.getItem(k);
      if (old) {
        const arr = JSON.parse(old) as { id?: string; type: WbCardType }[];
        return arr.filter((c) => c && c.type in CARD_META).map((c) => mkCard(c.type, c.id));
      }
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
    LEGACY_KEYS(uid).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** 角色模板(千人千面骨架):默认含管理员锁定卡 + 个人默认卡 */
export function roleTemplate(_roleCodes: string[]): WbLayout {
  const order: WbCardType[] = [
    "notice",
    "todo",
    "apps",
    "recommend",
    "kpi",
    "quick",
    "calendar",
    "persona",
    "governance",
  ];
  return order.map((t) => mkCard(t));
}

/** 有效布局 = (个人覆盖 ?? 角色模板) + 强制并回模板里的管理员卡;sanitize 非法卡 / 收敛 size */
export function getEffectiveLayout(uid: string, _viewerIsAdmin: boolean, roleCodes: string[]): WbLayout {
  const template = roleTemplate(roleCodes);
  const base = loadPersonalLayout(uid) ?? template;
  const result: WbLayout = base
    .filter((c) => c && c.type in CARD_META)
    .map((c) => ({ id: c.id ?? c.type, type: c.type, size: saneSize(c.type, c.size) }));
  for (const adm of template.filter((c) => isAdminCard(c.type))) {
    if (!result.some((c) => c.id === adm.id)) result.unshift({ ...adm });
  }
  return result;
}
