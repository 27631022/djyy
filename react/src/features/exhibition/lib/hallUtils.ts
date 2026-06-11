import type {
  Fixture,
  FixtureType,
  HallDesignerState,
  HallThemePreset,
  Wall,
} from "./hallTypes";

/** 画布比例:1 米 = 50 SVG 单位(viewBox 坐标 = 米 × M2U) */
export const M2U = 50;
/** 墙厚(米)—— 与 3D 客户端 wallBuilder 的 WALL_T 一致,画布按此宽度描墙 */
export const WALL_T = 0.2;
/** 贴墙吸附触发距离(米) */
export const WALL_SNAP_DIST = 1.2;
/** 画墙时端点吸附半径(米) */
export const ENDPOINT_SNAP = 0.3;

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function snapTo(n: number, step: number): number {
  return round2(Math.round(n / step) * step);
}

/* ── 组件类型元信息 ── */

export interface FixtureTypeMeta {
  type: FixtureType;
  label: string;
  /** 默认占地 W×D(米,规格第 6 节) */
  w: number;
  d: number;
  /** 贴墙类型:放置/拖动时自动吸附到最近墙段并取朝向 */
  wallMount: boolean;
  /** 平面图示意色(填充) */
  color: string;
}

export const FIXTURE_META: Record<FixtureType, FixtureTypeMeta> = {
  image_case: { type: "image_case", label: "图片展柜", w: 1.6, d: 0.6, wallMount: false, color: "#3B82F6" },
  video_wall: { type: "video_wall", label: "视频展墙", w: 3.0, d: 0.3, wallMount: true, color: "#8B5CF6" },
  model_stand: { type: "model_stand", label: "模型台", w: 1.0, d: 1.0, wallMount: false, color: "#10B981" },
  honor_wall: { type: "honor_wall", label: "荣誉墙", w: 3.0, d: 0.3, wallMount: true, color: "#F59E0B" },
  notice_board: { type: "notice_board", label: "党务公开板", w: 2.4, d: 0.3, wallMount: true, color: "#EF4444" },
  door: { type: "door", label: "门 / 通道", w: 1.4, d: 0.3, wallMount: true, color: "#6B7280" },
  text_3d: { type: "text_3d", label: "立体字", w: 3.0, d: 0.4, wallMount: true, color: "#C8001E" },
  decor: { type: "decor", label: "装饰", w: 0.55, d: 0.55, wallMount: false, color: "#16A34A" },
};

/** 装饰变体(palette 按变体出按钮,stamp preset 带各自尺寸) */
export const DECOR_PRESETS: { kind: "plant" | "plant_short" | "bench"; label: string; w: number; d: number }[] = [
  { kind: "plant", label: "绿植(高)", w: 0.55, d: 0.55 },
  { kind: "plant_short", label: "矮盆栽", w: 0.5, d: 0.5 },
  { kind: "bench", label: "长椅", w: 1.2, d: 0.45 },
];

/** 新组件实例(默认 content 按类型给最小可编辑形状;preset 覆盖尺寸/内容/名称) */
export function makeFixture(
  type: FixtureType,
  x: number,
  y: number,
  rot = 0,
  preset?: { label?: string; w?: number; d?: number; content?: unknown },
): Fixture {
  const meta = FIXTURE_META[type];
  const content: unknown =
    preset?.content !== undefined
      ? preset.content
      : type === "image_case"
        ? { images: [] }
        : type === "honor_wall" || type === "notice_board"
          ? { items: [] }
          : type === "text_3d"
            ? { text: "标题文字", sizeM: 0.6, depthM: 0.12, finish: "paint", mount: "wall" }
            : type === "decor"
              ? { kind: "plant" }
              : type === "door"
                ? null
                : {};
  return {
    id: uid("fx"),
    type,
    x: round2(x),
    y: round2(y),
    rot,
    w: preset?.w ?? meta.w,
    d: preset?.d ?? meta.d,
    label: preset?.label ?? meta.label,
    source: { mode: "manual", content },
  };
}

/* ── 几何 ── */

