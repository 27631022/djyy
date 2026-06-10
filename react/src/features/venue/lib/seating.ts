import type { VenueDesignerState, SeatElement, ZoneElement } from "./venueTypes";
import type { Attendee } from "../api";

/** 一个座位的分配(attendeeId 空 = 空座/未排) */
export interface SeatAssign {
  seatId: string;
  attendeeId?: string;
  attendeeName?: string;
  unit?: string;
  position?: string;
  group?: string;
  /** 特殊身份(来宾/记者…),从 Attendee.special 带出,渲染标记用 */
  special?: string;
  /** 锁定(手动钉死):重新一键排座时此座 + 此人不变 */
  locked?: boolean;
}

export interface SeatingReport {
  total: number;
  seated: number;
  unseated: number;
  byGroup: Record<string, { people: number; seated: number; zone?: string }>;
}

export interface SeatingResult {
  assignments: SeatAssign[]; // 每个座位一条
  unseated: Attendee[]; // 没排上的人(组未映射 / 区内座位不够)
  report: SeatingReport;
}

function center(e: { x: number; y: number; width: number; height: number }) {
  return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
}
function seatInZone(s: SeatElement, z: ZoneElement) {
  const c = center(s);
  return c.x >= z.x && c.x <= z.x + z.width && c.y >= z.y && c.y <= z.y + z.height;
}

/**
 * 中心参照点(尊位基准)。优先级:手动指定 > 主席台 > 会议桌 > 最前排中央座位 > 画布上方中点。
 * 排座以它为「最尊」原点(距它越近越尊),「中央向两侧」也以它所在那一排为中线。
 */
