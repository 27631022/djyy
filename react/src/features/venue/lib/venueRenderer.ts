import type {
  AisleElement,
  BannerElement,
  CanvasBackground,
  DoorElement,
  PodiumElement,
  PresidiumElement,
  SeatElement,
  TableRectElement,
  TableRoundElement,
  TextElement,
  VenueDesignerState,
  VenueElement,
  WallElement,
  ZoneElement,
} from "./venueTypes";

export interface RenderExtras {
  /** 已加载完成的平面图底图(CanvasStage 预加载后传入) */
  bgImage?: HTMLImageElement | null;
  /** wall 等元素的图片缓存(key = dataUrl) */
  imageCache?: Map<string, HTMLImageElement>;
}

/* ─── 整体渲染 ─── */

export function renderAll(
  ctx: CanvasRenderingContext2D,
  state: VenueDesignerState,
  extras: RenderExtras = {},
): void {
  ctx.save();
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  renderBackground(ctx, state.background, state.canvasWidth, state.canvasHeight, extras.bgImage ?? null);
  if (state.showGrid) renderGrid(ctx, state.canvasWidth, state.canvasHeight, state.gridSize);
  const cache = extras.imageCache ?? new Map();
  for (const el of state.elements) {
    if (!el.visible) continue;
    renderElement(ctx, el, cache);
  }
  ctx.restore();
}

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grid: number,
): void {
  if (grid <= 0) return;
  ctx.save();
  ctx.strokeStyle = "#EEF0F3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = grid; x < w; x += grid) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = grid; y < h; y += grid) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  bg: CanvasBackground,
  w: number,
  h: number,
  bgImage: HTMLImageElement | null = null,
): void {
  ctx.fillStyle = bg.color ?? "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  if (bg.type === "image" && bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    drawImageWithFillMode(ctx, bgImage, w, h, bg.fillMode ?? "contain");
  }
}

function drawImageWithFillMode(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  mode: "cover" | "contain" | "center",
  ox = 0,
  oy = 0,
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;
  if (mode === "center") {
    ctx.drawImage(img, ox + (cw - iw) / 2, oy + (ch - ih) / 2);
    return;
  }
  const canvasRatio = cw / ch;
  const imgRatio = iw / ih;
  let dw: number;
  let dh: number;
  if (mode === "cover") {
    if (imgRatio > canvasRatio) {
      dh = ch;
      dw = dh * imgRatio;
    } else {
      dw = cw;
      dh = dw / imgRatio;
    }
  } else {
    if (imgRatio > canvasRatio) {
      dw = cw;
      dh = dw / imgRatio;
    } else {
      dh = ch;
      dw = dh * imgRatio;
    }
  }
  ctx.drawImage(img, ox + (cw - dw) / 2, oy + (ch - dh) / 2, dw, dh);
}

function renderElement(
  ctx: CanvasRenderingContext2D,
  el: VenueElement,
  cache: Map<string, HTMLImageElement>,
): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  if (el.rotation !== 0) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  switch (el.type) {
    case "zone":
      renderZone(ctx, el);
      break;
    case "wall":
      renderWall(ctx, el, cache);
      break;
    case "aisle":
      renderAisle(ctx, el);
      break;
    case "door":
      renderDoor(ctx, el);
      break;
    case "table-rect":
      renderTableRect(ctx, el);
      break;
    case "table-round":
      renderTableRound(ctx, el);
      break;
    case "presidium":
      renderBox(ctx, el, true);
      break;
    case "podium":
      renderBox(ctx, el, false);
      break;
    case "seat":
      renderSeat(ctx, el);
      break;
    case "banner":
      renderBanner(ctx, el);
      break;
    case "text":
      renderText(ctx, el);
      break;
  }
  ctx.restore();
}

/* ─── 形状工具 ─── */

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (rr === 0) {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 居中单行/多行文字(自动按 \n 断行) */
function drawCenteredLabel(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; width: number; height: number },
  text: string,
  fontSize: number,
  color: string,
  bold = false,
  fontFamily = '"Microsoft YaHei", system-ui, sans-serif',
): void {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${bold ? "bold" : "normal"} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  const lh = fontSize * 1.3;
  const startY = el.y + el.height / 2 - ((lines.length - 1) * lh) / 2;
  const cx = el.x + el.width / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, startY + i * lh);
  }
  ctx.restore();
}

/* ─── 各元素渲染 ─── */

