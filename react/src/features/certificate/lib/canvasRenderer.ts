import type {
  CanvasBackground,
  CircleElement,
  DecorBorderElement,
  DesignerElement,
  DesignerState,
  ImageElement,
  LineElement,
  QRCodeElement,
  RectElement,
  StampElement,
  TextElement,
  VariableField,
} from "./designerTypes";
import { replaceVariables } from "./designerUtils";

export interface RenderExtras {
  /** 已加载完成的背景图,由 CanvasStage 预加载后传入。null = 还没好/没图 */
  bgImage?: HTMLImageElement | null;
  /** image / qrcode 元素的图像缓存(key:dataUrl 或 `qr:content:color:bg`) */
  imageCache?: Map<string, HTMLImageElement>;
  /** 预览模式:文本里的 {{label}} 占位符替换成 sampleValue */
  isPreview?: boolean;
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
  const cache = extras.imageCache ?? new Map();
  const isPreview = extras.isPreview ?? false;
  for (const el of state.elements) {
    if (!el.visible) continue;
    renderElement(ctx, el, cache, isPreview, state.variables);
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
  ox = 0,
  oy = 0,
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;

  if (mode === "center") {
    const x = ox + (cw - iw) / 2;
    const y = oy + (ch - ih) / 2;
    ctx.drawImage(img, x, y);
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
    // contain
    if (imgRatio > canvasRatio) {
      dw = cw;
      dh = dw / imgRatio;
    } else {
      dh = ch;
      dw = dh * imgRatio;
    }
  }
  const dx = ox + (cw - dw) / 2;
  const dy = oy + (ch - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function renderElement(
  ctx: CanvasRenderingContext2D,
  el: DesignerElement,
  imageCache: Map<string, HTMLImageElement>,
  isPreview: boolean,
  variables: VariableField[],
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
    case "text":
      renderText(ctx, el, isPreview, variables);
      break;
    case "rect":
      renderRect(ctx, el);
      break;
    case "circle":
      renderCircle(ctx, el);
      break;
    case "line":
      renderLine(ctx, el);
      break;
    case "decor-border":
      renderDecorBorder(ctx, el);
      break;
    case "image":
      renderImageEl(ctx, el, imageCache);
      break;
    case "stamp":
      renderStamp(ctx, el, imageCache);
      break;
    case "qrcode":
      renderQRCode(ctx, el, imageCache);
      break;
  }
  ctx.restore();
}

/* ─── Text ─── */

function renderText(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  isPreview: boolean,
  variables: VariableField[],
): void {
  ctx.font = `${el.fontStyle} ${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
  ctx.fillStyle = el.color;
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign === "center" ? "center" : el.textAlign;

  // 预览模式:把 {{label}} 替换为 sampleValue
  const displayText = isPreview ? replaceVariables(el.text, variables) : el.text;
  const lines = displayText.split("\n");
  const lineHeightPx = el.fontSize * el.lineHeight;
  const totalHeight = lines.length * lineHeightPx;
  let y = el.y + (el.height - totalHeight) / 2;
  const x =
    el.textAlign === "center"
      ? el.x + el.width / 2
      : el.textAlign === "right"
        ? el.x + el.width
        : el.x;

  const indentPx = (el.textIndent ?? 0) * el.fontSize;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 首行缩进:左对齐时正向偏移,右对齐反向偏移,居中对齐不应用
    let lineX = x;
    if (i === 0 && indentPx !== 0) {
      if (el.textAlign === "left") lineX = x + indentPx;
      else if (el.textAlign === "right") lineX = x - indentPx;
      // center 对齐时缩进通常无意义,保持居中
    }
    if (el.strokeColor && el.strokeWidth > 0) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.strokeText(line, lineX, y);
    }
    ctx.fillText(line, lineX, y);
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

/* ─── Line ─── */

function renderLine(ctx: CanvasRenderingContext2D, el: LineElement): void {
  if (!el.color || el.strokeWidth <= 0) return;
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.setLineDash(el.dashed ? [el.strokeWidth * 3, el.strokeWidth * 2] : []);
  const midY = el.y + el.height / 2;
  ctx.beginPath();
  ctx.moveTo(el.x, midY);
  ctx.lineTo(el.x + el.width, midY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ─── Decor Border(装饰边框) ─── */

function renderDecorBorder(
  ctx: CanvasRenderingContext2D,
  el: DecorBorderElement,
): void {
  if (!el.color || el.strokeWidth <= 0) return;
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  const w = el.width;
  const h = el.height;
  const sw = el.strokeWidth;

  switch (el.variant) {
    case "simple":
      ctx.strokeRect(el.x, el.y, w, h);
      break;
    case "double": {
      // 外框 + 内框,中间间距 = strokeWidth * 2
      ctx.strokeRect(el.x, el.y, w, h);
      const gap = sw * 2;
      ctx.lineWidth = Math.max(1, sw / 2);
      ctx.strokeRect(el.x + gap, el.y + gap, w - gap * 2, h - gap * 2);
      break;
    }
    case "ornate": {
      // 外框 + 4 个角的内嵌小三角装饰
      ctx.strokeRect(el.x, el.y, w, h);
      const tri = Math.min(20, Math.min(w, h) / 8);
      ctx.fillStyle = el.color;
      // 左上
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + tri, el.y);
      ctx.lineTo(el.x, el.y + tri);
      ctx.closePath();
      ctx.fill();
      // 右上
      ctx.beginPath();
      ctx.moveTo(el.x + w, el.y);
      ctx.lineTo(el.x + w - tri, el.y);
      ctx.lineTo(el.x + w, el.y + tri);
      ctx.closePath();
      ctx.fill();
      // 右下
      ctx.beginPath();
      ctx.moveTo(el.x + w, el.y + h);
      ctx.lineTo(el.x + w - tri, el.y + h);
      ctx.lineTo(el.x + w, el.y + h - tri);
      ctx.closePath();
      ctx.fill();
      // 左下
      ctx.beginPath();
      ctx.moveTo(el.x, el.y + h);
      ctx.lineTo(el.x + tri, el.y + h);
      ctx.lineTo(el.x, el.y + h - tri);
      ctx.closePath();
      ctx.fill();
      // 内框细线
      ctx.strokeStyle = el.color;
      ctx.lineWidth = 1;
      const pad = sw * 2 + 4;
      ctx.strokeRect(el.x + pad, el.y + pad, w - pad * 2, h - pad * 2);
      break;
    }
  }
}

/* ─── Image ─── */

function renderImageEl(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  cache: Map<string, HTMLImageElement>,
): void {
  if (!el.dataUrl) {
    // 占位框
    ctx.fillStyle = "#F7F8FA";
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeStyle = "#E9E9E9";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    ctx.setLineDash([]);
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("点击属性面板上传图片", el.x + el.width / 2, el.y + el.height / 2);
    return;
  }
  const img = cache.get(el.dataUrl);
  if (!img || !img.complete || img.naturalWidth === 0) return; // 还没加载好
  ctx.save();
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.width, el.height);
  ctx.clip();
  if (el.fillMode === "stretch") {
    ctx.drawImage(img, el.x, el.y, el.width, el.height);
  } else {
    drawImageWithFillMode(
      ctx,
      img,
      el.width,
      el.height,
      el.fillMode === "cover" ? "cover" : "contain",
      el.x,
      el.y,
    );
  }
  ctx.restore();
}

/* ─── Stamp ─── */

const PARTY_EMBLEM_URL = "/party-emblem.png";
export const PARTY_EMBLEM_CACHE_KEY = PARTY_EMBLEM_URL;

function renderStamp(
  ctx: CanvasRenderingContext2D,
  el: StampElement,
  imageCache: Map<string, HTMLImageElement>,
): void {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const r = Math.min(el.width, el.height) / 2 - el.strokeWidth;
  if (r <= 0) return;

  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  // 外圈
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 中心图案 — 党徽尺寸与五角星一致(r*0.32),党徽上移 3px 让视觉重心
  // 跟五角星看起来一致(五角星几何重心略偏下)
  if (el.centerPattern === "star") {
    drawFiveStar(ctx, cx, cy, r * 0.32, el.color);
  } else if (el.centerPattern === "emblem") {
    drawPartyEmblem(ctx, cx, cy - 3, r * 0.32, el.color, imageCache);
  }

  // 顶部弧形文字 — 240° 顶弧,字号 / 距边内缩可被覆盖
  if (el.text) {
    const TOP = -Math.PI / 2;
    const HALF = (Math.PI * 2) / 3;
    const fontSize = el.topTextFontSize && el.topTextFontSize > 0
      ? el.topTextFontSize
      : Math.max(12, Math.min(23, r / 4.2));
    const padding = el.topTextPadding ?? 2;
    const textRadius = r - el.strokeWidth - fontSize * 0.95 - padding;
    if (textRadius > 0) {
      drawArcText(
        ctx,
        el.text,
        cx,
        cy,
        textRadius,
        TOP - HALF,
        TOP + HALF,
        fontSize,
        el.color,
      );
    }
  }

  // 中段一行小字(如"证书专用章")— 仿宋细瘦,字号可被覆盖
  if (el.centerText) {
    const cFont = el.centerTextFontSize && el.centerTextFontSize > 0
      ? el.centerTextFontSize
      : Math.max(12, Math.min(18, r / 5));
    ctx.save();
    ctx.fillStyle = el.color;
    ctx.font = `normal ${cFont}px FangSong, "FangSong_GB2312", STFangsong, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(cx, cy + r * 0.58);
    ctx.scale(0.85, 1);
    ctx.fillText(el.centerText, 0, 0);
    ctx.restore();
  }

  // 底部弧形文字 — 最细最小,140° 底弧,字头朝内,字号/距边内缩可被覆盖
  if (el.bottomText) {
    const BOT = Math.PI / 2;
    const BHALF = (Math.PI * 70) / 180;
    const bFont = el.bottomTextFontSize && el.bottomTextFontSize > 0
      ? el.bottomTextFontSize
      : Math.max(8, Math.min(13, r / 7));
    const bPadding = el.bottomTextPadding ?? 2;
    const bRadius = r - el.strokeWidth - bFont * 0.95 - bPadding;
    if (bRadius > 0) {
      drawArcText(
        ctx,
        el.bottomText,
        cx,
        cy,
        bRadius,
        BOT + BHALF,
        BOT - BHALF,
        bFont,
        el.color,
        true,
      );
    }
  }
}

function drawFiveStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const innerAngle = outerAngle + Math.PI / 5;
    const ox = cx + r * Math.cos(outerAngle);
    const oy = cy + r * Math.sin(outerAngle);
    const ix = cx + r * 0.4 * Math.cos(innerAngle);
    const iy = cy + r * 0.4 * Math.sin(innerAngle);
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 中国共产党党徽 — 优先用 /public/party-emblem.png 图,按颜色 tint 后绘制。
 * 图加载好后:画为印章颜色(锤镰刀剪影)。
 * 图未就绪 / 失败:回退到几何近似绘制(锤头镰刀)。
 */
function drawPartyEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  imageCache: Map<string, HTMLImageElement>,
): void {
  const img = imageCache.get(PARTY_EMBLEM_CACHE_KEY);
  if (img && img.complete && img.naturalWidth > 0) {
    // 把图剪影染成 color(用 offscreen canvas 做 source-in 合成)
    const tinted = getTintedEmblemCanvas(img, color);
    if (tinted) {
      const size = r * 1.9; // 接近圆内切但留一点边距
      ctx.drawImage(tinted, cx - size / 2, cy - size / 2, size, size);
      return;
    }
  }
  // 回退:几何近似
  drawPartyEmblemGeometric(ctx, cx, cy, r, color);
}

