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

/* ─── 选中框(CanvasStage 单独画在 overlay 上,不进 designJson) ─── */

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
  // 主选中框
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.strokeRect(el.x - 1, el.y - 1, el.width + 2, el.height + 2);
  ctx.restore();
}
