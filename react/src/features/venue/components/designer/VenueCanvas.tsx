import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VenueDesignerState, VenueElement } from "../../lib/venueTypes";
import {
  isAspectLocked,
  isRotatable,
  pickElementAt,
  snapToGrid,
} from "../../lib/venueUtils";
import {
  type ResizeHandle,
  cursorForHandle,
  pickHandleAt,
  renderAll,
  renderHandles,
  renderSelectionOverlay,
} from "../../lib/venueRenderer";

interface VenueCanvasProps {
  state: VenueDesignerState;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onElementsChange: (next: VenueElement[]) => void;
  onRecordHistory: () => void;
  isPreview?: boolean;
  zoom?: number;
}

export interface VenueCanvasHandle {
  getMainCanvas: () => HTMLCanvasElement | null;
}

interface ElementSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

type DragMode = "move" | "resize" | "rotate";

interface DragState {
  mode: DragMode;
  movingIds: string[];
  startMouseX: number;
  startMouseY: number;
  originals: Map<string, ElementSnapshot>;
  handle?: ResizeHandle;
  aspectLocked?: boolean;
  centerX?: number;
  centerY?: number;
  startMouseAngle?: number;
}

const MIN_SIZE = 10;

/**
 * 会场图交互画布(fork 自 certificate/components/designer/CanvasStage.tsx)。
 * 双 canvas(主 + overlay),命中测试 + 移动/缩放/旋转。
 * 相对证书版的新增:① 网格吸附(move/resize 时吸附到 gridSize;按住 Alt 临时关闭)
 * ② 区域(zone)不旋转。其余坐标/超采样/handle 逻辑沿用。
 */