/** 缓存按颜色 tint 过的党徽 canvas,避免每帧重做 */
const tintedEmblemCache = new Map<string, HTMLCanvasElement>();

function getTintedEmblemCanvas(
  img: HTMLImageElement,
  color: string,
): HTMLCanvasElement | null {
  const cached = tintedEmblemCache.get(color);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const octx = off.getContext("2d");
  if (!octx) return null;
  octx.drawImage(img, 0, 0);
  octx.globalCompositeOperation = "source-in";
  octx.fillStyle = color;
  octx.fillRect(0, 0, off.width, off.height);
  tintedEmblemCache.set(color, off);
  return off;
}

/** 图片不可用时的回退绘制 — 几何近似(锤头+镰刀) */
function drawPartyEmblemGeometric(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const u = r / 16;
  ctx.beginPath();
  ctx.arc(cx, cy, 14 * u, -Math.PI * 0.55, Math.PI * 0.18, false);
  ctx.arc(cx + 1.2 * u, cy - 0.4 * u, 10.5 * u, Math.PI * 0.18, -Math.PI * 0.55, true);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.6 * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 13 * u, cy + 4 * u);
  ctx.lineTo(cx - 11 * u, cy + 14 * u);
  ctx.stroke();
  ctx.restore();
}

/**
 * 沿圆弧排列文字。印章字风格:细瘦体(仿宋),横向压缩 0.85 让字看起来高挑。
 *
 * flipInward = true 时,字头朝圆心(底弧用,这样字从左到右读起来正);
 * flipInward = false 时,字头朝外(顶弧用)。
 */
function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  fontSize: number,
  color: string,
  flipInward = false,
): void {
  if (text.length === 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `normal ${fontSize}px FangSong, "FangSong_GB2312", STFangsong, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const sweep = endAngle - startAngle;
  const charAngle = sweep / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = startAngle + (i + 0.5) * charAngle;
    const rotation = flipInward ? a - Math.PI / 2 : a + Math.PI / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    ctx.rotate(rotation);
    ctx.scale(0.85, 1);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/* ─── QR Code ─── */

export function getQRCacheKey(el: QRCodeElement): string {
  return `qr:${el.content}:${el.color}:${el.background}`;
}

function renderQRCode(
  ctx: CanvasRenderingContext2D,
  el: QRCodeElement,
  cache: Map<string, HTMLImageElement>,
): void {
  const key = getQRCacheKey(el);
  const img = cache.get(key);
  if (!img || !img.complete || img.naturalWidth === 0) {
    // 占位
    ctx.fillStyle = el.background || "#FFFFFF";
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeStyle = "#E9E9E9";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    ctx.setLineDash([]);
    return;
  }
  // QR 是正方形 — 整张铺到 bbox(可能拉伸,影响不大)
  ctx.drawImage(img, el.x, el.y, el.width, el.height);
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