export function resolveAnchor(
  layout: VenueDesignerState,
  override?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (override && typeof override.x === "number" && typeof override.y === "number") {
    return { x: override.x, y: override.y };
  }
  const els = layout.elements;
  const pres = els.find((e) => e.type === "presidium");
  if (pres) return center(pres);
  const tables = els.filter((e) => e.type === "table-rect" || e.type === "table-round");
  if (tables.length) {
    const minX = Math.min(...tables.map((t) => t.x));
    const maxX = Math.max(...tables.map((t) => t.x + t.width));
    const minY = Math.min(...tables.map((t) => t.y));
    const maxY = Math.max(...tables.map((t) => t.y + t.height));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  const seats = els.filter((e): e is SeatElement => e.type === "seat");
  if (seats.length) {
    const minY = Math.min(...seats.map((s) => s.y));
    const front = seats.filter((s) => Math.abs(s.y - minY) <= Math.max(8, s.height * 0.7));
    const fx = front.reduce((a, s) => a + (s.x + s.width / 2), 0) / front.length;
    let best = front[0];
    for (const s of front) {
      if (Math.abs(s.x + s.width / 2 - fx) < Math.abs(best.x + best.width / 2 - fx)) best = s;
    }
    return center(best);
  }
  return { x: layout.canvasWidth / 2, y: 0 };
}

/** 主席台一侧的 y(用于判定台上右为大 / 台下左为大);无主席台返回 null(全场按台下左为大) */
function stageBaselineY(layout: VenueDesignerState): number | null {
  const pres = layout.elements.find((e) => e.type === "presidium");
  return pres ? center(pres).y : null;
}

/**
 * 座位「尊位次序」排序(确定性,不随几何忽左忽右):
 * 1. 按 y 聚成「排」;2. 排按「距主席台近」优先(越靠前越先排);
 * 3. 每排中央向两侧 —— 台上一侧(主席台/在 anchor 之上)右为大,台下观众左为大(两者镜像,
 *    因为观众面朝主席台,尊位左右相反)。
 * 返回从「最尊」到「最次」的座位序列;名单按此序入座(名单第 1 个坐最尊位)。
 */
function orderSeatsByHonor(
  seatsIn: SeatElement[],
  anchor: { x: number; y: number },
  stageY: number | null,
): SeatElement[] {
  if (seatsIn.length <= 1) return [...seatsIn];
  const cy = (e: SeatElement) => e.y + e.height / 2;
  const cx = (e: SeatElement) => e.x + e.width / 2;
  // 1. 按 y 聚成排(同排 y 相近)
  const sorted = [...seatsIn].sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
  const rows: SeatElement[][] = [];
  let cur: SeatElement[] = [sorted[0]];
  let rowCy = cy(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (Math.abs(cy(s) - rowCy) <= Math.max(8, s.height * 0.7)) {
      cur.push(s);
    } else {
      rows.push(cur);
      cur = [s];
      rowCy = cy(s);
    }
  }
  rows.push(cur);
  // 2. 排序:距主席台近的排先(前排先坐)
  const rowKey = (r: SeatElement[]) => Math.abs(r.reduce((a, e) => a + cy(e), 0) / r.length - anchor.y);
  rows.sort((a, b) => rowKey(a) - rowKey(b));
  // 3. 每排座次:按「距中心列(anchor.x)的水平距离」升序 —— 离中心越近越尊位。
  //    左右对称的一对(同距离)时:台上一侧右为大、台下观众左为大。
  //
  //    关键:用「物理距离」定中心,而不是「可用座位排序后的索引中点」。
  //    当两个区域重合、中央座位被高优先组先占走后,本组只剩外圈座,
  //    旧的「索引中点」会把外圈座误当中央(于是第 2 个人被排到最左边、第 3 个排到右侧),
  //    这正是用户反馈的乱序。改用 anchor.x 物理距离后,无论中央座是否已被占,
  //    剩余座位始终以真实中央向两侧展开:中央三人坐齐 → 第 4 人坐中央左侧第一个、
  //    第 5 人坐右侧第一个,顺序正确。(满座非重叠场景结果与旧逻辑一致,无回归。)
  const out: SeatElement[] = [];
  for (const row of rows) {
    const avgCy = row.reduce((a, e) => a + cy(e), 0) / row.length;
    // 仅当有主席台且本排在主席台一侧(台上,面朝观众)→ 右为大;其余(台下观众/无主席台)左为大
    const rightFirst = stageY != null && avgCy <= stageY + 0.5;
    const ordered = [...row].sort((a, b) => {
      const d = Math.abs(cx(a) - anchor.x) - Math.abs(cx(b) - anchor.x);
      if (Math.abs(d) > 0.5) return d; // 离中心近者先(0.5px 容差吸收浮点误差)
      return rightFirst ? cx(b) - cx(a) : cx(a) - cx(b); // 同距:台上右先、台下左先
    });
    out.push(...ordered);
  }
  return out;
}

/**
 * 智能排座(确定性纯函数)。
 *
 * 名单的组 →(groupZoneMap)会场图的区(zone)→ 组内顺序(roster 数组顺序 = 分值,越前越高)
 * 填进该区座位;区内座位按「尊位次序」排:**距主席台近的优先**(即前排居中优先),
 * tie 再按 y(靠前)、x(靠左)。锁定/预留座不占。同输入同输出,无随机。
 */
export function computeSeating(
  layout: VenueDesignerState,
  roster: Attendee[],
  groupZoneMap: Record<string, string>,
  zonesOverride?: ZoneElement[],
  anchorOverride?: { x: number; y: number } | null,
  options?: {
    /** 锁定(手动钉死)的座位分配:座位 + 人都不参与重排,原样保留 */
    lockedAssignments?: SeatAssign[];
    /** 预留座位 id(记者站位/设备位);自动排座跳过、不排人 */
    reservedSeatIds?: string[];
  },
): SeatingResult {
  const allSeats = layout.elements.filter((e): e is SeatElement => e.type === "seat");
  // zonesOverride = 方案专属区域(向导第3步画的);缺省时用座次图自带的 zone
  const zones = zonesOverride ?? layout.elements.filter((e): e is ZoneElement => e.type === "zone");
  const anchor = resolveAnchor(layout, anchorOverride);
  const stageY = stageBaselineY(layout);

  // 锁定:手动钉死的座位 + 人,既不重排座也不重排人,直接保留进结果
  const locked = (options?.lockedAssignments ?? []).filter((a) => a.attendeeId);
  const lockedSeatIds = new Set(locked.map((a) => a.seatId));
  const lockedAttIds = new Set(locked.map((a) => a.attendeeId));
  const reservedIds = new Set(options?.reservedSeatIds ?? []);
  const lockedAssigns: SeatAssign[] = locked.map((a) => ({ ...a, locked: true }));

  // 可自动分配的座位:排除 元素级预留(seat.reserved)、方案级预留(reservedSeatIds)、已锁定座
  const seats = allSeats.filter(
    (s) => !s.reserved && !reservedIds.has(s.id) && !lockedSeatIds.has(s.id),
  );
  // 待自动排的人:排除 已锁定者 + 特殊人员(待手动指定座);特殊但未锁定者列入 unseated
  const autoRoster = roster.filter((p) => !lockedAttIds.has(p.id) && !p.special);
  const specialPending = roster.filter((p) => p.special && !lockedAttIds.has(p.id));

  // 整场模式:没有划定区域 → 待排的人按名单顺序 + 尊位次序填满可用座(忽略分组)
  if (zones.length === 0) {
    const pool = orderSeatsByHonor(seats, anchor, stageY); // seats 已排除 reserved/预留/锁定座
    const autoAssigns: SeatAssign[] = [];
    const used = new Set<string>(lockedSeatIds);
    autoRoster.forEach((p, i) => {
      if (i < pool.length) {
        const seat = pool[i];
        used.add(seat.id);
        autoAssigns.push({
          seatId: seat.id,
          attendeeId: p.id,
          attendeeName: p.name,
          unit: p.unit,
          position: p.position,
          group: p.group,
        });
      }
    });
    const unseatedFlat = [...autoRoster.slice(pool.length), ...specialPending];
    const empty: SeatAssign[] = allSeats.filter((s) => !used.has(s.id)).map((s) => ({ seatId: s.id }));
    const assignments = [...lockedAssigns, ...autoAssigns, ...empty];
    return {
      assignments,
      unseated: unseatedFlat,
      report: {
        total: roster.length,
        seated: assignments.filter((a) => a.attendeeId).length,
        unseated: unseatedFlat.length,
        byGroup: {},
      },
    };
  }

  // 名单按组分块(只含待自动排的人:已排除锁定 + 特殊)。Map 插入序 = 各组首次出现先后 = 排座优先级(第5步可拖拽调整)。
  // 高优先组先填,配合 used 集合 → 区域重叠时先满足高优先区,再用剩余座位补低优先区。
  const groups = new Map<string, Attendee[]>();
  for (const a of autoRoster) {
    const g = a.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(a);
  }

  const autoAssigns: SeatAssign[] = [];
  const used = new Set<string>(lockedSeatIds); // 锁定座已占,自动排不再用
  const unseated: Attendee[] = [...specialPending]; // 特殊人员待手动指定座
  const byGroup: SeatingReport["byGroup"] = {};

  for (const [group, people] of groups) {
    const zoneId = group ? groupZoneMap[group] : undefined;
    const zone = zones.find((z) => z.id === zoneId);
    const key = group || "(未分组)";
    byGroup[key] = { people: people.length, seated: 0, zone: zone?.zoneName };
    if (!zoneId) {
      unseated.push(...people);
      continue;
    }
    // 按「几何落在本组区域内」选座(seats 已排除 reserved/预留/锁定)→ 区域重叠时由优先级 + used 决定归谁
    const pool = orderSeatsByHonor(
      seats.filter((s) => !used.has(s.id) && !!zone && seatInZone(s, zone)),
      anchor,
      stageY,
    );
    people.forEach((p, i) => {
      if (i < pool.length) {
        const seat = pool[i];
        used.add(seat.id);
        autoAssigns.push({
          seatId: seat.id,
          attendeeId: p.id,
          attendeeName: p.name,
          unit: p.unit,
          position: p.position,
          group,
        });
        byGroup[key].seated++;
      } else {
        unseated.push(p);
      }
    });
  }

  // 空座(全部座位 - 已用,含预留/未映射区)也输出,便于结果页渲染空位;锁定分配置顶
  const empty: SeatAssign[] = allSeats.filter((s) => !used.has(s.id)).map((s) => ({ seatId: s.id }));
  const assignments = [...lockedAssigns, ...autoAssigns, ...empty];

  const seated = assignments.filter((a) => a.attendeeId).length;
  return {
    assignments,
    unseated,
    report: { total: roster.length, seated, unseated: unseated.length, byGroup },
  };
}
