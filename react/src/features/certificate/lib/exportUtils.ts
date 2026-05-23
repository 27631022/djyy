import { jsPDF } from "jspdf";

/**
 * 触发浏览器下载 — 把 data URL 包成 <a download> 点一下
 */
function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** 从主画布导出 PNG 并触发下载 */
export function exportCanvasAsPNG(
  canvas: HTMLCanvasElement,
  filename: string,
): void {
  const dataUrl = canvas.toDataURL("image/png");
  triggerDownload(dataUrl, filename.endsWith(".png") ? filename : `${filename}.png`);
}

/**
 * 从主画布导出 PDF 并触发下载。
 * 页面尺寸 = 画布像素尺寸(直接 1:1 嵌入,不缩放)。
 * 横/竖排自动按宽高判断。
 */
export function exportCanvasAsPDF(
  canvas: HTMLCanvasElement,
  filename: string,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const dataUrl = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * 从主画布生成缩略图(data URL).
 * 保存模板时调用 — 列表页用 thumbnail 字段渲染卡片预览。
 */
export function generateThumbnail(
  canvas: HTMLCanvasElement,
  maxWidth = 300,
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
  // 缩放抗锯齿质量
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // 给缩略图一个白底,避免透明画布在卡片里显示成棋盘
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  // JPEG 压缩率小,适合缩略图
  return off.toDataURL("image/jpeg", quality);
}
