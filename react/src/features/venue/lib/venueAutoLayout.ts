/**
 * 排式会议厅「智能生成布局」—— 确定性排布生成器。
 *
 * 为什么是确定性算法而非让 LLM 直接吐坐标:
 *   座位成行成列、居中、留过道、自适应画布,本质是几何计算,LLM 直接给坐标会重叠/算错。
 *   LLM 只负责把「一段描述」翻译成下面的 VenueLayoutSpec(见后端 /venue/extract-layout),
 *   真正的坐标排布由本文件精确完成。
 *
 * 形态:排式会议厅(主席台在前居中,台下一排排面向主席台,中间可留过道)。
 *   顶部背景墙 + 横幅 → 主席台(领导座位「中央向两侧」编号 + 主席台长桌 + 发言席)
 *   → 间隔 → 台下排式座位(全局编号,居中,按过道分块)。
 *
 * 输出 VenueDesignerState,可直接灌进设计器画布(可撤销)。所有坐标吸附到网格,行列对齐。
 */
import type {
  VenueDesignerState,
  VenueElement,
  SeatElement,
  PresidiumElement,
  PodiumElement,
  BannerElement,
  WallElement,
  TextElement,
} from "./venueTypes";
import { makeElement, snapToGrid } from "./venueUtils";

/* ─── 生成参数(= 表单字段;后端 AI 解析描述也返回这个结构) ─── */
export interface VenueLayoutSpec {
  /** 会议名称(横幅文字);空则横幅显示占位文字 */
  meetingName: string;
  /** 台下参会人数 */
  attendeeCount: number;
  /** 每排座位数 */
  seatsPerRow: number;
  /** 中间过道数(0/1/2),把每排切成 过道数+1 块 */
  aisles: number;
  /** 主席台(台上领导)人数;0 = 不要主席台 */
  presidiumCount: number;
  /** 发言席位置 */
  podium: "none" | "left" | "right";
  /** 顶部横幅 */
  banner: boolean;
  /** 主席台背景墙 */
  backWall: boolean;
}

export const DEFAULT_LAYOUT_SPEC: VenueLayoutSpec = {
  meetingName: "",
  attendeeCount: 100,
  seatsPerRow: 12,
  aisles: 1,
  presidiumCount: 5,
  podium: "right",
  banner: true,
  backWall: true,
};

/* ─── 几何常量(均为网格 GRID 的整数倍,保证吸附后行列整齐) ─── */
const GRID = 10; // 网格加密:座位 40 = 横竖各 4 格,便于排版对齐
const SEAT = 40; // 座位边长(= 4 格)
const SEAT_GAP_X = 20; // 同排座位水平间隙
const ROW_GAP = 40; // 排间垂直间隙(腿部空间)
const AISLE_W = 60; // 过道宽
const MARGIN = 60; // 画布四周留白
const BANNER_H = 60;
const WALL_PAD = 20; // 背景墙在主席台区上下额外延伸
const PRESIDIUM_H = 60; // 主席台长桌高
const PODIUM_W = 60;
const PODIUM_H = 40;
const GAP_LEADER_DESK = 20; // 领导座位 → 主席台桌
const GAP_BANNER_LEADER = 30; // 横幅 → 领导座位
const GAP_STAGE_AUDIENCE = 100; // 主席台区 → 台下首排
const ROW_LABEL_W = 44; // 排号标签宽
const ROW_LABEL_GUTTER = ROW_LABEL_W + 16; // 台下两侧给排号标签预留的空间

/* ─── 主席台座次(中央向两侧;同距离时右侧[观众视角右]为大) ─── */
/** 返回长度 n 的数组,下标=物理位置(左→右 0..n-1),值=座次号(1=正中最尊) */
export function presidiumSeatNos(n: number): number[] {
  if (n <= 0) return [];
  const c = (n - 1) / 2;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const da = Math.abs(a - c);
    const db = Math.abs(b - c);
    if (da !== db) return da - db; // 越靠中心座次越小
    return b - a; // 同距离:index 大(观众视角右)优先
  });
  const out = new Array<number>(n);
  order.forEach((pos, rank) => {
    out[pos] = rank + 1;
  });
  return out;
}