export const VenueCanvas = forwardRef<VenueCanvasHandle, VenueCanvasProps>(function VenueCanvas(
  { state, selectedIds, onSelectionChange, onElementsChange, onRecordHistory, isPreview = false, zoom = 1 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<string>("default");
  const [bgImageTick, setBgImageTick] = useState(0);
  const [imageCacheTick, setImageCacheTick] = useState(0);
  const marqueeRef = useRef<{ startX: number; startY: number; additive: boolean; baseIds: string[] } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useImperativeHandle(ref, () => ({ getMainCanvas: () => canvasRef.current }), []);

  /* ── 平面图底图异步预加载 ── */
  useEffect(() => {
    const bg = state.background;
    if (bg.type !== "image" || !bg.imageUrl) {
      bgImageRef.current = null;
      setBgImageTick((t) => t + 1);
      return;
    }
    if (bgImageRef.current && bgImageRef.current.src === bg.imageUrl) return;
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      setBgImageTick((t) => t + 1);
    };
    img.onerror = () => {
      bgImageRef.current = null;
      setBgImageTick((t) => t + 1);
    };
    img.src = bg.imageUrl;
  }, [state.background]);

  /* ── 背景墙(wall)图片异步加载 + 缓存 ── */
  useEffect(() => {
    const wantKeys = new Set<string>();
    for (const el of state.elements) {
      if (el.type === "wall" && el.dataUrl) wantKeys.add(el.dataUrl);
    }
    const cache = imageCacheRef.current;
    let cancelled = false;
    wantKeys.forEach((key) => {
      if (cache.has(key)) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        cache.set(key, img);
        setImageCacheTick((t) => t + 1);
      };
      img.onerror = () => {};
      img.src = key;
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  /* 高分屏 + 缩放超采样 */
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const renderScale = Math.min(4, Math.max(0.1, zoom) * dpr);

  /* ── 主画布重绘 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    renderAll(ctx, state, { bgImage: bgImageRef.current, imageCache: imageCacheRef.current });
  }, [state, bgImageTick, imageCacheTick, renderScale]);

  /* ── overlay:选中框 + handle ── */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (isPreview) return;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    if (selectedIds.length > 0) {
      const selectedElements = selectedIds
        .map((id) => state.elements.find((e) => e.id === id))
        .filter((e): e is VenueElement => Boolean(e));
      for (const el of selectedElements) renderSelectionOverlay(ctx, el);
      if (selectedElements.length === 1) renderHandles(ctx, selectedElements[0], isRotatable(selectedElements[0]));
    }
    // 框选预览(marquee)
    if (marquee && (marquee.w > 0 || marquee.h > 0)) {
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,0.12)";
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.restore();
    }
  }, [state, selectedIds, isPreview, renderScale, marquee]);

  /* ── 坐标转换 ── */
  function toCanvasCoords(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = state.canvasWidth / rect.width;
    const scaleY = state.canvasHeight / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function snapshot(el: VenueElement): ElementSnapshot {
    return { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation };
  }

  /* ── 鼠标 down ── */
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPreview) return;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const shift = e.shiftKey;

    if (selectedIds.length === 1) {
      const sel = state.elements.find((e2) => e2.id === selectedIds[0]);
      if (sel) {
        const h = pickHandleAt(sel, x, y);
        if (h === "rotate" && isRotatable(sel)) {
          startRotate(sel, x, y);
          return;
        }
        if (h && h !== "rotate") {
          startResize(sel, h, x, y);
          return;
        }
      }
    }

    const hit = pickElementAt(state.elements, x, y);
    if (!hit) {
      // 空白处按下 → 框选;松手时框内(按中心点)选中,几乎没动 = 取消选择
      marqueeRef.current = { startX: x, startY: y, additive: shift, baseIds: shift ? selectedIds : [] };
      setMarquee({ x, y, w: 0, h: 0 });
      dragRef.current = null;
      return;
    }

    if (shift) {
      if (selectedIds.includes(hit.id)) {
        onSelectionChange(selectedIds.filter((id) => id !== hit.id));
      } else {
        onSelectionChange([...selectedIds, hit.id]);
      }
      dragRef.current = null;
      return;
    }

    let movingIds: string[];
    if (selectedIds.includes(hit.id)) {
      movingIds = selectedIds;
    } else {
      movingIds = [hit.id];
      onSelectionChange(movingIds);
    }
    startMove(movingIds, x, y);
  }

  function startMove(movingIds: string[], mouseX: number, mouseY: number) {
    onRecordHistory();
    const originals = new Map<string, ElementSnapshot>();
    for (const id of movingIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) originals.set(id, snapshot(el));
    }
    dragRef.current = { mode: "move", movingIds, startMouseX: mouseX, startMouseY: mouseY, originals };
    setIsDragging(true);
  }

  function startResize(el: VenueElement, handle: ResizeHandle, mouseX: number, mouseY: number) {
    onRecordHistory();
    dragRef.current = {
      mode: "resize",
      movingIds: [el.id],
      startMouseX: mouseX,
      startMouseY: mouseY,
      originals: new Map([[el.id, snapshot(el)]]),
      handle,
      aspectLocked: isAspectLocked(el),
    };
    setIsDragging(true);
  }

  function startRotate(el: VenueElement, mouseX: number, mouseY: number) {
    onRecordHistory();
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    dragRef.current = {
      mode: "rotate",
      movingIds: [el.id],
      startMouseX: mouseX,
      startMouseY: mouseY,
      originals: new Map([[el.id, snapshot(el)]]),
      centerX: cx,
      centerY: cy,
      startMouseAngle: Math.atan2(mouseY - cy, mouseX - cx),
    };
    setIsDragging(true);
  }

  /* ── 鼠标 move ── */
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const grid = state.gridSize;
    const snapOn = !e.altKey && grid > 0;

    if (marqueeRef.current) {
      const mq = marqueeRef.current;
      setMarquee({ x: Math.min(mq.startX, x), y: Math.min(mq.startY, y), w: Math.abs(x - mq.startX), h: Math.abs(y - mq.startY) });
      return;
    }

    if (!drag) {
      let cursor = "default";
      if (selectedIds.length === 1) {
        const sel = state.elements.find((e2) => e2.id === selectedIds[0]);
        if (sel) {
          const h = pickHandleAt(sel, x, y);
          if (h === "rotate" && !isRotatable(sel)) cursor = "default";
          else if (h) cursor = cursorForHandle(h);
        }
      }
      if (cursor === "default") {
        const hit = pickElementAt(state.elements, x, y);
        if (hit && !hit.locked) cursor = "move";
      }
      if (cursor !== hoverCursor) setHoverCursor(cursor);
      return;
    }

    if (drag.mode === "move") {
      let dx = x - drag.startMouseX;
      let dy = y - drag.startMouseY;
      if (snapOn) {
        // 以首个元素为锚:把它对齐到网格,再把同样的位移应用到全体(保持相对关系)
        const lead = drag.originals.get(drag.movingIds[0]);
        if (lead) {
          dx = snapToGrid(lead.x + dx, grid) - lead.x;
          dy = snapToGrid(lead.y + dy, grid) - lead.y;
        }
      }
      const next = state.elements.map((el) => {
        const orig = drag.originals.get(el.id);
        if (!orig) return el;
        return { ...el, x: orig.x + dx, y: orig.y + dy };
      });
      onElementsChange(next);
      return;
    }

    if (drag.mode === "rotate") {
      const orig = drag.originals.get(drag.movingIds[0])!;
      const angleNow = Math.atan2(y - drag.centerY!, x - drag.centerX!);
      const deltaDeg = ((angleNow - drag.startMouseAngle!) * 180) / Math.PI;
      let newRotation = (orig.rotation + deltaDeg) % 360;
      if (newRotation < 0) newRotation += 360;
      if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
      const next = state.elements.map((el) =>
        el.id === drag.movingIds[0] ? { ...el, rotation: newRotation } : el,
      );
      onElementsChange(next);
      return;
    }

    if (drag.mode === "resize") {
      const orig = drag.originals.get(drag.movingIds[0])!;
      const handle = drag.handle!;
      const dxS = x - drag.startMouseX;
      const dyS = y - drag.startMouseY;
      let dxL = dxS;
      let dyL = dyS;
      if (orig.rotation !== 0) {
        const rad = -(orig.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        dxL = dxS * cos - dyS * sin;
        dyL = dxS * sin + dyS * cos;
      }

      let nx = orig.x;
      let ny = orig.y;
      let nw = orig.width;
      let nh = orig.height;
      switch (handle) {
        case "nw":
          nx = orig.x + dxL;
          ny = orig.y + dyL;
          nw = orig.width - dxL;
          nh = orig.height - dyL;
          break;
        case "n":
          ny = orig.y + dyL;
          nh = orig.height - dyL;
          break;
        case "ne":
          ny = orig.y + dyL;
          nw = orig.width + dxL;
          nh = orig.height - dyL;
          break;
        case "e":
          nw = orig.width + dxL;
          break;
        case "se":
          nw = orig.width + dxL;
          nh = orig.height + dyL;
          break;
        case "s":
          nh = orig.height + dyL;
          break;
        case "sw":
          nx = orig.x + dxL;
          nw = orig.width - dxL;
          nh = orig.height + dyL;
          break;
        case "w":
          nx = orig.x + dxL;
          nw = orig.width - dxL;
          break;
      }

      if (drag.aspectLocked) {
        const ratio = orig.width / orig.height;
        let useWidth: boolean;
        if (handle === "e" || handle === "w") useWidth = true;
        else if (handle === "n" || handle === "s") useWidth = false;
        else useWidth = Math.abs(nw - orig.width) >= Math.abs(nh - orig.height);
        if (useWidth) nh = nw / ratio;
        else nw = nh * ratio;
        switch (handle) {
          case "nw":
            nx = orig.x + orig.width - nw;
            ny = orig.y + orig.height - nh;
            break;
          case "n":
            nx = orig.x + (orig.width - nw) / 2;
            ny = orig.y + orig.height - nh;
            break;
          case "ne":
            ny = orig.y + orig.height - nh;
            break;
          case "e":
            ny = orig.y + (orig.height - nh) / 2;
            break;
          case "se":
            break;
          case "s":
            nx = orig.x + (orig.width - nw) / 2;
            break;
          case "sw":
            nx = orig.x + orig.width - nw;
            break;
          case "w":
            nx = orig.x + orig.width - nw;
            ny = orig.y + (orig.height - nh) / 2;
            break;
        }
      } else if (snapOn && orig.rotation === 0) {
        // 网格吸附(仅未锁定宽高比 + 未旋转):把位置和尺寸都对齐到网格
        nx = snapToGrid(nx, grid);
        ny = snapToGrid(ny, grid);
        nw = Math.max(grid, snapToGrid(nw, grid));
        nh = Math.max(grid, snapToGrid(nh, grid));
      }

      if (nw < MIN_SIZE) {
        if (handle === "w" || handle === "nw" || handle === "sw") nx = orig.x + orig.width - MIN_SIZE;
        nw = MIN_SIZE;
        if (drag.aspectLocked) nh = MIN_SIZE;
      }
      if (nh < MIN_SIZE) {
        if (handle === "n" || handle === "nw" || handle === "ne") ny = orig.y + orig.height - MIN_SIZE;
        nh = MIN_SIZE;
        if (drag.aspectLocked) nw = MIN_SIZE;
      }

      if (orig.rotation !== 0) {
        const origCx = orig.x + orig.width / 2;
        const origCy = orig.y + orig.height / 2;
        const anchorLocal = oppositeCornerLocal(handle, orig.x, orig.y, orig.width, orig.height);
        const anchorScreen = rotateAround(anchorLocal, origCx, origCy, orig.rotation);
        const newCx = nx + nw / 2;
        const newCy = ny + nh / 2;
        const newAnchorLocal = oppositeCornerLocal(handle, nx, ny, nw, nh);
        const newAnchorScreen = rotateAround(newAnchorLocal, newCx, newCy, orig.rotation);
        nx += anchorScreen.x - newAnchorScreen.x;
        ny += anchorScreen.y - newAnchorScreen.y;
      }

      const next = state.elements.map((el) =>
        el.id === drag.movingIds[0] ? { ...el, x: nx, y: ny, width: nw, height: nh } : el,
      );
      onElementsChange(next);
      return;
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (marqueeRef.current) {
      const mq = marqueeRef.current;
      marqueeRef.current = null;
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const r = { x: Math.min(mq.startX, x), y: Math.min(mq.startY, y), w: Math.abs(x - mq.startX), h: Math.abs(y - mq.startY) };
      setMarquee(null);
      if (r.w > 3 || r.h > 3) {
        const ids = state.elements
          .filter((el) => !el.locked && el.visible !== false && centerInRect(el, r))
          .map((el) => el.id);
        onSelectionChange(mq.additive ? Array.from(new Set([...mq.baseIds, ...ids])) : ids);
      } else if (!mq.additive) {
        onSelectionChange([]);
      }
      dragRef.current = null;
      setIsDragging(false);
      return;
    }
    dragRef.current = null;
    setIsDragging(false);
  }

  function handleMouseLeave() {
    dragRef.current = null;
    marqueeRef.current = null;
    setMarquee(null);
    setIsDragging(false);
    setHoverCursor("default");
  }

  return (
    <div className="relative shadow-lg" style={{ width: state.canvasWidth * zoom, height: state.canvasHeight * zoom }}>
      <canvas
        ref={canvasRef}
        width={Math.round(state.canvasWidth * renderScale)}
        height={Math.round(state.canvasHeight * renderScale)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="block bg-white"
        style={{
          width: state.canvasWidth * zoom,
          height: state.canvasHeight * zoom,
          cursor: isDragging ? "grabbing" : hoverCursor,
        }}
      />
      <canvas
        ref={overlayRef}
        width={Math.round(state.canvasWidth * renderScale)}
        height={Math.round(state.canvasHeight * renderScale)}
        className="absolute inset-0 pointer-events-none"
        style={{ width: state.canvasWidth * zoom, height: state.canvasHeight * zoom }}
      />
    </div>
  );
});

/* ─── resize 锚点 local 坐标(被拖 handle 的对角/对边中点) ─── */
function oppositeCornerLocal(
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

function centerInRect(el: VenueElement, r: { x: number; y: number; w: number; h: number }): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

function rotateAround(
  pt: { x: number; y: number },
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin,
    y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos,
  };
}
