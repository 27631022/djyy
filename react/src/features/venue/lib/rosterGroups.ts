import type { Attendee } from "../api";

/**
 * 名单分组工具(借鉴 task fieldDesignerUtils 的容器模式)。
 *
 * - 名单是扁平 Attendee[],每人带 group(组名);无 group = 未分组。
 * - 数组顺序 = 组内优先级顺序(同组的人按数组里出现的先后)。
 * - 分值(score)由「组内顺序」派生:每组内越靠前分越高 —— 排座引擎的输入。
 *   用户不再手填评分,只拖顺序。
 */

/** 未分组容器固定 id */
export const UNGROUPED = "__ungrouped__";

/** 预设组(一键创建) */
export const PRESET_GROUPS = ["机关组", "基层组", "上台领奖组"];

export interface RosterGroup {
  /** 组名(= Attendee.group);未分组为 UNGROUPED */
  id: string;
  attendees: Attendee[];
}

/** 扁平名单 + 本地空组 → 分组容器(未分组在前,其余按出现顺序,最后补空组) */
export function buildGroups(roster: Attendee[], emptyGroups: string[]): RosterGroup[] {
  const ungrouped: Attendee[] = [];
  const order: string[] = [];
  const byId = new Map<string, Attendee[]>();
  for (const a of roster) {
    const g = a.group?.trim();
    if (!g) {
      ungrouped.push(a);
      continue;
    }
    if (!byId.has(g)) {
      byId.set(g, []);
      order.push(g);
    }
    byId.get(g)!.push(a);
  }
  for (const g of emptyGroups) {
    if (g && !byId.has(g)) {
      byId.set(g, []);
      order.push(g);
    }
  }
  const groups: RosterGroup[] = [{ id: UNGROUPED, attendees: ungrouped }];
  for (const g of order) groups.push({ id: g, attendees: byId.get(g)! });
  return groups;
}

/** 分组容器 → 扁平名单(写回 group;未分组清掉 group) */
export function flattenGroups(groups: RosterGroup[]): Attendee[] {
  const out: Attendee[] = [];
  for (const g of groups) {
    for (const a of g.attendees) {
      out.push({ ...a, group: g.id === UNGROUPED ? undefined : g.id });
    }
  }
  return out;
}

/**
 * 按「组内顺序」算分值:每组内第 1 名 = 该组人数分,依次递减到 1。
 * 排座引擎据此在各组(对应各区)内从高到低排座。组间分值不可直接比(各组相对)。
 */
export function assignScores(roster: Attendee[]): Attendee[] {
  const total = new Map<string, number>();
  for (const a of roster) {
    const g = a.group ?? UNGROUPED;
    total.set(g, (total.get(g) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return roster.map((a) => {
    const g = a.group ?? UNGROUPED;
    const i = seen.get(g) ?? 0;
    seen.set(g, i + 1);
    const n = total.get(g) ?? 1;
    return { ...a, score: n - i };
  });
}

/** 重命名组(把该组所有人的 group 改成新名) */
export function renameGroup(roster: Attendee[], oldId: string, newId: string): Attendee[] {
  return roster.map((a) => (a.group === oldId ? { ...a, group: newId } : a));
}

/** 删组(组内人移到未分组) */
export function removeGroup(roster: Attendee[], id: string): Attendee[] {
  return roster.map((a) => (a.group === id ? { ...a, group: undefined } : a));
}
