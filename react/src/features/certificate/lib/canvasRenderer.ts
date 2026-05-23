import type {
  CanvasBackground,
  DesignerElement,
  DesignerState,
  RectElement,
  TextElement,
  CircleElement,
} from "./designerTypes";

export interface RenderExtras {
  /** 已加载完成的背景图,由 CanvasStage 预加载后传入。null = 还没好/没图 */
  bgImage?: HTMLImageElement | null;
}

/**
 * 把整个 DesignerState 渲染到 canvas。
 * 不画选中框/handle —— 那些是 CanvasStage 自己叠加(避免重复保存到 PNG 导出里)
 */
export function renderAll(
  ctx: CanvasRenderingContext2D,
  state: DesignerState,
  extras: RenderExtras = {},
): void {
  ctx.save();
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  renderBackground(
    ctx,
    state.background,
    state.canvasWidth,
    state.canvasHeight,
    extras.bgImage ?? null,
  );
  for (const el of state.elements) {
    if (!el.visible) continue;
    renderElement(ctx, el);
  }
  ctx.restore();
}

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  bg: CanvasBackground,
  w: number,
  h: number,
  bgImage: HTMLImageElement | null = null,
): void {
  // 先画底色 — 即使有图,透明区也会透出底色
  ctx.fillStyle = bg.color ?? "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  if (bg.type === "image" && bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    drawImageWithFillMode(ctx, bgImage, w, h, bg.fillMode ?? "cover");
  }
  // texture 留给 Phase 3 后续
}

function drawImageWithFillMode(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  mode: "cover" | "contain" | "center",
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;

  if (mode === "center") {
    const x = (cw - iw) / 2;
    const y = (ch - ih) / 2;
    ctx.drawImage(img, x, y);
    return;
  }

  const canvasRatio = cw / ch;
  const imgRatio = iw / ih;
  let dw: number;
  let dh: number;
  if (mode === "cover") {
    if (imgRatio > canvasRatio) {
      // 图更宽:按高铺满,横向裁切
      dh = ch;
      dw = dh * imgRatio;
    } else {
      dw = cw;
      dh = dw / imgRatio;
    }
  } else {
    // contain
    if (imgRatio > canvasRatio) {
      dw = cw;
      dh = dw / imgRatio;
    } else {
      dh = ch;
      dw = dh * imgRatio;
    }
  }
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function renderElement(ctx: CanvasRenderingContext2D, el: DesignerElement): void {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  // 旋转:以 bbox 中心为旋转中心
  if (el.rotation !== 0) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  switch (el.type) {
    case "text":
      renderText(ctx, el);
      break;
    case "rect":
      renderRect(ctx, el);
      break;
    case "circle":
      renderCircle(ctx, el);
      break;
  }
  ctx.restore();
}

/* ─── Text ─── */

function renderText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = el.color;
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign === "center" ? "center" : el.textAlign;

  // 多行 — 简单按 \n 分行,不做自动换行(V2 加 word wrap)
  const lines = el.text.split("\n");
  const lineHeightPx = el.fontSize * el.lineHeight;
  const totalHeight = lines.length * lineHeightPx;
  // 垂直居中
  let y = el.y + (el.height - totalHeight) / 2;
  const x =
    el.textAlign === "center"
      ? el.x + el.width / 2
      : el.textAlign === "right"
        ? el.x + el.width
        : el.x;

  for (const line of lines) {
    if (el.strokeColor && el.strokeWidth > 0) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.strokeText(line, x, y);
    }
    ctx.fillText(line, x, y);
    y += lineHeightPx;
  }
}

/* ─── Rect ─── */

function renderRect(ctx: CanvasRenderingContext2D, el: RectElement): void {
  pathRoundRect(ctx, el.x, el.y, el.width, el.height, el.borderRadius);
  if (el.fill) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
}

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

/* ─── Circle / Ellipse ─── */

function renderCircle(ctx: CanvasRenderingContext2D, el: CircleElement): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
  if (el.fill) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
}

/* ─── 选中框 + handle(单独画在 overlay 上,不进 designJson) ─── */

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type HandleKind = ResizeHandle | "rotate";

export interface HandlePoint {
  kind: HandleKind;
  /** 已经应用过旋转的屏幕坐标 */
  x: number;
  y: number;
}

const ROTATE_HANDLE_OFFSET = 24;
const HANDLE_HIT_RADIUS = 7;

/**
 * 计算元素的 8 个 resize handle + 1 个 rotate handle 在画布坐标系的位置
 * (已应用元素自身的旋转,所以可以直接用于 hit test 和 overlay 绘制)
 */
export function getHandlePoints(el: DesignerElement): HandlePoint[] {
  // 本地(未旋转)坐标系下的 8 个角/边中点 + rotate handle
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

/** Hit test:鼠标(画布坐标)是否落在某个 handle 上,返回该 handle 类型 */
export function pickHandleAt(
  el: DesignerElement,
  px: number,
  py: number,
): HandleKind | null {
  const points = getHandlePoints(el);
  for (const p of points) {
    if (
      Math.abs(p.x - px) <= HANDLE_HIT_RADIUS &&
      Math.abs(p.y - py) <= HANDLE_HIT_RADIUS
    ) {
      return p.kind;
    }
  }
  return null;
}

/** 同一 handle 的"对边/对角"屏幕坐标 — resize 时用作不动锚点 */
export function getAnchorPoint(
  el: DesignerElement,
  handle: ResizeHandle,
): { x: number; y: number } {
  const opp = oppositeLocal(handle, el.x, el.y, el.width, el.height);
  if (el.rotation === 0) return opp;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + (opp.x - cx) * cos - (opp.y - cy) * sin,
    y: cy + (opp.x - cx) * sin + (opp.y - cy) * cos,
  };
}

function oppositeLocal(
  handle: ResizeHandle,
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number } {
  switch (handle) {
    case "nw":
      return { x: x + w, y: y + h };
    case "n":
      return { x: x + w / 2, y: y + h };
    case "ne":
      return { x: x, y: y + h };
    case "e":
      return { x: x, y: y + h / 2 };
    case "se":
      return { x: x, y: y };
    case "s":
      return { x: x + w / 2, y: y };
    case "sw":
      return { x: x + w, y: y };
    case "w":
      return { x: x + w, y: y + h / 2 };
  }
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  el: DesignerElement,
): void {
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

/**
 * 单选时画 8 个缩放 handle + 旋转 handle + 连接线。
 * 所有 handle 已经是屏幕坐标(旋转已应用),直接绘制不需要再 ctx.rotate。
 */
export function renderHandles(
  ctx: CanvasRenderingContext2D,
  el: DesignerElement,
): void {
  const points = getHandlePoints(el);
  const rotateP = points.find((p) => p.kind === "rotate")!;
  const topCenter = points.find((p) => p.kind === "n")!;

  ctx.save();
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1;
  // 旋转 handle 连接线
  ctx.beginPath();
  ctx.moveTo(topCenter.x, topCenter.y);
  ctx.lineTo(rotateP.x, rotateP.y);
  ctx.stroke();

  // 8 个 resize handle(白底蓝边小方块)
  for (const p of points) {
    if (p.kind === "rotate") continue;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
  }

  // 旋转 handle(白底蓝边小圆)
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rotateP.x, rotateP.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** handle 类型 → CSS cursor */
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
