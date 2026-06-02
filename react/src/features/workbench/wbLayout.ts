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

/* ─── 全卡片工作台 ───
 * 一页皆卡。两类卡:
 *   管理员卡(admin=true,如 通知公告 / 应用治理):管理员放置 + 锁定,普通用户全员可见但不可移除/移出。
 *   个人卡(admin=false):用户按习惯自由 增删 / 排序 / 缩放。
 * 千人千面 + 自定义:系统默认/角色模板 < 个人覆盖;管理员卡在合并后强制并回。
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

export type CardSize = "sm" | "md" | "lg";
export interface WbCard {
  id: string;
  type: WbCardType;
  size: CardSize;
}
export type WbLayout = WbCard[];

export interface CardMeta {
  title: string;
  icon: ElementType;
  defaultSize: CardSize;
  admin: boolean;
  desc: string;
}
export const CARD_META: Record<WbCardType, CardMeta> = {
  notice: { title: "通知公告", icon: MegaphoneIcon, defaultSize: "lg", admin: true, desc: "管理员发布,全员可见" },
  governance: { title: "应用治理", icon: ShieldCheckIcon, defaultSize: "md", admin: true, desc: "权限 / 虚拟组织(管理员)" },
  apps: { title: "我的应用", icon: LayoutGridIcon, defaultSize: "lg", admin: false, desc: "常用业务应用入口" },
  todo: { title: "智能待办", icon: ClipboardListIcon, defaultSize: "md", admin: false, desc: "跨应用待我处理" },
  recommend: { title: "猜你喜欢", icon: SparklesIcon, defaultSize: "md", admin: false, desc: "智能推荐" },
  calendar: { title: "今日安排", icon: CalendarDaysIcon, defaultSize: "sm", admin: false, desc: "日历与日程" },
  persona: { title: "个人画像", icon: UserCircle2Icon, defaultSize: "sm", admin: false, desc: "岗位 / 偏好" },
  kpi: { title: "关键指标", icon: BarChart3Icon, defaultSize: "md", admin: false, desc: "进度 / 业绩" },
  quick: { title: "快捷入口", icon: ZapIcon, defaultSize: "md", admin: false, desc: "高频动作" },
  assistant: { title: "智能助手", icon: SparklesIcon, defaultSize: "md", admin: false, desc: "自然语言调应用" },
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

export const SIZE_CLASS: Record<CardSize, string> = {
  sm: "md:col-span-1 lg:col-span-1",
  md: "md:col-span-2 lg:col-span-2",
  lg: "md:col-span-2 lg:col-span-4",
};
export const SIZE_LABEL: Record<CardSize, string> = { sm: "小", md: "中", lg: "宽" };
export function nextSize(s: CardSize): CardSize {
  return s === "sm" ? "md" : s === "md" ? "lg" : "sm";
}

export function isAdminCard(type: WbCardType): boolean {
  return CARD_META[type].admin;
}
/** 该卡对当前用户是否锁定:管理员卡 且 非管理员 → 锁定(不可移除/拖动) */
export function isLockedFor(type: WbCardType, viewerIsAdmin: boolean): boolean {
  return CARD_META[type].admin && !viewerIsAdmin;
}

/* ─── 持久化:localStorage v2(留服务端 TODO) ─── */
const LKEY = (uid: string) => `djyy_wb_layout_v2_${uid}`;
export function loadPersonalLayout(uid: string): WbLayout | null {
  try {
    const raw = localStorage.getItem(LKEY(uid));
    return raw ? (JSON.parse(raw) as WbLayout) : null;
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
  } catch {
    /* ignore */
  }
}
export function newCardId(type: WbCardType): string {
  return `${type}_${Date.now().toString(36)}`;
}

/** 角色模板(千人千面骨架):默认含管理员锁定卡 + 个人默认卡。将来按 roleCodes 分支或后台配。 */
export function roleTemplate(_roleCodes: string[]): WbLayout {
  return [
    { id: "notice", type: "notice", size: "lg" },
    { id: "apps", type: "apps", size: "lg" },
    { id: "todo", type: "todo", size: "md" },
    { id: "recommend", type: "recommend", size: "md" },
    { id: "kpi", type: "kpi", size: "md" },
    { id: "calendar", type: "calendar", size: "sm" },
    { id: "persona", type: "persona", size: "sm" },
    { id: "governance", type: "governance", size: "md" },
  ];
}

/** 有效布局 = (个人覆盖 ?? 角色模板) + 强制并回模板里的管理员卡 */
export function getEffectiveLayout(uid: string, _viewerIsAdmin: boolean, roleCodes: string[]): WbLayout {
  const template = roleTemplate(roleCodes);
  const base = loadPersonalLayout(uid) ?? template;
  const result = [...base];
  for (const adm of template.filter((c) => isAdminCard(c.type))) {
    if (!result.some((c) => c.id === adm.id)) result.unshift({ ...adm });
  }
  return result;
}
