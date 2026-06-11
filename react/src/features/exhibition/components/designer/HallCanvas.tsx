import { useEffect, useRef, useState } from "react";
import type {
  CanvasTool,
  Fixture,
  HallDesignerState,
  Selection,
  Text3dContent,
  Wall,
} from "../../lib/hallTypes";
import {
  FIXTURE_META,
  M2U,
  WALL_T,
  contentBounds,
  facingOf,
  makeFixture,
  rotFromFacing,
  round2,
  snapFixtureToWall,
  snapTo,
  snapWallPoint,
  uid,
  wallLength,
} from "../../lib/hallUtils";

interface HallCanvasProps {
  state: HallDesignerState;
  selection: Selection;
  tool: CanvasTool;
  accent: string;
  onSelectionChange: (s: Selection) => void;
  onToolChange: (t: CanvasTool) => void;
  /** 拖拽中间态(不进历史) */
  onStateChange: (next: HallDesignerState) => void;
  /** 动作开始前打历史检查点 */
  onRecordHistory: () => void;
}

interface ViewBox {
  x: number;
  y: number;
  w: number; // svg 单位宽;高按容器纵横比推
}

type DragState =
  | { kind: "pan"; startClient: { x: number; y: number }; startView: ViewBox }
  | { kind: "fixture"; id: string; grabDx: number; grabDy: number; moved: boolean }
  | { kind: "wall"; id: string; start: { x: number; y: number }; orig: Wall; moved: boolean }
  | { kind: "wall-end"; id: string; end: 1 | 2; moved: boolean }
  | { kind: "rotate"; id: string; moved: boolean }
  | { kind: "spawn"; moved: boolean }
  | { kind: "maybe-deselect"; startClient: { x: number; y: number } };

const VIEW_MIN_W = 4 * M2U;
const VIEW_MAX_W = 300 * M2U;

/** 文字等屏幕定长元素的换算:svg单位/px */
function unitsPerPx(view: ViewBox, containerW: number): number {
  return containerW > 0 ? view.w / containerW : 1;
}

/** 按内容包围盒算适配视野(纯函数;挂载时容器未知则用估计纵横比) */
function fitView(state: HallDesignerState, aspect: number): ViewBox {
  const b = contentBounds(state);
  const padM = 2.5;
  const w = (b.maxX - b.minX + padM * 2) * M2U;
  const h = (b.maxY - b.minY + padM * 2) * M2U;
  const needW = Math.max(w, h * aspect, 8 * M2U);
  return {
    x: ((b.minX + b.maxX) / 2) * M2U - needW / 2,
    y: ((b.minY + b.maxY) / 2) * M2U - needW / aspect / 2,
    w: needW,
  };
}

/** text_3d 是否当前为贴墙安装(决定拖动时是否吸墙) */
function isWallMounted(f: Fixture): boolean {
  if (f.type === "text_3d") {
    const c = f.source.content as Text3dContent | null | undefined;
    return (c?.mount ?? "wall") === "wall";
  }
  return FIXTURE_META[f.type].wallMount;
}

/**
 * 2D 平面图画布(SVG)。坐标:米 × M2U = viewBox 单位,原点在平面图中心。
 * 交互:滚轮缩放(指向光标)/ 空白左拖或中键平移 / select 移动·旋转 / wall 连续画墙 / stamp 放置组件。
 */
