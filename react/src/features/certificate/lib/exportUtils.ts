/**
 * 从主画布生成缩略图(data URL).
 * 保存模板时调用 — 列表页用 thumbnail 字段渲染卡片预览。
 *
 * 注:证书的高清 PNG/PDF 导出统一走 lib/certificatePdf.ts 的
 * generateCertificatePngDataUrl / generateCertificatePdfDataUrl(按 EXPORT_SCALE 超采样)。
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