/** 朝向单位向量:rot 度,0=朝-Y → (sin r, -cos r) */
export function facingOf(rotDeg: number): { x: number; y: number } {
  const r = (rotDeg * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/** 由朝向向量反推 rot(度,[0,360)) */
export function rotFromFacing(fx: number, fy: number): number {
  const deg = (Math.atan2(fx, -fy) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

export interface WallProjection {
  wall: Wall;
  /** 投影点(夹在线段内) */
  px: number;
  py: number;
  /** 点到投影的距离(米) */
  dist: number;
  /** 朝「点所在一侧」的墙法线(单位向量) */
  nx: number;
  ny: number;
}

/** 点到最近墙段的投影(无墙或全超出 → null) */
export function nearestWall(walls: Wall[], x: number, y: number): WallProjection | null {
  let best: WallProjection | null = null;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    let t = ((x - w.x1) * dx + (y - w.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = w.x1 + t * dx;
    const py = w.y1 + t * dy;
    const dist = Math.hypot(x - px, y - py);
    if (!best || dist < best.dist) {
      const len = Math.sqrt(len2);
      // 法线取朝向点一侧
      let nx = -dy / len;
      let ny = dx / len;
      if ((x - px) * nx + (y - py) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      best = { wall: w, px, py, dist, nx, ny };
    }
  }
  return best;
}

/**
 * 贴墙吸附:把组件中心吸到最近墙段旁(门吸在墙中线上),朝向取「背墙朝外」。
 * 超出触发距离返回 null(保持自由放置)。
 */
export function snapFixtureToWall(
  walls: Wall[],
  type: FixtureType,
  x: number,
  y: number,
  d: number,
): { x: number; y: number; rot: number } | null {
  const proj = nearestWall(walls, x, y);
  if (!proj || proj.dist > WALL_SNAP_DIST) return null;
  const offset = type === "door" ? 0 : WALL_T / 2 + d / 2;
  return {
    x: round2(proj.px + proj.nx * offset),
    y: round2(proj.py + proj.ny * offset),
    rot: rotFromFacing(proj.nx, proj.ny),
  };
}

/** 画墙端点吸附:网格 + 既有端点(端点优先) */
export function snapWallPoint(
  walls: Wall[],
  x: number,
  y: number,
  gridM: number,
): { x: number; y: number } {
  for (const w of walls) {
    for (const [ex, ey] of [
      [w.x1, w.y1],
      [w.x2, w.y2],
    ] as const) {
      if (Math.hypot(x - ex, y - ey) <= ENDPOINT_SNAP) return { x: ex, y: ey };
    }
  }
  return { x: snapTo(x, gridM), y: snapTo(y, gridM) };
}

/** 内容包围盒(米;空厅给默认 24×16) */
export function contentBounds(state: HallDesignerState): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const eat = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const w of state.walls) {
    eat(w.x1, w.y1);
    eat(w.x2, w.y2);
  }
  for (const f of state.fixtures) {
    const r = Math.max(f.w, f.d) / 2;
    eat(f.x - r, f.y - r);
    eat(f.x + r, f.y + r);
  }
  if (state.meta.spawn) eat(state.meta.spawn.x, state.meta.spawn.y);
  if (!isFinite(minX)) return { minX: -12, minY: -8, maxX: 12, maxY: 8 };
  return { minX, minY, maxX, maxY };
}

/** 默认新厅:16×10m 矩形房间 */
export function defaultHallState(preset: HallThemePreset = "modern_light"): HallDesignerState {
  return {
    walls: [
      { id: uid("w"), x1: -8, y1: -5, x2: 8, y2: -5 },
      { id: uid("w"), x1: 8, y1: -5, x2: 8, y2: 5 },
      { id: uid("w"), x1: 8, y1: 5, x2: -8, y2: 5 },
      { id: uid("w"), x1: -8, y1: 5, x2: -8, y2: -5 },
    ],
    fixtures: [],
    meta: {
      gridM: 0.5,
      wallH: 4.2,
      theme: { preset, accent: "#C8001E" },
      spawn: { x: 0, y: 3, rot: 0 },
    },
  };
}

/**
 * 保存前清洗:剥掉后端「已解析」旁补的 url 键(url/imageUrl/videoUrl/poster/modelUrl),
 * 只把 fileId 存回去,避免响应态键被固化进 JSON。
 */
const RESOLVED_URL_KEYS = new Set(["url", "imageUrl", "videoUrl", "poster", "modelUrl"]);

export function stripResolvedUrls<T>(node: T): T {
  if (Array.isArray(node)) return node.map((n) => stripResolvedUrls(n)) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (RESOLVED_URL_KEYS.has(k)) continue;
      out[k] = stripResolvedUrls(v);
    }
    return out as T;
  }
  return node;
}

/** 墙段长度(米) */
export function wallLength(w: Wall): number {
  return round2(Math.hypot(w.x2 - w.x1, w.y2 - w.y1));
}
