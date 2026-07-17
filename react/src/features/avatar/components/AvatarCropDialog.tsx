import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";

const FRAME = 300; // 裁剪框显示边长(px)
const MAX_ZOOM = 4;
const OUT_MAX = 1024; // 裁剪产物最大边长(不放大源图,只在源像素充足时封顶)

/**
 * 方形头像裁剪器:选完图片先进这里 —— 图片可滚轮/滑杆缩放、拖动平移,
 * 方框固定为正方形取景框,确认后把框内区域画到 canvas 导出成新 File 交回上传流程。
 * 任意比例/尺寸的图片都能裁出正方形头像。
 */
export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = 短边正好铺满取景框(cover)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // 图片左上角相对取景框;null = 居中
  const [exporting, setExporting] = useState(false);
  // 拖动过程量只在事件回调里读写,不参与渲染
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // 基准缩放:zoom=1 时图片短边 = 取景框边长
  const s0 = natural ? FRAME / Math.min(natural.w, natural.h) : 1;
  const dispW = natural ? natural.w * s0 * zoom : FRAME;
  const dispH = natural ? natural.h * s0 * zoom : FRAME;

  const clampPos = (x: number, y: number, dw: number, dh: number) => ({
    x: Math.min(0, Math.max(FRAME - dw, x)),
    y: Math.min(0, Math.max(FRAME - dh, y)),
  });
  // 默认位置 = 居中(渲染期派生,无同步 effect)
  const eff = pos ?? clampPos((FRAME - dispW) / 2, (FRAME - dispH) / 2, dispW, dispH);

  // 缩放锚定取景框中心:框中心对应的图片点在缩放前后保持不动
  const applyZoom = (next: number) => {
    if (!natural) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const cx = (FRAME / 2 - eff.x) / (s0 * zoom);
    const cy = (FRAME / 2 - eff.y) / (s0 * zoom);
    const dw = natural.w * s0 * z;
    const dh = natural.h * s0 * z;
    setZoom(z);
    setPos(clampPos(FRAME / 2 - cx * s0 * z, FRAME / 2 - cy * s0 * z, dw, dh));
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    setExporting(true);
    // 取景框映射回源像素:框内区域即裁剪区
    const scale = s0 * zoom;
    const sx = -eff.x / scale;
    const sy = -eff.y / scale;
    const sw = FRAME / scale;
    const side = Math.max(64, Math.min(OUT_MAX, Math.round(sw)));
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExporting(false);
      toast.error("浏览器不支持画布导出");
      return;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, side, side);
    const isPng = file.type === "image/png" || file.type === "image/webp";
    canvas.toBlob(
      (blob) => {
        setExporting(false);
        if (!blob) {
          toast.error("裁剪导出失败,请换一张图片试试");
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, "") || "头像";
        onConfirm(new File([blob], `${base}.${isPng ? "png" : "jpg"}`, { type: blob.type }));
      },
      isPng ? "image/png" : "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !exporting && onCancel()}>
      <DialogContent className="max-w-[360px]">
        <DialogTitle className="text-base">裁剪头像</DialogTitle>
        <div className="text-xs text-slate-400">拖动图片调整位置,滚轮或滑杆缩放,方框内为最终头像</div>
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200"
          style={{ width: FRAME, height: FRAME, cursor: "move" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { px: e.clientX, py: e.clientY, ox: eff.x, oy: eff.y };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setPos(clampPos(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py, dispW, dispH));
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
        >
          {/* draggable=false 防浏览器原生拖图抢走 pointer 事件 */}
          <img
            ref={imgRef}
            src={url}
            alt="待裁剪"
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute left-0 top-0 max-w-none"
            style={{
              width: dispW,
              height: dispH,
              transform: `translate(${eff.x}px, ${eff.y}px)`,
              visibility: natural ? "visible" : "hidden",
            }}
          />
          {!natural && (
            <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">图片加载中…</div>
          )}
          {/* 三分构图参考线 */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white/40" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white/40" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ZoomOut className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="range"
            min={100}
            max={MAX_ZOOM * 100}
            value={Math.round(zoom * 100)}
            onChange={(e) => applyZoom(Number(e.target.value) / 100)}
            disabled={!natural}
            className="w-full accent-[var(--party-primary)]"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!natural || exporting}
            className="rounded-lg bg-[var(--party-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {exporting ? "导出中…" : "确认裁剪"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
