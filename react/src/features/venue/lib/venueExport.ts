import { jsPDF } from "jspdf";
import { renderAll } from "./venueRenderer";
import type { VenueDesignerState } from "./venueTypes";

/** 排座叠加层:座位组色 + 座位人名(导出「已排座」座位图用) */
export interface SeatingOverlay {
  seatFill?: Map<string, string>;
  seatLabel?: Map<string, string>;
}

/** 导出超采样倍率(高 DPI 输出) */
const EXPORT_SCALE = 2;

/**
 * 从主画布生成缩略图(data URL)。保存会场图时调用 —— 列表卡片用 thumbnail 渲染。
 * (copy 自 certificate/lib/exportUtils.ts)
 */
export function generateThumbnail(
  canvas: HTMLCanvasElement,
  maxWidth = 320,
  quality = 0.7,
): string {
  if (canvas.width === 0 || canvas.height === 0) return "";
  const ratio = Math.min(1, maxWidth / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * ratio));
  const h = Math.max(1, Math.round(canvas.height * ratio));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  return off.toDataURL("image/jpeg", quality);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 离屏重渲染(隐藏网格 + 预加载底图/背景墙图)→ 干净的导出画布。
 * 传 overlay 时:座位按组上色(seatFill)、清座号、叠人名(seatLabel)——
 * 复用 SeatingCanvas 的「已排座」绘制,导出带人名的座位安排图。
 */
