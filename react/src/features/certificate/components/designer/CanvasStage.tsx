import { useEffect, useRef, useState } from "react";
import type { DesignerElement, DesignerState } from "../../lib/designerTypes";
import { pickElementAt } from "../../lib/designerUtils";
import { renderAll, renderSelectionOverlay } from "../../lib/canvasRenderer";

interface CanvasStageProps {
  state: DesignerState;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onElementsChange: (next: DesignerElement[]) => void;
}

/** 拖拽过程中追踪起点(放 ref 不放 state,避免每帧 re-render) */
interface DragState {
  elementId: string;
  /** 鼠标按下时的画布坐标 */
  startMouseX: number;
  startMouseY: number;
  /** 元素按下时的位置 */
  startElX: number;
  startElY: number;
}

export function CanvasStage({
  state,
  selectedIds,
  onSelectionChange,
  onElementsChange,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  /** cursor 反馈用,不影响渲染主流程 */
  const [isDragging, setIsDragging] = useState(false);
  /** 背景图加载完成时 +1 触发重绘 */
  const [bgImageTick, setBgImageTick] = useState(0);

  /* ── 背景图异步预加载 ── */
  useEffect(() => {
    const bg = state.background;
    if (bg.type !== "image" || !bg.imageUrl) {
      bgImageRef.current = null;
      setBgImageTick((t) => t + 1);
      return;
    }
    // 同一张图已加载好则不重复
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

  /* ── 主画布:state 或背景图加载完成时重绘 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderAll(ctx, state, { bgImage: bgImageRef.current });
  }, [state, bgImageTick]);

  /* ── overlay:选中框 ── */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) renderSelectionOverlay(ctx, el);
    }
  }, [state, selectedIds]);

  /* ── 鼠标坐标 → 画布内部坐标(考虑 CSS 缩放) ── */
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

  /* ── 鼠标交互 ── */
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const hit = pickElementAt(state.elements, x, y);

    if (hit) {
      // 单击未选中的元素 → 替换选区;已选中且 shift 键 → 取消(Phase C 完整多选)
      if (!selectedIds.includes(hit.id)) {
        onSelectionChange([hit.id]);
      }
      dragRef.current = {
        elementId: hit.id,
        startMouseX: x,
        startMouseY: y,
        startElX: hit.x,
        startElY: hit.y,
      };
      setIsDragging(true);
    } else {
      // 空白:清选区
      onSelectionChange([]);
      dragRef.current = null;
      setIsDragging(false);
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const dx = x - drag.startMouseX;
    const dy = y - drag.startMouseY;
    const next = state.elements.map((el) =>
      el.id === drag.elementId
        ? { ...el, x: drag.startElX + dx, y: drag.startElY + dy }
        : el,
    );
    onElementsChange(next);
  }

  function handleMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  /* 鼠标离开画布时也终止拖拽,避免外部移动看不到反馈 */
  function handleMouseLeave() {
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      className="relative shadow-lg"
      style={{
        width: state.canvasWidth,
        height: state.canvasHeight,
      }}
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
        style={{ cursor: isDragging ? "grabbing" : "default" }}
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