export function HallCanvas({
  state,
  selection,
  tool,
  accent,
  onSelectionChange,
  onToolChange,
  onStateChange,
  onRecordHistory,
}: HallCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // 挂载时数据已就绪(父组件 key 重挂载),直接按内容适配初始视野
  const [view, setView] = useState<ViewBox>(() => fitView(state, 4 / 3));
  const [size, setSize] = useState({ w: 800, h: 600 });
  /** 画墙锚点(链上一点);null = 未起笔 */
  const [wallAnchor, setWallAnchor] = useState<{ x: number; y: number } | null>(null);
  /** 光标处的米坐标(画墙预览 / stamp 幽灵) */
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /** 平移中(光标样式;不读 dragRef 渲染) */
  const [panning, setPanning] = useState(false);

  const gridM = state.meta.gridM ?? 0.5;

  /* ── 容器尺寸跟踪(ResizeObserver 注册后立即回调一次,无需手动初始化) ── */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToContent = () => {
    const aspect = size.w > 0 && size.h > 0 ? size.w / size.h : 4 / 3;
    setView(fitView(state, aspect));
  };

  const viewH = size.w > 0 ? (view.w * size.h) / size.w : view.w * 0.75;
  const upp = unitsPerPx(view, size.w);

  /* ── 屏幕坐标 → 米 ── */
  function toMeters(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x / M2U, y: pt.y / M2U };
  }

  /* ── 滚轮缩放(以光标为锚;React onWheel 是 passive 无法 preventDefault → 原生监听) ── */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.88 : 1.14;
      setView((v) => {
        const nw = Math.max(VIEW_MIN_W, Math.min(VIEW_MAX_W, v.w * factor));
        if (nw === v.w) return v;
        const rect = svg.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / rect.width;
        const fy = (e.clientY - rect.top) / rect.height;
        const vh = (v.w * size.h) / size.w;
        const nh = (nw * size.h) / size.w;
        return { x: v.x + (v.w - nw) * fx, y: v.y + (vh - nh) * fy, w: nw };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [size.w, size.h]);

  /* ── 画墙:点击落点 ── */
  function commitWallPoint(mx: number, my: number) {
    let p = snapWallPoint(state.walls, mx, my, gridM);
    if (wallAnchor) {
      // 正交吸附:接近水平/垂直(7°内)自动拉直
      const dx = p.x - wallAnchor.x;
      const dy = p.y - wallAnchor.y;
      const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
      if (ang < 7) p = { x: p.x, y: wallAnchor.y };
      else if (ang > 83) p = { x: wallAnchor.x, y: p.y };
      if (Math.hypot(p.x - wallAnchor.x, p.y - wallAnchor.y) >= 0.2) {
        onRecordHistory();
        onStateChange({
          ...state,
          walls: [...state.walls, { id: uid("w"), x1: wallAnchor.x, y1: wallAnchor.y, x2: p.x, y2: p.y }],
        });
      }
    }
    setWallAnchor(p);
  }

  /* ── 根 SVG 鼠标事件 ── */
  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const m = toMeters(e.clientX, e.clientY);
    if (e.button === 1) {
      // 中键平移(任意工具)
      e.preventDefault();
      dragRef.current = { kind: "pan", startClient: { x: e.clientX, y: e.clientY }, startView: view };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    if (tool.mode === "wall") {
      commitWallPoint(m.x, m.y);
      return;
    }
    if (tool.mode === "stamp") {
      placeStamp(m.x, m.y);
      return;
    }
    // select:空白处按下 → 可能是点击取消选择,也可能拖动平移
    dragRef.current = { kind: "maybe-deselect", startClient: { x: e.clientX, y: e.clientY } };
  }

  function placeStamp(mx: number, my: number) {
    if (tool.mode !== "stamp") return;
    const meta = FIXTURE_META[tool.type];
    let fx = makeFixture(tool.type, snapTo(mx, 0.1), snapTo(my, 0.1), 0, tool.preset);
    if (meta.wallMount || tool.type === "text_3d") {
      const snap = snapFixtureToWall(state.walls, tool.type, mx, my, fx.d);
      if (snap) fx = { ...fx, ...snap };
    }
    onRecordHistory();
    onStateChange({ ...state, fixtures: [...state.fixtures, fx] });
    onSelectionChange({ kind: "fixture", id: fx.id });
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const m = toMeters(e.clientX, e.clientY);
    setCursor(m);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === "pan" || drag.kind === "maybe-deselect") {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      if (drag.kind === "maybe-deselect") {
        if (Math.hypot(dx, dy) < 4) return; // 还看不出是拖
        dragRef.current = { kind: "pan", startClient: drag.startClient, startView: view };
        setPanning(true);
        return;
      }
      setView({ x: drag.startView.x - dx * upp, y: drag.startView.y - dy * upp, w: drag.startView.w });
      return;
    }

    if (drag.kind === "fixture") {
      const f = state.fixtures.find((x) => x.id === drag.id);
      if (!f) return;
      drag.moved = true;
      let nx = snapTo(m.x - drag.grabDx, 0.1);
      let ny = snapTo(m.y - drag.grabDy, 0.1);
      let nrot = f.rot;
      if (isWallMounted(f) && !e.altKey) {
        const snap = snapFixtureToWall(state.walls, f.type, m.x - drag.grabDx, m.y - drag.grabDy, f.d);
        if (snap) {
          nx = snap.x;
          ny = snap.y;
          nrot = snap.rot;
        }
      }
      onStateChange({
        ...state,
        fixtures: state.fixtures.map((x) => (x.id === drag.id ? { ...x, x: nx, y: ny, rot: nrot } : x)),
      });
      return;
    }

    if (drag.kind === "rotate") {
      const f = state.fixtures.find((x) => x.id === drag.id);
      if (!f) return;
      drag.moved = true;
      const raw = rotFromFacing(m.x - f.x, m.y - f.y);
      const step = e.shiftKey ? 1 : 15;
      const rot = ((Math.round(raw / step) * step) % 360 + 360) % 360;
      onStateChange({
        ...state,
        fixtures: state.fixtures.map((x) => (x.id === drag.id ? { ...x, rot } : x)),
      });
      return;
    }

    if (drag.kind === "wall-end") {
      const w = state.walls.find((x) => x.id === drag.id);
      if (!w) return;
      drag.moved = true;
      const p = snapWallPoint(
        state.walls.filter((x) => x.id !== drag.id),
        m.x,
        m.y,
        gridM,
      );
      const patch = drag.end === 1 ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y };
      onStateChange({ ...state, walls: state.walls.map((x) => (x.id === drag.id ? { ...x, ...patch } : x)) });
      return;
    }

    if (drag.kind === "wall") {
      drag.moved = true;
      const dx = snapTo(m.x - drag.start.x, gridM);
      const dy = snapTo(m.y - drag.start.y, gridM);
      onStateChange({
        ...state,
        walls: state.walls.map((x) =>
          x.id === drag.id
            ? { ...x, x1: round2(drag.orig.x1 + dx), y1: round2(drag.orig.y1 + dy), x2: round2(drag.orig.x2 + dx), y2: round2(drag.orig.y2 + dy) }
            : x,
        ),
      });
      return;
    }

    if (drag.kind === "spawn") {
      drag.moved = true;
      const spawn = { ...(state.meta.spawn ?? { x: 0, y: 0, rot: 0 }), x: snapTo(m.x, 0.1), y: snapTo(m.y, 0.1) };
      onStateChange({ ...state, meta: { ...state.meta, spawn } });
      return;
    }
  }

  function handleSvgMouseUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    if (!drag) return;
    if (drag.kind === "maybe-deselect") {
      onSelectionChange(null); // 纯点击空白 → 取消选择
    }
  }

  /* ── 画墙的快捷收笔 ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") {
        if (wallAnchor) {
          setWallAnchor(null);
          e.stopPropagation();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [wallAnchor]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    if (tool.mode === "wall") {
      if (wallAnchor) setWallAnchor(null);
      else onToolChange({ mode: "select" });
    } else if (tool.mode === "stamp") {
      onToolChange({ mode: "select" });
    }
  }

  /* ── 元素按下(select 工具) ── */
  function fixtureMouseDown(e: React.MouseEvent, f: Fixture) {
    if (tool.mode !== "select" || e.button !== 0) return;
    e.stopPropagation();
    const m = toMeters(e.clientX, e.clientY);
    onSelectionChange({ kind: "fixture", id: f.id });
    onRecordHistory();
    dragRef.current = { kind: "fixture", id: f.id, grabDx: m.x - f.x, grabDy: m.y - f.y, moved: false };
  }
  /** 组件上右键 = 旋转 90°(用户要的快捷调向;不冒泡到画布的「退出工具」) */
  function fixtureContextMenu(e: React.MouseEvent, f: Fixture) {
    e.preventDefault();
    e.stopPropagation();
    if (tool.mode !== "select") return;
    onSelectionChange({ kind: "fixture", id: f.id });
    onRecordHistory();
    onStateChange({
      ...state,
      fixtures: state.fixtures.map((x) => (x.id === f.id ? { ...x, rot: (x.rot + 90) % 360 } : x)),
    });
  }
  function wallMouseDown(e: React.MouseEvent, w: Wall) {
    if (tool.mode !== "select" || e.button !== 0) return;
    e.stopPropagation();
    const m = toMeters(e.clientX, e.clientY);
    onSelectionChange({ kind: "wall", id: w.id });
    onRecordHistory();
    dragRef.current = { kind: "wall", id: w.id, start: m, orig: { ...w }, moved: false };
  }
  function wallEndMouseDown(e: React.MouseEvent, w: Wall, end: 1 | 2) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onRecordHistory();
    dragRef.current = { kind: "wall-end", id: w.id, end, moved: false };
  }
  function rotateMouseDown(e: React.MouseEvent, f: Fixture) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onRecordHistory();
    dragRef.current = { kind: "rotate", id: f.id, moved: false };
  }
  function spawnMouseDown(e: React.MouseEvent) {
    if (tool.mode !== "select" || e.button !== 0) return;
    e.stopPropagation();
    onSelectionChange({ kind: "spawn" });
    onRecordHistory();
    dragRef.current = { kind: "spawn", moved: false };
  }

  /* ── 渲染辅助 ── */
  const fontPx = (px: number) => px * upp;
  const cursorStyle =
    tool.mode === "wall" || tool.mode === "stamp" ? "crosshair" : panning ? "grabbing" : "default";

  /* 画墙预览(锚点→光标,带正交吸附展示) */
  let wallPreview: { x1: number; y1: number; x2: number; y2: number; len: number } | null = null;
  if (tool.mode === "wall" && wallAnchor && cursor) {
    let p = snapWallPoint(state.walls, cursor.x, cursor.y, gridM);
    const dx = p.x - wallAnchor.x;
    const dy = p.y - wallAnchor.y;
    const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (ang < 7) p = { x: p.x, y: wallAnchor.y };
    else if (ang > 83) p = { x: wallAnchor.x, y: p.y };
    wallPreview = { x1: wallAnchor.x, y1: wallAnchor.y, x2: p.x, y2: p.y, len: Math.hypot(p.x - wallAnchor.x, p.y - wallAnchor.y) };
  }

  /* stamp 幽灵(preset 变体带各自尺寸) */
  let ghost: { x: number; y: number; rot: number; type: Fixture["type"]; w: number; d: number } | null = null;
  if (tool.mode === "stamp" && cursor) {
    const meta = FIXTURE_META[tool.type];
    const gw = tool.preset?.w ?? meta.w;
    const gd = tool.preset?.d ?? meta.d;
    let g = { x: snapTo(cursor.x, 0.1), y: snapTo(cursor.y, 0.1), rot: 0 };
    if (meta.wallMount || tool.type === "text_3d") {
      const snap = snapFixtureToWall(state.walls, tool.type, cursor.x, cursor.y, gd);
      if (snap) g = snap;
    }
    ghost = { ...g, type: tool.type, w: gw, d: gd };
  }

  const spawn = state.meta.spawn;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden select-none" style={{ cursor: cursorStyle }}>
      <svg
        ref={svgRef}
        className="w-full h-full block bg-[#FAFAF8]"
        viewBox={`${view.x} ${view.y} ${view.w} ${viewH}`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => {
          if (tool.mode === "wall") setWallAnchor(null);
        }}
      >
        <defs>
          <pattern id="hall-grid" width={gridM * M2U} height={gridM * M2U} patternUnits="userSpaceOnUse">
            <path d={`M ${gridM * M2U} 0 L 0 0 0 ${gridM * M2U}`} fill="none" stroke="#E7E5E0" strokeWidth={upp} />
          </pattern>
          <pattern id="hall-grid-major" width={5 * M2U} height={5 * M2U} patternUnits="userSpaceOnUse">
            <path d={`M ${5 * M2U} 0 L 0 0 0 ${5 * M2U}`} fill="none" stroke="#D6D3CC" strokeWidth={upp * 1.4} />
          </pattern>
        </defs>

        {/* 网格(铺满当前视野) */}
        <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="url(#hall-grid)" />
        <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="url(#hall-grid-major)" />
        {/* 原点十字 */}
        <line x1={-M2U * 0.4} y1={0} x2={M2U * 0.4} y2={0} stroke="#C0BDB6" strokeWidth={upp * 1.5} />
        <line x1={0} y1={-M2U * 0.4} x2={0} y2={M2U * 0.4} stroke="#C0BDB6" strokeWidth={upp * 1.5} />

        {/* ── 墙 ── */}
        {state.walls.map((w) => {
          const sel = selection?.kind === "wall" && selection.id === w.id;
          return (
            <g key={w.id}>
              <line
                x1={w.x1 * M2U} y1={w.y1 * M2U} x2={w.x2 * M2U} y2={w.y2 * M2U}
                stroke={sel ? accent : "#3F3F46"}
                strokeWidth={WALL_T * M2U}
                strokeLinecap="square"
              />
              {/* 加宽透明命中带 */}
              <line
                x1={w.x1 * M2U} y1={w.y1 * M2U} x2={w.x2 * M2U} y2={w.y2 * M2U}
                stroke="transparent"
                strokeWidth={Math.max(WALL_T * M2U, 12 * upp)}
                style={{ cursor: tool.mode === "select" ? "move" : undefined }}
                onMouseDown={(e) => wallMouseDown(e, w)}
              />
              {sel && (
                <>
                  {/* 长度标注 */}
                  <text
                    x={((w.x1 + w.x2) / 2) * M2U}
                    y={((w.y1 + w.y2) / 2) * M2U - 10 * upp}
                    fontSize={fontPx(12)}
                    fill={accent}
                    textAnchor="middle"
                    style={{ pointerEvents: "none", fontWeight: 600 }}
                  >
                    {wallLength(w).toFixed(2)} m
                  </text>
                  {/* 端点手柄 */}
                  {([1, 2] as const).map((end) => (
                    <circle
                      key={end}
                      cx={(end === 1 ? w.x1 : w.x2) * M2U}
                      cy={(end === 1 ? w.y1 : w.y2) * M2U}
                      r={6 * upp}
                      fill="#fff"
                      stroke={accent}
                      strokeWidth={2 * upp}
                      style={{ cursor: "grab" }}
                      onMouseDown={(e) => wallEndMouseDown(e, w, end)}
                    />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {/* ── 组件 ── */}
        {state.fixtures.map((f) => {
          const meta = FIXTURE_META[f.type];
          const sel = selection?.kind === "fixture" && selection.id === f.id;
          const W = f.w * M2U;
          const D = f.d * M2U;
          return (
            <g key={f.id} transform={`translate(${f.x * M2U} ${f.y * M2U}) rotate(${f.rot})`}>
              <rect
                x={-W / 2} y={-D / 2} width={W} height={D}
                rx={3 * upp}
                fill={meta.color}
                fillOpacity={f.type === "door" ? 0.25 : 0.55}
                stroke={sel ? accent : meta.color}
                strokeWidth={(sel ? 2.5 : 1.2) * upp}
                strokeDasharray={f.type === "door" ? `${6 * upp} ${4 * upp}` : undefined}
                style={{ cursor: tool.mode === "select" ? "move" : undefined }}
                onMouseDown={(e) => fixtureMouseDown(e, f)}
                onContextMenu={(e) => fixtureContextMenu(e, f)}
              />
              {/* 朝向小三角(指向正面 = 本地 -Y) */}
              <path
                d={`M 0 ${-D / 2 - 9 * upp} L ${-5 * upp} ${-D / 2 - 2 * upp} L ${5 * upp} ${-D / 2 - 2 * upp} Z`}
                fill={sel ? accent : meta.color}
                style={{ pointerEvents: "none" }}
              />
              {/* 标签 */}
              <text
                x={0} y={D / 2 + 14 * upp}
                fontSize={fontPx(11)}
                fill="#52525B"
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {f.label || meta.label}
              </text>
              {/* 旋转手柄 */}
              {sel && tool.mode === "select" && (
                <>
                  <line x1={0} y1={-D / 2} x2={0} y2={-D / 2 - 26 * upp} stroke={accent} strokeWidth={1.5 * upp} style={{ pointerEvents: "none" }} />
                  <circle
                    cx={0} cy={-D / 2 - 32 * upp} r={7 * upp}
                    fill="#fff" stroke={accent} strokeWidth={2 * upp}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => rotateMouseDown(e, f)}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* ── 出生点 ── */}
        {spawn && (
          <g
            transform={`translate(${spawn.x * M2U} ${spawn.y * M2U})`}
            onMouseDown={spawnMouseDown}
            style={{ cursor: tool.mode === "select" ? "move" : undefined }}
          >
            <circle
              r={0.28 * M2U}
              fill={accent}
              fillOpacity={0.25}
              stroke={accent}
              strokeWidth={(selection?.kind === "spawn" ? 2.5 : 1.5) * upp}
            />
            {(() => {
              const fdir = facingOf(spawn.rot ?? 0);
              return (
                <line
                  x1={0} y1={0}
                  x2={fdir.x * 0.55 * M2U} y2={fdir.y * 0.55 * M2U}
                  stroke={accent} strokeWidth={2.5 * upp}
                  markerEnd="none"
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}
            <text y={0.62 * M2U + fontPx(10)} fontSize={fontPx(10)} fill={accent} textAnchor="middle" style={{ pointerEvents: "none" }}>
              出生点
            </text>
          </g>
        )}

        {/* ── 画墙预览 ── */}
        {wallPreview && (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={wallPreview.x1 * M2U} y1={wallPreview.y1 * M2U}
              x2={wallPreview.x2 * M2U} y2={wallPreview.y2 * M2U}
              stroke={accent} strokeWidth={WALL_T * M2U} strokeOpacity={0.5} strokeLinecap="square"
            />
            <text
              x={((wallPreview.x1 + wallPreview.x2) / 2) * M2U}
              y={((wallPreview.y1 + wallPreview.y2) / 2) * M2U - 10 * upp}
              fontSize={fontPx(12)} fill={accent} textAnchor="middle" fontWeight={600}
            >
              {wallPreview.len.toFixed(2)} m
            </text>
          </g>
        )}
        {tool.mode === "wall" && wallAnchor && (
          <circle cx={wallAnchor.x * M2U} cy={wallAnchor.y * M2U} r={5 * upp} fill={accent} style={{ pointerEvents: "none" }} />
        )}

        {/* ── stamp 幽灵 ── */}
        {ghost && (() => {
          const meta = FIXTURE_META[ghost.type];
          const W = ghost.w * M2U;
          const D = ghost.d * M2U;
          return (
            <g transform={`translate(${ghost.x * M2U} ${ghost.y * M2U}) rotate(${ghost.rot})`} style={{ pointerEvents: "none" }}>
              <rect x={-W / 2} y={-D / 2} width={W} height={D} rx={3 * upp} fill={meta.color} fillOpacity={0.3} stroke={meta.color} strokeWidth={1.5 * upp} strokeDasharray={`${5 * upp} ${4 * upp}`} />
              <path d={`M 0 ${-D / 2 - 9 * upp} L ${-5 * upp} ${-D / 2 - 2 * upp} L ${5 * upp} ${-D / 2 - 2 * upp} Z`} fill={meta.color} fillOpacity={0.6} />
            </g>
          );
        })()}
      </svg>

      {/* 视图工具(右下角) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/95 border border-[#E9E9E9] rounded-full shadow px-2 py-1 text-xs text-[#6B7280]">
        <button className="px-1.5 py-0.5 hover:text-[var(--party-primary)]" title="缩小" onClick={() => setView((v) => ({ ...v, w: Math.min(VIEW_MAX_W, v.w * 1.25) }))}>−</button>
        <span className="tabular-nums w-12 text-center">{Math.round((M2U / upp / M2U) * 100)}%</span>
        <button className="px-1.5 py-0.5 hover:text-[var(--party-primary)]" title="放大" onClick={() => setView((v) => ({ ...v, w: Math.max(VIEW_MIN_W, v.w / 1.25) }))}>+</button>
        <div className="w-px h-3.5 bg-[#E9E9E9] mx-0.5" />
        <button className="px-1.5 py-0.5 hover:text-[var(--party-primary)]" onClick={fitToContent}>适应</button>
      </div>

      {/* 工具提示(左下角) */}
      <div className="absolute bottom-3 left-3 text-[11px] text-[#9CA3AF] bg-white/90 rounded px-2 py-1 border border-[#F0F0F0] pointer-events-none">
        {tool.mode === "wall"
          ? wallAnchor
            ? "点击落下一段 · 双击/Esc/右键 收笔 · 自动正交与端点吸附"
            : "点击起笔画墙(0.5m 网格吸附)· 右键退出"
          : tool.mode === "stamp"
            ? `点击放置「${FIXTURE_META[tool.type].label}」· 贴墙组件自动吸附 · 右键/Esc 退出`
            : "滚轮缩放 · 空白拖动平移 · 点选编辑 · 右键组件旋转90° · Alt 拖动取消吸墙"}
      </div>
    </div>
  );
}