/* ─── 一排内每个座位的 x 偏移(相对排左);按过道分块 ─── */
function rowXOffsets(count: number, aisles: number): number[] {
  if (count <= 0) return [];
  const blocks = Math.max(1, aisles + 1);
  const perBlock: number[] = [];
  for (let b = 0; b < blocks; b++) {
    perBlock.push(Math.floor(count / blocks) + (b < count % blocks ? 1 : 0));
  }
  const xs: number[] = [];
  let x = 0;
  for (let b = 0; b < blocks; b++) {
    for (let k = 0; k < perBlock[b]; k++) {
      xs.push(x);
      x += SEAT + SEAT_GAP_X;
    }
    if (perBlock[b] > 0) x -= SEAT_GAP_X; // 去掉块末多加的座位间隙
    x += AISLE_W; // 块后过道(最后一块的过道不计入 rowWidth)
  }
  return xs;
}

/** 一排座位总宽(不含末尾过道) */
function rowWidthOf(xs: number[]): number {
  return xs.length ? xs[xs.length - 1] + SEAT : 0;
}

const snap = (v: number): number => snapToGrid(v, GRID);

/* ─── 元素构造(makeElement 拿默认字段再覆盖) ─── */
function mkSeat(x: number, y: number, seatNo: string, fill: string, name: string): SeatElement {
  const s = makeElement("seat") as SeatElement;
  return { ...s, x: snap(x), y: snap(y), width: SEAT, height: SEAT, seatNo, fill, name };
}
function mkDesk(x: number, y: number, w: number): PresidiumElement {
  const p = makeElement("presidium") as PresidiumElement;
  return { ...p, x: snap(x), y: snap(y), width: snap(w), height: PRESIDIUM_H };
}
function mkPodium(x: number, y: number): PodiumElement {
  const p = makeElement("podium") as PodiumElement;
  return { ...p, x: snap(x), y: snap(y), width: PODIUM_W, height: PODIUM_H };
}
function mkBanner(x: number, y: number, w: number, text: string): BannerElement {
  const b = makeElement("banner") as BannerElement;
  return { ...b, x: snap(x), y: snap(y), width: snap(w), height: BANNER_H, text };
}
function mkWall(x: number, y: number, w: number, h: number): WallElement {
  const w0 = makeElement("wall") as WallElement;
  return { ...w0, x: snap(x), y: snap(y), width: snap(w), height: snap(h) };
}
function mkRowLabel(x: number, y: number, text: string): TextElement {
  const t = makeElement("text") as TextElement;
  return {
    ...t,
    x: snap(x),
    y: snap(y),
    width: ROW_LABEL_W,
    height: SEAT,
    text,
    name: text,
    fontSize: 18,
    color: "#9CA3AF",
    textAlign: "center",
  };
}

/* ─── 预览(对话框里显示「将生成 N 个座位 / M 排」) ─── */
export interface LayoutPreview {
  rows: number;
  audienceSeats: number;
  presidiumSeats: number;
  total: number;
}
export function previewLayout(input: Partial<VenueLayoutSpec>): LayoutPreview {
  const spec = { ...DEFAULT_LAYOUT_SPEC, ...input };
  const attendee = Math.max(0, Math.floor(spec.attendeeCount));
  const perRow = Math.max(1, Math.floor(spec.seatsPerRow));
  const presN = Math.max(0, Math.floor(spec.presidiumCount));
  const rows = Math.ceil(attendee / perRow);
  return { rows, audienceSeats: attendee, presidiumSeats: presN, total: attendee + presN };
}

