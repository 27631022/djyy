import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type {
  DesignerElement,
  DesignerState,
  QRCodeElement,
} from "../../lib/designerTypes";
import { isAspectLocked, pickElementAt } from "../../lib/designerUtils";
import {
  type ResizeHandle,
  cursorForHandle,
  getQRCacheKey,
  pickHandleAt,
  renderAll,
  renderHandles,
  renderSelectionOverlay,
} from "../../lib/canvasRenderer";

interface CanvasStageProps {
  state: DesignerState;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onElementsChange: (next: DesignerElement[]) => void;
  onRecordHistory: () => void;
  /** 预览模式:文本变量替换为 sampleValue,隐藏选中框/handle */
  isPreview?: boolean;
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
  /** move 时可能多个,resize/rotate 单元素 */
  movingIds: string[];
  startMouseX: number;
  startMouseY: number;
  originals: Map<string, ElementSnapshot>;
  /** resize 专用 */
  handle?: ResizeHandle;
  /** resize 锁定宽高比(印章 / 二维码 强制 1:1) */
  aspectLocked?: boolean;
  /** rotate 专用 */
  centerX?: number;
  centerY?: number;
  startMouseAngle?: number;
}

const MIN_SIZE = 10;

export function CanvasStage({
  state,
  selectedIds,
  onSelectionChange,
  onElementsChange,
  onRecordHistory,
  isPreview = false,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  /** image/qrcode 元素的图像缓存(key:dataUrl 或 `qr:content:color:bg`) */
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<string>("default");
  const [bgImageTick, setBgImageTick] = useState(0);
  /** image/qr 加载完成时 ++ 触发重绘 */
  const [imageCacheTick, setImageCacheTick] = useState(0);

  /* ── 背景图异步预加载 ── */
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

  /* ── image / qrcode 元素的异步加载 + 缓存 ── */
  useEffect(() => {
    const wantKeys = new Map<string, "image" | "qr">();
    const qrSources = new Map<string, QRCodeElement>();
    for (const el of state.elements) {
      if (el.type === "image" && el.dataUrl) wantKeys.set(el.dataUrl, "image");
      if (el.type === "qrcode" && el.content) {
        const k = getQRCacheKey(el);
        wantKeys.set(k, "qr");
        qrSources.set(k, el);
      }
    }
    const cache = imageCacheRef.current;
    let cancelled = false;
    wantKeys.forEach((kind, key) => {
      if (cache.has(key)) return;
      if (kind === "image") {
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          cache.set(key, img);
          setImageCacheTick((t) => t + 1);
        };
        img.onerror = () => {};
        img.src = key; // dataUrl
      } else {
        const el = qrSources.get(key);
        if (!el) return;
        QRCode.toDataURL(el.content || " ", {
          color: { dark: el.color || "#000000", light: el.background || "#FFFFFF" },
          width: 256,
          margin: 1,
          errorCorrectionLevel: "M",
        })
          .then((dataUrl) => {
            if (cancelled) return;
            const img = new Image();
            img.onload = () => {
              if (cancelled) return;
              cache.set(key, img);
              setImageCacheTick((t) => t + 1);
            };
            img.src = dataUrl;
          })
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  /* ── 主画布:state / 背景图 / 元素图加载完成时重绘 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderAll(ctx, state, {
      bgImage: bgImageRef.current,
      imageCache: imageCacheRef.current,
      isPreview,
    });
  }, [state, bgImageTick, imageCacheTick, isPreview]);

  /* ── overlay:选中框 + handle(预览模式下隐藏) ── */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (isPreview || selectedIds.length === 0) return;
    const selectedElements = selectedIds
      .map((id) => state.elements.find((e) => e.id === id))
      .filter((e): e is DesignerElement => Boolean(e));
    for (const el of selectedElements) renderSelectionOverlay(ctx, el);
    if (selectedElements.length === 1) renderHandles(ctx, selectedElements[0]);
  }, [state, selectedIds, isPreview]);

  /* ── 坐标转换 ── */
  function toCanvasCoords(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function snapshot(el: DesignerElement): ElementSnapshot {
    return {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
    };
  }

  /* ── 鼠标 down ── */
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPreview) return; // 预览模式下不可编辑
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const shift = e.shiftKey;

    // 1. 单选时优先检查 handle
    if (selectedIds.length === 1) {
      const sel = state.elements.find((e2) => e2.id === selectedIds[0]);
      if (sel) {
        const h = pickHandleAt(sel, x, y);
        if (h === "rotate") {
          startRotate(sel, x, y);
          return;
        }
        if (h) {
          startResize(sel, h, x, y);
          return;
        }
      }
    }

    // 2. 元素 hit test
    const hit = pickElementAt(state.elements, x, y);
    if (!hit) {
      if (!shift) onSelectionChange([]);
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

    // 普通 click 拖动
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
    dragRef.current = {
      mode: "move",
      movingIds,
      startMouseX: mouseX,
      startMouseY: mouseY,
      originals,
    };
    setIsDragging(true);
  }

  function startResize(
    el: DesignerElement,
    handle: ResizeHandle,
    mouseX: number,
    mouseY: number,
  ) {
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

  function startRotate(el: DesignerElement, mouseX: number, mouseY: number) {
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

    if (!drag) {
      // 非拖拽:更新 hover cursor
      let cursor = "default";
      if (selectedIds.length === 1) {
        const sel = state.elements.find((e2) => e2.id === selectedIds[0]);
        if (sel) {
          const h = pickHandleAt(sel, x, y);
          if (h) cursor = cursorForHandle(h);
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
      const dx = x - drag.startMouseX;
      const dy = y - drag.startMouseY;
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
      // Shift 吸附 15°
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
      // 屏幕 delta → 元素 LOCAL frame
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

      // 锁定宽高比(印章 / 二维码):按 handle 类型决定哪个维度跟随,
      // 并重新计算 x/y 让锚点(对边/对角)在 LOCAL 空间不动
      if (drag.aspectLocked) {
        const ratio = orig.width / orig.height; // 1:1 时 ratio=1
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
      }

      // 最小尺寸约束:抑制宽/高小于 MIN 的同时,锁住 anchor 那一侧
      if (nw < MIN_SIZE) {
        if (handle === "w" || handle === "nw" || handle === "sw") {
          nx = orig.x + orig.width - MIN_SIZE;
        }
        nw = MIN_SIZE;
        if (drag.aspectLocked) nh = MIN_SIZE;
      }
      if (nh < MIN_SIZE) {
        if (handle === "n" || handle === "nw" || handle === "ne") {
          ny = orig.y + orig.height - MIN_SIZE;
        }
        nh = MIN_SIZE;
        if (drag.aspectLocked) nw = MIN_SIZE;
      }

      // 旋转元素:保持"对角(锚点)"屏幕位置不变 — 否则 resize 会带"漂移"感
      if (orig.rotation !== 0) {
        const origCx = orig.x + orig.width / 2;
        const origCy = orig.y + orig.height / 2;
        const anchorLocal = oppositeCornerLocal(
          handle,
          orig.x,
          orig.y,
          orig.width,
          orig.height,
        );
        const anchorScreen = rotateAround(anchorLocal, origCx, origCy, orig.rotation);
        const newCx = nx + nw / 2;
        const newCy = ny + nh / 2;
        const newAnchorLocal = oppositeCornerLocal(handle, nx, ny, nw, nh);
        const newAnchorScreen = rotateAround(
          newAnchorLocal,
          newCx,
          newCy,
          orig.rotation,
        );
        nx += anchorScreen.x - newAnchorScreen.x;
        ny += anchorScreen.y - newAnchorScreen.y;
      }

      const next = state.elements.map((el) =>
        el.id === drag.movingIds[0]
          ? { ...el, x: nx, y: ny, width: nw, height: nh }
          : el,
      );
      onElementsChange(next);
      return;
    }
  }

  function handleMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  function handleMouseLeave() {
    dragRef.current = null;
    setIsDragging(false);
    setHoverCursor("default");
  }

  return (
    <div
      className="relative shadow-lg"
      style={{ width: state.canvasWidth, height: state.canvasHeight }}
    >
      <canvas
        ref={canvasRef}
        width={state.canvasWidth}
        height={state.canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="block bg-white"
        style={{ cursor: isDragging ? "grabbing" : hoverCursor }}
      />
      <canvas
        ref={overlayRef}
        width={state.canvasWidth}
        height={state.canvasHeight}
        className="absolute inset-0 pointer-events-none"
      />
    </div>
  );
}

/* ─── 辅助:resize 时的"锚点"local 坐标(被拖 handle 的对角/对边中点) ─── */
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

