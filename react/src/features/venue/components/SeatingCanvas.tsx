import { useEffect, useRef, useState } from "react";
import type { VenueDesignerState, SeatElement, ZoneElement } from "../lib/venueTypes";
import { renderAll } from "../lib/venueRenderer";

/**
 * 排座 / 划区 画布(只读底图 + 叠加层,不复用编辑器 VenueCanvas)。
 *
 * 两种模式:
 *   - mode="arrange"(默认):座位按组上色 + 人名;点座位选中,拖一个座位到另一个 = 两人对调。
 *   - mode="drawZone":在座次图上拖出矩形 = 一个方案专属区域(回调 onDrawZone)。
 *
 * 区域(zones,方案专属)在两种模式都渲染:半透明色块 + 边框 + 组名标签。
 * 坐标/超采样沿用 VenueCanvas:canvas 逻辑像素 = 画布尺寸 × renderScale(zoom×dpr),
 * ctx.setTransform 后按画布坐标绘制;client→canvas 用 canvasWidth/rect.width 换算。
 */
interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface SeatingCanvasProps {
  state: VenueDesignerState;
  zoom: number;
  /** 方案专属区域:渲染为色块 + 组名标签(zoneName 存的就是组名) */
  zones?: ZoneElement[];
  /** seatId → 座位底色(arrange 模式) */
  seatFill?: Map<string, string>;
  /** seatId → 人名(arrange 模式) */
  seatLabel?: Map<string, string>;
  /** 锁定(钉死)的座位 id 集合:画 🔒 角标,区别自动排座 */
  lockedSeatIds?: Set<string>;
  selectedSeatId?: string | null;
  mode?: "arrange" | "drawZone" | "setAnchor";
  /** 中心参照点(尊位基准),渲染为「中心」目标标记 */
  anchor?: { x: number; y: number } | null;
  onSeatClick?: (seatId: string) => void;
  onSwap?: (fromSeatId: string, toSeatId: string) => void;
  onDrawZone?: (rect: DrawRect) => void;
  /** 从外部(未排名单)把人拖放进座位 */
  onDropToSeat?: (seatId: string) => void;
  /** setAnchor 模式点击 → 设定中心参照点 */
  onSetAnchor?: (pt: { x: number; y: number }) => void;
}