/* ─── 主生成函数 ─── */
export function generateRowLayout(input: Partial<VenueLayoutSpec>): VenueDesignerState {
  const spec = { ...DEFAULT_LAYOUT_SPEC, ...input };
  const attendee = Math.max(0, Math.floor(spec.attendeeCount));
  const perRow = Math.max(1, Math.floor(spec.seatsPerRow));
  const aisles = Math.min(2, Math.max(0, Math.floor(spec.aisles)));
  const presN = Math.max(0, Math.floor(spec.presidiumCount));
  const hasStage = presN > 0;

  // 台下排内偏移 + 行宽
  const xs = rowXOffsets(perRow, aisles);
  const rowWidth = rowWidthOf(xs);

  // 主席台:领导座位排宽 + 长桌宽
  const leaderXs = rowXOffsets(presN, 0);
  const leaderWidth = rowWidthOf(leaderXs);
  const deskWidth = Math.max(leaderWidth + 80, 240);

  // 内容宽 → 画布宽(居中基准)
  const bannerWidth = spec.banner ? Math.max(400, deskWidth + 120, rowWidth * 0.6) : 0;
  const contentWidth = Math.max(rowWidth, deskWidth, bannerWidth);
  const canvasWidth = snap(contentWidth + 2 * MARGIN + 2 * ROW_LABEL_GUTTER);
  const cx = canvasWidth / 2;

  // 预算纵向各区 y
  const topY = MARGIN;
  const leadersY = topY + (spec.banner ? BANNER_H + GAP_BANNER_LEADER : 0);
  const deskY = leadersY + (hasStage ? SEAT + GAP_LEADER_DESK : 0);
  const stageBottom = hasStage ? deskY + PRESIDIUM_H : topY + (spec.banner ? BANNER_H : 0);
  const audienceTop = hasStage
    ? stageBottom + GAP_STAGE_AUDIENCE
    : spec.banner
      ? stageBottom + 40
      : topY;

  const elements: VenueElement[] = [];

  // 1) 背景墙(最底层 → 先 push;覆盖横幅 + 主席台区)
  if (spec.backWall && (hasStage || spec.banner)) {
    const wTop = topY - WALL_PAD;
    const wBottom = (hasStage ? deskY + PRESIDIUM_H : topY + BANNER_H) + WALL_PAD;
    const wWidth = Math.max(contentWidth, deskWidth);
    elements.push(mkWall(cx - wWidth / 2, wTop, wWidth, wBottom - wTop));
  }

  // 2) 横幅
  if (spec.banner) {
    elements.push(mkBanner(cx - bannerWidth / 2, topY, bannerWidth, spec.meetingName || "会议横幅"));
  }

  // 3) 主席台:领导座位(中央向两侧编号)+ 长桌 + 发言席
  if (hasStage) {
    const seatNos = presidiumSeatNos(presN);
    const leaderStartX = cx - leaderWidth / 2;
    for (let i = 0; i < presN; i++) {
      elements.push(
        mkSeat(leaderStartX + leaderXs[i], leadersY, `主${seatNos[i]}`, "#FECACA", `主席台${seatNos[i]}`),
      );
    }
    elements.push(mkDesk(cx - deskWidth / 2, deskY, deskWidth));
    if (spec.podium !== "none") {
      const px =
        spec.podium === "left"
          ? cx - deskWidth / 2 - PODIUM_W - 20
          : cx + deskWidth / 2 + 20;
      elements.push(mkPodium(px, deskY + (PRESIDIUM_H - PODIUM_H) / 2));
    }
  }

  // 4) 台下排式座位(居中,全局编号,过道分块)
  const rows = Math.ceil(attendee / perRow);
  const audienceStartX = cx - rowWidth / 2;
  let lastRowY = audienceTop;
  for (let r = 0; r < rows; r++) {
    const ry = audienceTop + r * (SEAT + ROW_GAP);
    lastRowY = ry;
    const inThisRow = Math.min(perRow, attendee - r * perRow);
    const rowNo = r + 1;
    // 排号标签(两侧)——大会按排找座;座位上只显示排内短号,完整「X排Y号」存 name
    elements.push(mkRowLabel(audienceStartX - ROW_LABEL_GUTTER, ry, `${rowNo}排`));
    elements.push(mkRowLabel(audienceStartX + rowWidth + 16, ry, `${rowNo}排`));
    for (let i = 0; i < inThisRow; i++) {
      const col = i + 1;
      elements.push(mkSeat(audienceStartX + xs[i], ry, String(col), "#DBEAFE", `${rowNo}排${col}号`));
    }
  }

  const canvasHeight = snap((rows > 0 ? lastRowY + SEAT : stageBottom) + MARGIN);

  return {
    elements,
    background: { type: "color", color: "#FFFFFF" },
    canvasWidth,
    canvasHeight,
    gridSize: GRID,
    showGrid: true,
  };
}
