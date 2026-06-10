import type {
  VenueDesignerState,
  VenueElement,
  VenueElementType,
  ZoneElement,
} from "./venueTypes";

/**
 * 生成元素 ID。
 * 局域网 IP(http://10.x)是 insecure context,`crypto.randomUUID()` 不存在 → 会崩。
 * 这里只需单会话唯一,走 randomUUID → getRandomValues → 时间戳+random 三级兜底(同证书设计器)。
 */
export function genId(prefix = "el"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return `${prefix}_${Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t.slice(-4)}${r}`;
}

/** 常用中文字体栈 */
export const FONT_STACKS = [
  { value: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif', label: "系统默认" },
  { value: '"Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif', label: "微软雅黑" },
  { value: 'SimHei, "Microsoft YaHei", "Heiti SC", sans-serif', label: "黑体" },
  { value: 'KaiTi, "KaiTi_GB2312", STKaiti, "BiauKai", serif', label: "楷体" },
  { value: 'FangSong, "FangSong_GB2312", STFangsong, serif', label: "仿宋" },
  { value: 'SimSun, "Songti SC", STSong, serif', label: "宋体" },
] as const;

/* ─── 空状态 ─── */

export function emptyVenueState(width = 1200, height = 800, gridSize = 10): VenueDesignerState {
  return {
    elements: [],
    background: { type: "color", color: "#FFFFFF" },
    canvasWidth: width,
    canvasHeight: height,
    gridSize,
    showGrid: true,
  };
}

/* ─── 网格吸附 ─── */

/** 把坐标吸附到最近的网格线 */
export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/* ─── 元素工厂 ─── */

const PREFIX: Record<VenueElementType, string> = {
  seat: "seat",
  "table-rect": "tbl",
  "table-round": "tblr",
  presidium: "pre",
  podium: "pod",
  banner: "ban",
  wall: "wall",
  aisle: "aisle",
  door: "door",
  text: "txt",
  zone: "zone",
};

/**
 * 按类型生成默认元素(尺寸取 20 的整数倍,便于网格对齐)。
 * 加新元素类型 = 在此 switch 加一支 + venueTypes 联合补一项 + 渲染器/属性面板各补一处。
 */
export function makeElement(type: VenueElementType): VenueElement {
  const base = {
    id: genId(PREFIX[type]),
    x: 100,
    y: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
  switch (type) {
    case "seat":
      return { ...base, type, width: 40, height: 40, name: "座位", fill: "#DBEAFE" };
    case "table-rect":
      return { ...base, type, width: 160, height: 80, name: "会议桌", fill: "#C8A26B", stroke: "#7A5230", strokeWidth: 2, label: "会议桌" };
    case "table-round":
      return { ...base, type, width: 100, height: 100, name: "圆桌", fill: "#C8A26B", stroke: "#7A5230", strokeWidth: 2, label: "圆桌" };
    case "presidium":
      return { ...base, type, width: 360, height: 60, name: "主席台", fill: "#C8A26B", stroke: "#7A5230", strokeWidth: 2, label: "主席台" };
    case "podium":
      return { ...base, type, width: 60, height: 40, name: "发言席", fill: "#FEF3C7", stroke: "#D97706", strokeWidth: 2, label: "发言席" };
    case "banner":
      return { ...base, type, width: 640, height: 60, name: "横幅", text: "横幅标题文字", fontFamily: FONT_STACKS[1].value, fontSize: 28, color: "#FFFFFF", bg: "#C8001E" };
    case "wall":
      return { ...base, type, width: 640, height: 40, name: "背景墙", fill: "#E7E5E4" };
    case "aisle":
      return { ...base, type, width: 200, height: 40, name: "通道", fill: "#EFEFEF" };
    case "door":
      return { ...base, type, width: 80, height: 40, name: "门", color: "#15803D", label: "入口" };
    case "text":
      return { ...base, type, width: 160, height: 40, name: "文字", text: "文字", fontFamily: FONT_STACKS[1].value, fontSize: 20, color: "#1A1A1A", fontWeight: "normal", textAlign: "center" };
    case "zone":
      return { ...base, type, width: 240, height: 180, name: "区域", zoneName: "区域", color: "#3B82F6" };
  }
}

/** 拖角缩放时锁定宽高比(圆桌强制 1:1) */
export function isAspectLocked(el: VenueElement): boolean {
  return el.type === "table-round";
}

/** 区域不可旋转(轴对齐,规则点选靠几何包含判定) */
export function isRotatable(el: VenueElement): boolean {
  return el.type !== "zone";
}

/* ─── 命中测试 ─── */

export function hitTest(el: VenueElement, px: number, py: number): boolean {
  if (!el.visible) return false;
  return px >= el.x && px <= el.x + el.width && py >= el.y && py <= el.y + el.height;
}

/** 从上往下找第一个命中的元素(数组末尾 = topmost) */
export function pickElementAt(elements: VenueElement[], px: number, py: number): VenueElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.locked) continue;
    if (hitTest(el, px, py)) return el;
  }
  return null;
}

export function cloneElement(el: VenueElement, grid = 20): VenueElement {
  return { ...el, id: genId(PREFIX[el.type]), x: el.x + grid, y: el.y + grid };
}

/* ─── 工具 ─── */

/** 座位数(列表/保存回填 seatCount 用) */
export function countSeats(elements: VenueElement[]): number {
  return elements.filter((e) => e.type === "seat").length;
}

/**
 * 把每个座位归入其几何所在的区域(座位中心落在 zone bbox 内,topmost 优先)。
 * 保存时调用,把 zoneId 冗余写到 seat 上 —— 选座(V2)规则按 zoneId 等值判定,无需每次点中测试。
 */
export function assignZonesToSeats(elements: VenueElement[]): VenueElement[] {
  const zones = elements.filter((e): e is ZoneElement => e.type === "zone");
  if (zones.length === 0) {
    // 没有区域:清掉残留 zoneId
    return elements.map((el) => (el.type === "seat" && el.zoneId ? { ...el, zoneId: undefined } : el));
  }
  return elements.map((el) => {
    if (el.type !== "seat") return el;
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    let found: string | undefined;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) {
        found = z.id;
        break;
      }
    }
    return found === el.zoneId ? el : { ...el, zoneId: found };
  });
}

/** 图层栏色条用的"代表色" */
export function getElementColor(el: VenueElement): string {
  switch (el.type) {
    case "seat":
      return el.fill || "#9CA3AF";
    case "table-rect":
    case "table-round":
    case "presidium":
    case "podium":
      return el.fill || el.stroke || "#9CA3AF";
    case "banner":
      return el.bg || "#9CA3AF";
    case "wall":
    case "aisle":
      return el.fill || "#9CA3AF";
    case "door":
      return el.color || "#9CA3AF";
    case "text":
      return el.color || "#9CA3AF";
    case "zone":
      return el.color || "#9CA3AF";
  }
}