export function SeatingCanvas({
  state,
  zoom,
  zones = [],
  seatFill,
  seatLabel,
  lockedSeatIds,
  selectedSeatId = null,
  mode = "arrange",
  anchor = null,
  onSeatClick,
  onSwap,
  onDrawZone,
  onDropToSeat,
  onSetAnchor,
}: SeatingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [bgTick, setBgTick] = useState(0);
  const [imgTick, setImgTick] = useState(0);
  const dragRef = useRef<{ from: string; moved: boolean } | null>(null);
  const [dragHover, setDragHover] = useState<string | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<DrawRect | null>(null);

  /* 平面图底图预加载 */
  useEffect(() => {
    const bg = state.background;
    if (bg.type !== "image" || !bg.imageUrl) {
      // 无底图:state.background 已变 → 主重绘 effect(deps 含 state)自会重跑,无需同步 tick
      bgImageRef.current = null;
      return;
    }
    if (bgImageRef.current && bgImageRef.current.src === bg.imageUrl) return;
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      setBgTick((t) => t + 1);
    };
    img.onerror = () => {
      bgImageRef.current = null;
      setBgTick((t) => t + 1);
    };
    img.src = bg.imageUrl;
  }, [state.background]);

  /* 背景墙图片预加载 + 缓存 */
  useEffect(() => {
    const want = new Set<string>();
    for (const el of state.elements) if (el.type === "wall" && el.dataUrl) want.add(el.dataUrl);
    const cache = imageCacheRef.current;
    let cancelled = false;
    want.forEach((key) => {
      if (cache.has(key)) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          cache.set(key, img);
          setImgTick((t) => t + 1);
        }
      };
      img.onerror = () => {};
      img.src = key;
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const renderScale = Math.min(4, Math.max(0.1, zoom) * dpr);

  /* 重绘:底图 + 区域 + 人名 + 高亮 / 画框预览 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

    const display: VenueDesignerState = {
      ...state,
      showGrid: false,
      elements: state.elements.map((el) =>
        el.type === "seat" ? { ...el, fill: seatFill?.get(el.id) ?? el.fill, seatNo: "" } : el,
      ),
    };
    renderAll(ctx, display, { bgImage: bgImageRef.current, imageCache: imageCacheRef.current });

    // 方案专属区域:色块 + 边框 + 组名
    for (const z of zones) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = z.color || "#3B82F6";
      ctx.fillRect(z.x, z.y, z.width, z.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = z.color || "#3B82F6";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(z.x + 1, z.y + 1, z.width - 2, z.height - 2);
      ctx.setLineDash([]);
      if (z.zoneName) {
        ctx.fillStyle = z.color || "#3B82F6";
        ctx.font = 'bold 14px "Microsoft YaHei", system-ui, sans-serif';
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(z.zoneName, z.x + 7, z.y + 6);
      }
      ctx.restore();
    }

    // 人名(arrange)
    const seats = state.elements.filter((e): e is SeatElement => e.type === "seat");
    if (seatLabel) {
      for (const s of seats) {
        const label = seatLabel.get(s.id);
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

    // 锁定角标(钉死的座):右上角 🔒,区别自动排座
    if (lockedSeatIds && lockedSeatIds.size) {
      for (const s of seats) {
        if (!lockedSeatIds.has(s.id)) continue;
        ctx.save();
        ctx.font = `${Math.max(9, Math.min(s.height * 0.4, 13))}px system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("🔒", s.x + s.width - 1, s.y + 1);
        ctx.restore();
      }
    }

    // 选中 / 拖拽目标高亮(arrange)
    const drawBox = (id: string, color: string, dash: boolean) => {
      const s = seats.find((x) => x.id === id);
      if (!s) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      if (dash) ctx.setLineDash([5, 3]);
      ctx.strokeRect(s.x - 1.5, s.y - 1.5, s.width + 3, s.height + 3);
      ctx.restore();
    };
    if (mode === "arrange") {
      if (selectedSeatId) drawBox(selectedSeatId, "#C8001E", false);
      if (dragHover && dragHover !== dragRef.current?.from) drawBox(dragHover, "#F59E0B", true);
    }

    // 画框预览(drawZone)
    if (mode === "drawZone" && drawRect && (drawRect.width > 2 || drawRect.height > 2)) {
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,0.12)";
      ctx.fillRect(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
      ctx.restore();
    }

    // 中心参照点标记(尊位基准):红色目标 + 「中心」
    if (anchor) {
      const ax = anchor.x;
      const ay = anchor.y;
      ctx.save();
      ctx.strokeStyle = "#DC2626";
      ctx.fillStyle = "#DC2626";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 14, ay);
      ctx.lineTo(ax + 14, ay);
      ctx.moveTo(ax, ay - 14);
      ctx.lineTo(ax, ay + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 12px "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.strokeText("中心", ax, ay - 13);
      ctx.fillStyle = "#DC2626";
      ctx.fillText("中心", ax, ay - 13);
      ctx.restore();
    }
  }, [state, zones, seatFill, seatLabel, lockedSeatIds, selectedSeatId, mode, dragHover, drawRect, renderScale, bgTick, imgTick, anchor]);

  function toCanvasCoords(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (state.canvasWidth / rect.width),
      y: (clientY - rect.top) * (state.canvasHeight / rect.height),
    };
  }
  function pickSeat(x: number, y: number): string | null {
    const seats = state.elements.filter((e): e is SeatElement => e.type === "seat");
    for (let i = seats.length - 1; i >= 0; i--) {
      const s = seats[i];
      if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) return s.id;
    }
    return null;
  }
  function normRect(ax: number, ay: number, bx: number, by: number): DrawRect {
    return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
  }

  function onDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    if (mode === "setAnchor") {
      onSetAnchor?.({ x: Math.round(x), y: Math.round(y) });
      return;
    }
    if (mode === "drawZone") {
      drawStartRef.current = { x, y };
      setDrawRect({ x, y, width: 0, height: 0 });
      return;
    }
    const id = pickSeat(x, y);
    dragRef.current = id ? { from: id, moved: false } : null;
  }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    if (mode === "drawZone") {
      if (!drawStartRef.current) return;
      setDrawRect(normRect(drawStartRef.current.x, drawStartRef.current.y, x, y));
      return;
    }
    if (!dragRef.current) return;
    dragRef.current.moved = true;
    const id = pickSeat(x, y);
    if (id !== dragHover) setDragHover(id);
  }
  function onUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    if (mode === "drawZone") {
      const start = drawStartRef.current;
      drawStartRef.current = null;
      setDrawRect(null);
      if (!start) return;
      const r = normRect(start.x, start.y, x, y);
      if (r.width >= 12 && r.height >= 12) onDrawZone?.(r);
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    setDragHover(null);
    if (!drag) return;
    const target = pickSeat(x, y);
    if (!drag.moved || !target || target === drag.from) {
      onSeatClick?.(drag.from);
      return;
    }
    onSwap?.(drag.from, target);
  }
  function onLeave() {
    dragRef.current = null;
    drawStartRef.current = null;
    setDragHover(null);
    setDrawRect(null);
  }
  // 外部拖入(未排名单 → 座位):dragover 必须 preventDefault 才允许 drop
  function onDragOverCanvas(e: React.DragEvent<HTMLCanvasElement>) {
    if (!onDropToSeat) return;
    e.preventDefault();
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const id = pickSeat(x, y);
    if (id !== dragHover) setDragHover(id);
  }
  function onDropCanvas(e: React.DragEvent<HTMLCanvasElement>) {
    if (!onDropToSeat) return;
    e.preventDefault();
    const { x, y } = toCanvasCoords(e.clientX, e.clientY);
    const id = pickSeat(x, y);
    setDragHover(null);
    if (id) onDropToSeat(id);
  }

  return (
    <div className="shadow-lg" style={{ width: state.canvasWidth * zoom, height: state.canvasHeight * zoom }}>
      <canvas
        ref={canvasRef}
        width={Math.round(state.canvasWidth * renderScale)}
        height={Math.round(state.canvasHeight * renderScale)}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
        onDragOver={onDragOverCanvas}
        onDrop={onDropCanvas}
        onDragLeave={() => { if (onDropToSeat) setDragHover(null); }}
        className={`block bg-white ${mode === "drawZone" || mode === "setAnchor" ? "cursor-crosshair" : "cursor-pointer"}`}
        style={{ width: state.canvasWidth * zoom, height: state.canvasHeight * zoom }}
      />
    </div>
  );
}