function renderZone(ctx: CanvasRenderingContext2D, el: ZoneElement): void {
  ctx.save();
  ctx.fillStyle = hexToRgba(el.color, 0.1);
  ctx.fillRect(el.x, el.y, el.width, el.height);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(el.x + 0.75, el.y + 0.75, el.width - 1.5, el.height - 1.5);
  ctx.setLineDash([]);
  // 区域名:左上角标签
  if (el.zoneName) {
    ctx.fillStyle = el.color;
    ctx.font = 'bold 13px "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(el.zoneName, el.x + 6, el.y + 5);
  }
  ctx.restore();
}

function renderWall(
  ctx: CanvasRenderingContext2D,
  el: WallElement,
  cache: Map<string, HTMLImageElement>,
): void {
  ctx.fillStyle = el.fill || "#E7E5E4";
  ctx.fillRect(el.x, el.y, el.width, el.height);
  if (el.dataUrl) {
    const img = cache.get(el.dataUrl);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(el.x, el.y, el.width, el.height);
      ctx.clip();
      drawImageWithFillMode(ctx, img, el.width, el.height, "cover", el.x, el.y);
      ctx.restore();
    }
  }
}

function renderAisle(ctx: CanvasRenderingContext2D, el: AisleElement): void {
  ctx.fillStyle = el.fill || "#EFEFEF";
  ctx.fillRect(el.x, el.y, el.width, el.height);
  ctx.strokeStyle = "#D1D5DB";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(el.x + 0.5, el.y + 0.5, el.width - 1, el.height - 1);
  ctx.setLineDash([]);
  // 中线:国道式黄色「虚实线」(一实一虚),让通道更像道路
  ctx.strokeStyle = "#EAB308";
  ctx.lineWidth = 1.5;
  if (el.width >= el.height) {
    const cy = el.y + el.height / 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(el.x + 8, cy - 2.5);
    ctx.lineTo(el.x + el.width - 8, cy - 2.5);
    ctx.stroke();
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.moveTo(el.x + 8, cy + 2.5);
    ctx.lineTo(el.x + el.width - 8, cy + 2.5);
    ctx.stroke();
  } else {
    const cx = el.x + el.width / 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - 2.5, el.y + 8);
    ctx.lineTo(cx - 2.5, el.y + el.height - 8);
    ctx.stroke();
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.moveTo(cx + 2.5, el.y + 8);
    ctx.lineTo(cx + 2.5, el.y + el.height - 8);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function renderDoor(ctx: CanvasRenderingContext2D, el: DoorElement): void {
  // 简洁门:一个色块 + 标识文字;横向 / 竖向由宽高决定(属性面板可一键切换)
  const color = el.color || "#15803D";
  const label = (el.label && el.label.trim()) || "门";
  pathRoundRect(ctx, el.x, el.y, el.width, el.height, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const fs = Math.max(9, Math.min(15, Math.min(el.width, el.height) * 0.5));
  drawCenteredLabel(ctx, el, label, fs, "#FFFFFF", true);
}

function renderTableRect(ctx: CanvasRenderingContext2D, el: TableRectElement): void {
  pathRoundRect(ctx, el.x, el.y, el.width, el.height, 6);
  ctx.fillStyle = el.fill || "#F5F5F4";
  ctx.fill();
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  drawCenteredLabel(ctx, el, el.label, Math.min(16, el.height / 3), "#57534E");
}

function renderTableRound(ctx: CanvasRenderingContext2D, el: TableRoundElement): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = el.fill || "#F5F5F4";
  ctx.fill();
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  drawCenteredLabel(ctx, el, el.label, Math.min(16, el.height / 4), "#57534E");
}

function renderBox(
  ctx: CanvasRenderingContext2D,
  el: PresidiumElement | PodiumElement,
  bold: boolean,
): void {
  pathRoundRect(ctx, el.x, el.y, el.width, el.height, 4);
  ctx.fillStyle = el.fill;
  ctx.fill();
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
  drawCenteredLabel(ctx, el, el.label, Math.min(20, el.height / 2.2), el.stroke || "#1A1A1A", bold);
}

function renderSeat(ctx: CanvasRenderingContext2D, el: SeatElement): void {
  // 椅子:圆角方块 + 顶部一条"靠背"
  pathRoundRect(ctx, el.x, el.y + el.height * 0.18, el.width, el.height * 0.82, 5);
  ctx.fillStyle = el.fill || "#DBEAFE";
  ctx.fill();
  ctx.strokeStyle = el.reserved ? "#9CA3AF" : "#60A5FA";
  ctx.lineWidth = 1.5;
  if (el.reserved) ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  // 靠背
  pathRoundRect(ctx, el.x + el.width * 0.1, el.y, el.width * 0.8, el.height * 0.28, 3);
  ctx.fillStyle = el.reserved ? "#D1D5DB" : "#93C5FD";
  ctx.fill();
  // 座位号
  if (el.seatNo) {
    ctx.save();
    ctx.fillStyle = "#1E3A8A";
    ctx.font = `bold ${Math.min(13, el.height / 3)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.seatNo, el.x + el.width / 2, el.y + el.height * 0.6);
    ctx.restore();
  }
}

function renderBanner(ctx: CanvasRenderingContext2D, el: BannerElement): void {
  ctx.fillStyle = el.bg || "#C8001E";
  ctx.fillRect(el.x, el.y, el.width, el.height);
  drawCenteredLabel(ctx, el, el.text, el.fontSize, el.color || "#FFFFFF", true, el.fontFamily);
}

function renderText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  if (!el.text) return;
  ctx.save();
  ctx.fillStyle = el.color;
  ctx.font = `${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign;
  const lines = el.text.split("\n");
  const lh = el.fontSize * 1.4;
  const totalH = lines.length * lh;
  let y = el.y + (el.height - totalH) / 2;
  const x = el.textAlign === "center" ? el.x + el.width / 2 : el.textAlign === "right" ? el.x + el.width : el.x;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  ctx.restore();
}

/* ─── 选中框 + handle(单独画在 overlay 上,不进 layoutJson)。
   这些只依赖 base 几何(x/y/width/height/rotation),与证书设计器逻辑一致。 ─── */

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type HandleKind = ResizeHandle | "rotate";

export interface HandlePoint {
  kind: HandleKind;
  x: number;
  y: number;
}

const ROTATE_HANDLE_OFFSET = 24;
const HANDLE_HIT_RADIUS = 7;

export function getHandlePoints(el: VenueElement): HandlePoint[] {
  const local: HandlePoint[] = [
    { kind: "nw", x: el.x, y: el.y },
    { kind: "n", x: el.x + el.width / 2, y: el.y },
    { kind: "ne", x: el.x + el.width, y: el.y },
    { kind: "e", x: el.x + el.width, y: el.y + el.height / 2 },
    { kind: "se", x: el.x + el.width, y: el.y + el.height },
    { kind: "s", x: el.x + el.width / 2, y: el.y + el.height },
    { kind: "sw", x: el.x, y: el.y + el.height },
    { kind: "w", x: el.x, y: el.y + el.height / 2 },
    { kind: "rotate", x: el.x + el.width / 2, y: el.y - ROTATE_HANDLE_OFFSET },
  ];
  if (el.rotation === 0) return local;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return local.map((p) => ({
    kind: p.kind,
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

export function pickHandleAt(el: VenueElement, px: number, py: number): HandleKind | null {
  for (const p of getHandlePoints(el)) {
    if (Math.abs(p.x - px) <= HANDLE_HIT_RADIUS && Math.abs(p.y - py) <= HANDLE_HIT_RADIUS) {
      return p.kind;
    }
  }
  return null;
}

export function renderSelectionOverlay(ctx: CanvasRenderingContext2D, el: VenueElement): void {
  ctx.save();
  if (el.rotation !== 0) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(el.x - 1, el.y - 1, el.width + 2, el.height + 2);
  ctx.restore();
}

export function renderHandles(ctx: CanvasRenderingContext2D, el: VenueElement, rotatable: boolean): void {
  const points = getHandlePoints(el);
  ctx.save();
  if (rotatable) {
    const rotateP = points.find((p) => p.kind === "rotate")!;
    const topCenter = points.find((p) => p.kind === "n")!;
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topCenter.x, topCenter.y);
    ctx.lineTo(rotateP.x, rotateP.y);
    ctx.stroke();
  }
  for (const p of points) {
    if (p.kind === "rotate") continue;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
  }
  if (rotatable) {
    const rotateP = points.find((p) => p.kind === "rotate")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rotateP.x, rotateP.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function cursorForHandle(kind: HandleKind): string {
  switch (kind) {
    case "rotate":
      return "grab";
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}