async function renderStateToCanvas(
  state: VenueDesignerState,
  scale: number,
  overlay?: SeatingOverlay,
): Promise<HTMLCanvasElement> {
  const cache = new Map<string, HTMLImageElement>();
  let bgImage: HTMLImageElement | null = null;
  if (state.background.type === "image" && state.background.imageUrl) {
    bgImage = await loadImage(state.background.imageUrl);
  }
  for (const el of state.elements) {
    if (el.type === "wall" && el.dataUrl && !cache.has(el.dataUrl)) {
      const img = await loadImage(el.dataUrl);
      if (img) cache.set(el.dataUrl, img);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(state.canvasWidth * scale);
  canvas.height = Math.round(state.canvasHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 座位上色(排座导出):同 SeatingCanvas —— 座位填组色、清座号
  const display: VenueDesignerState = overlay?.seatFill
    ? {
        ...state,
        showGrid: false,
        elements: state.elements.map((el) =>
          el.type === "seat"
            ? { ...el, fill: overlay.seatFill!.get(el.id) ?? el.fill, seatNo: "" }
            : el,
        ),
      }
    : { ...state, showGrid: false };
  renderAll(ctx, display, { bgImage, imageCache: cache });

  // 叠人名(排座导出):同 SeatingCanvas 的白字+深描边
  if (overlay?.seatLabel) {
    for (const s of state.elements) {
      if (s.type !== "seat") continue;
      const label = overlay.seatLabel.get(s.id);
      if (!label) continue;
      ctx.save();
      const fs = Math.max(7, Math.min(s.height * 0.42, 14));
      ctx.font = `600 ${fs}px "Microsoft YaHei", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.fillStyle = "#FFFFFF";
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height * 0.58;
      const mw = s.width * 0.92;
      ctx.strokeText(label, cx, cy, mw);
      ctx.fillText(label, cx, cy, mw);
      ctx.restore();
    }
  }
  return canvas;
}

/** 干净缩略图(无网格,预加载图片)→ 小 JPEG data URL。保存时落 VenueLayout.thumbnail。 */
export async function generateVenueThumbnailDataUrl(
  state: VenueDesignerState,
  maxWidth = 320,
  quality = 0.7,
): Promise<string> {
  const scale = Math.min(1, maxWidth / Math.max(1, state.canvasWidth));
  const canvas = await renderStateToCanvas(state, scale);
  if (canvas.width === 0 || canvas.height === 0) return "";
  // 给白底,避免透明区在卡片里发灰
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(canvas, 0, 0);
  return off.toDataURL("image/jpeg", quality);
}

export async function generateVenuePngDataUrl(state: VenueDesignerState): Promise<string> {
  const canvas = await renderStateToCanvas(state, EXPORT_SCALE);
  return canvas.toDataURL("image/png");
}

export async function generateVenuePdfDataUrl(state: VenueDesignerState): Promise<string> {
  const canvas = await renderStateToCanvas(state, EXPORT_SCALE);
  const jpeg = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({
    orientation: state.canvasWidth >= state.canvasHeight ? "landscape" : "portrait",
    unit: "px",
    format: [state.canvasWidth, state.canvasHeight],
  });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  pdf.addImage(jpeg, "JPEG", 0, 0, pw, ph);
  return pdf.output("datauristring");
}

/** 触发浏览器下载一个 data URL */
export function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** 导出「已排座」座位安排图(座位上色 + 人名)→ PNG 或 PDF 的 data URL */
export async function generateSeatingImageDataUrl(
  state: VenueDesignerState,
  overlay: SeatingOverlay,
  format: "png" | "pdf",
): Promise<string> {
  const canvas = await renderStateToCanvas(state, EXPORT_SCALE, overlay);
  if (format === "png") return canvas.toDataURL("image/png");
  const jpeg = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({
    orientation: state.canvasWidth >= state.canvasHeight ? "landscape" : "portrait",
    unit: "px",
    format: [state.canvasWidth, state.canvasHeight],
  });
  pdf.addImage(jpeg, "JPEG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
  return pdf.output("datauristring");
}

/** 桌签上一面的姓名 + 单位/职务(以 cx,cy 为视觉中心) */
function drawDeskName(
  ctx: CanvasRenderingContext2D,
  name: string,
  sub: string,
  cx: number,
  cy: number,
  hPx: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameFs = Math.min(Math.round(hPx * 0.32), 200);
  ctx.font = `bold ${nameFs}px "Microsoft YaHei", system-ui, sans-serif`;
  ctx.fillStyle = "#1A1A1A";
  ctx.fillText(name, cx, cy - (sub ? nameFs * 0.3 : 0), ctx.canvas.width * 0.9);
  if (sub) {
    const subFs = Math.round(nameFs * 0.3);
    ctx.font = `${subFs}px "Microsoft YaHei", system-ui, sans-serif`;
    ctx.fillStyle = "#6B7280";
    ctx.fillText(sub, cx, cy + nameFs * 0.5, ctx.canvas.width * 0.85);
  }
}

/** 渲染一张对折桌签(上半倒置、下半正向,对折后两面都正)→ canvas */
function renderDeskCard(
  p: { name: string; unit?: string; position?: string },
  wPx: number,
  hPx: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = wPx;
  c.height = hPx;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, wPx, hPx);
  // 红边框
  ctx.strokeStyle = "#C8001E";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, wPx - 16, hPx - 16);
  const sub = [p.unit, p.position].filter(Boolean).join(" · ");
  // 下半:正向(对折后朝本人)
  drawDeskName(ctx, p.name, sub, wPx / 2, hPx * 0.75, hPx);
  // 上半:倒置(对折后朝对面)
  ctx.save();
  ctx.translate(wPx / 2, hPx * 0.25);
  ctx.rotate(Math.PI);
  drawDeskName(ctx, p.name, sub, 0, 0, hPx);
  ctx.restore();
  // 中折线
  ctx.strokeStyle = "#D1D5DB";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hPx / 2);
  ctx.lineTo(wPx, hPx / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  return c;
}

/** 批量桌签 PDF:A4 横向,每页 2 个对折桌签;空名单不导出 */
export function exportDeskCardsPdf(
  people: { name: string; unit?: string; position?: string }[],
  filename: string,
): void {
  const list = people.filter((p) => p.name?.trim());
  if (list.length === 0) return;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;
  const perPage = 2;
  const cardH = pageH / perPage;
  const PX_PER_MM = 4; // 渲染分辨率(≈ 1188×420 / 张)
  list.forEach((p, i) => {
    const idx = i % perPage;
    if (i > 0 && idx === 0) pdf.addPage();
    const card = renderDeskCard(p, Math.round(pageW * PX_PER_MM), Math.round(cardH * PX_PER_MM));
    pdf.addImage(card.toDataURL("image/jpeg", 0.92), "JPEG", 0, idx * cardH, pageW, cardH);
  });
  pdf.save(filename);
}
