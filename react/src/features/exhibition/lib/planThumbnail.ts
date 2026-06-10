import type { HallDesignerState } from "./hallTypes";
import { FIXTURE_META, WALL_T, contentBounds } from "./hallUtils";

/**
 * 平面图缩略图(列表卡片用):canvas 2d 画 墙/组件/出生点 → PNG Blob。
 * 上传 storage(ownerModule=exhibition)后把 fileId 存 Hall.thumbnailFileId。
 */
export async function renderPlanThumbnail(state: HallDesignerState, accent: string): Promise<Blob> {
  const W = 480;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FAFAF8";
  ctx.fillRect(0, 0, W, H);

  const b = contentBounds(state);
  const padM = 1.5;
  const spanX = b.maxX - b.minX + padM * 2;
  const spanY = b.maxY - b.minY + padM * 2;
  const scale = Math.min(W / spanX, H / spanY);
  const ox = W / 2 - ((b.minX + b.maxX) / 2) * scale;
  const oy = H / 2 - ((b.minY + b.maxY) / 2) * scale;
  const X = (m: number) => ox + m * scale;
  const Y = (m: number) => oy + m * scale;

  // 地面(包围盒淡填充)
  ctx.fillStyle = "#F1EFEA";
  ctx.fillRect(X(b.minX), Y(b.minY), (b.maxX - b.minX) * scale, (b.maxY - b.minY) * scale);

  // 墙
  ctx.strokeStyle = "#3F3F46";
  ctx.lineWidth = Math.max(2, WALL_T * scale);
  ctx.lineCap = "square";
  for (const w of state.walls) {
    ctx.beginPath();
    ctx.moveTo(X(w.x1), Y(w.y1));
    ctx.lineTo(X(w.x2), Y(w.y2));
    ctx.stroke();
  }

  // 组件(带旋转的色块)
  for (const f of state.fixtures) {
    ctx.save();
    ctx.translate(X(f.x), Y(f.y));
    ctx.rotate((f.rot * Math.PI) / 180);
    ctx.fillStyle = FIXTURE_META[f.type].color;
    ctx.globalAlpha = 0.65;
    ctx.fillRect((-f.w / 2) * scale, (-f.d / 2) * scale, f.w * scale, f.d * scale);
    ctx.restore();
  }

  // 出生点
  if (state.meta.spawn) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(X(state.meta.spawn.x), Y(state.meta.spawn.y), Math.max(3, 0.25 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("缩略图生成失败"))), "image/png");
  });
}
