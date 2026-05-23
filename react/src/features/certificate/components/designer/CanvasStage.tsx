import { useEffect, useRef, useState } from "react";
import type { DesignerElement, DesignerState } from "../../lib/designerTypes";
import { pickElementAt } from "../../lib/designerUtils";
import { renderAll, renderSelectionOverlay } from "../../lib/canvasRenderer";

interface CanvasStageProps {
  state: DesignerState;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** 拖拽过程的实时位置更新(不进历史) */
  onElementsChange: (next: DesignerElement[]) => void;
  /** 拖拽开始时调用一次 —— 父组件 record 到历史栈 */
  onRecordHistory: () => void;
}

/** 拖拽过程中追踪起点 + 所有移动元素的原始位置 */
interface DragState {
  movingIds: string[];
  startMouseX: number;
  startMouseY: number;
  /** id → original {x, y},mouseMove 时按 delta 计算新位置 */
  originals: Map<string, { x: number; y: number }>;
}

export function CanvasStage({
  state,
  selectedIds,
  onSelectionChange,
  onElementsChange,
  onRecordHistory,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [bgImageTick, setBgImageTick] = useState(0);

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

  /* ── 主画布:state 或背景图加载完成时重绘 ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderAll(ctx, state, { bgImage: bgImageRef.current });
  }, [state, bgImageTick]);

  /* ── overlay:全部选中元素的边框 ── */
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

  /* ── 鼠标交互 ── */
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const hit = pickElementAt(state.elements, x, y);
    const shift = e.shiftKey;

    if (!hit) {
      // 空白:清选区(shift 时不清,保留多选)
      if (!shift) onSelectionChange([]);
      dragRef.current = null;
      return;
    }

    if (shift) {
      // Shift+click:切换该元素在选区里的状态,不开始拖拽
      if (selectedIds.includes(hit.id)) {
        onSelectionChange(selectedIds.filter((id) => id !== hit.id));
      } else {
        onSelectionChange([...selectedIds, hit.id]);
      }
      dragRef.current = null;
      return;
    }

    // 普通 click:
    // - 如果点中的元素已在选区:保持选区,拖动全部选中
    // - 否则:替换为只选中这个,拖动它
    let movingIds: string[];
    if (selectedIds.includes(hit.id)) {
      movingIds = selectedIds;
    } else {
      movingIds = [hit.id];
      onSelectionChange(movingIds);
    }

    // 准备拖拽:记录历史 + 缓存所有要移动元素的原始位置
    onRecordHistory();
    const originals = new Map<string, { x: number; y: number }>();
    for (const id of movingIds) {
      const el = state.elements.find((e) => e.id === id);
      if (el) originals.set(id, { x: el.x, y: el.y });
    }
    dragRef.current = {
      movingIds,
      startMouseX: x,
      startMouseY: y,
      originals,
    };
    setIsDragging(true);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const dx = x - drag.startMouseX;
    const dy = y - drag.startMouseY;
    const next = state.elements.map((el) => {
      const orig = drag.originals.get(el.id);
      if (!orig) return el;
      return { ...el, x: orig.x + dx, y: orig.y + dy };
    });
    onElementsChange(next);
  }

  function handleMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

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
