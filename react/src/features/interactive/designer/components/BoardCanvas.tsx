import { useRef, useState } from "react";
import { toast } from "sonner";
import { interactiveFileUrl } from "../../api";
import { pointAtT, projectToRoute } from "../../lib/routeMath";
import { getCheckpointUi, CHECKPOINT_UI_LIST } from "../../checkpoints/registry";
import { type RouteRaceDesign } from "../designTypes";

/** 画布工具模式(照 HallCanvas 的 CanvasTool):选择 / 画路线 / 放置关卡 */
export type CanvasTool = "select" | "route" | "place:quiz" | "place:spot";

export type DesignSelection = { type: "point"; idx: number } | { type: "checkpoint"; id: string } | null;

const MAX_ROUTE_POINTS = 64;
/** 新放关卡与既有关卡的最小 t 间距(挤在一起后端 gate 会 +1 修正,编辑器先推开保持直觉) */
const MIN_CP_GAP = 0.02;

interface Props {
  design: RouteRaceDesign;
  tool: CanvasTool;
  setTool: (t: CanvasTool) => void;
  selection: DesignSelection;
  setSelection: (s: DesignSelection) => void;
  /** 动作前存档(useHistory.record) */
  record: () => void;
  /** 静默更新(拖拽中间态不进历史) */
  update: (fn: (d: RouteRaceDesign) => RouteRaceDesign) => void;
  /** 动作 = record + update(一次性变更) */
  commit: (fn: (d: RouteRaceDesign) => RouteRaceDesign) => void;
}

/**
 * 游戏中场景画布:背景图(aspect-ratio 容器)+ SVG 路线(% 即坐标)+ HTML 手柄层。
 * SVG viewBox="0 0 100 100" preserveAspectRatio="none" 会非均匀缩放 —— 线用
 * vector-effect="non-scaling-stroke" 防描边拉扁,圆点/关卡手柄放 HTML 层(照 raceFrameEditor)。
 */
export function BoardCanvas({ design, tool, setTool, selection, setSelection, record, update, commit }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  // recorded:历史存档延迟到**首次真实移动**时才做 —— 纯点选(down+up 未动)不产生空历史条目,
  // 否则连续点选几个对象就把 50 条历史挤掉、Ctrl+Z 表现为「按了没反应」(对抗审查抓到)
  const dragRef = useRef<
    { type: "point"; idx: number; recorded: boolean } | { type: "checkpoint"; id: string; recorded: boolean } | null
  >(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const { board } = design;
  const route = board.route;
  const bgUrl = board.backgroundFileId ? interactiveFileUrl(board.backgroundFileId) : null;
  const ratio = board.bgSize ? `${board.bgSize.w} / ${board.bgSize.h}` : "16 / 9";
  const drawing = tool === "route";
  const placing = tool === "place:quiz" || tool === "place:spot";

  const posOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // ── 画布空白处按下:按工具分派(照 HallCanvas.handleSvgMouseDown) ──
  const onBoxPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // 手柄各自处理
    if (e.button === 2) return; // 右键交给 onContextMenu(收笔)
    const p = posOf(e);
    if (!p) return;
    if (drawing) {
      if (route.length >= MAX_ROUTE_POINTS) {
        toast.warning(`路线最多 ${MAX_ROUTE_POINTS} 个点`);
        return;
      }
      commit((d) => ({ ...d, board: { ...d.board, route: [...d.board.route, { x: round2(p.x), y: round2(p.y) }] } }));
      return;
    }
    if (placing) {
      if (route.length < 2) {
        toast.warning("先用「画路线」画出行进路线,再放关卡");
        return;
      }
      if (design.board.checkpoints.length >= 20) {
        toast.warning("关卡最多 20 个");
        return;
      }
      const kind = tool === "place:quiz" ? "quiz" : "spot";
      const ui = getCheckpointUi(kind);
      if (!ui) return;
      let { t } = projectToRoute(route, p.x, p.y);
      t = Math.min(1, Math.max(MIN_CP_GAP, t));
      // 与既有关卡挤在同一位置时向后推开(保持编辑直觉;后端 gate 还会兜底修正)
      const taken = design.board.checkpoints.map((c) => c.t).sort((a, b) => a - b);
      while (taken.some((x) => Math.abs(x - t) < MIN_CP_GAP) && t < 1) t = Math.min(1, t + MIN_CP_GAP);
      const cp = ui.makeDefault(round2(t * 100) / 100);
      commit((d) => ({ ...d, board: { ...d.board, checkpoints: [...d.board.checkpoints, cp] } }));
      setSelection({ type: "checkpoint", id: cp.id });
      setTool("select");
      return;
    }
    setSelection(null);
  };

  const startPointDrag = (e: React.PointerEvent, idx: number) => {
    if (tool !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { type: "point", idx, recorded: false };
    setSelection({ type: "point", idx });
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };
  const startCpDrag = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { type: "checkpoint", id, recorded: false };
    setSelection({ type: "checkpoint", id });
    boxRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = posOf(e);
    if (!p) return;
    if (drawing || placing) setCursor(p);
    const d = dragRef.current;
    if (!d) return;
    if (!d.recorded) {
      record(); // 首次真实移动才存档(见 dragRef 注释)
      d.recorded = true;
    }
    if (d.type === "point") {
      update((dz) => ({
        ...dz,
        board: { ...dz.board, route: dz.board.route.map((pt, i) => (i === d.idx ? { x: round2(p.x), y: round2(p.y) } : pt)) },
      }));
    } else {
      const { t } = projectToRoute(route, p.x, p.y);
      const tt = Math.round(Math.min(1, Math.max(MIN_CP_GAP, t)) * 10000) / 10000;
      update((dz) => ({
        ...dz,
        board: { ...dz.board, checkpoints: dz.board.checkpoints.map((c) => (c.id === d.id ? { ...c, t: tt } : c)) },
      }));
    }
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const insertMidpoint = (i: number) => {
    if (route.length >= MAX_ROUTE_POINTS) {
      toast.warning(`路线最多 ${MAX_ROUTE_POINTS} 个点`); // 后端会截尾,不拦会把真正的终点截掉
      return;
    }
    const a = route[i];
    const b = route[i + 1];
    commit((d) => ({
      ...d,
      board: {
        ...d.board,
        route: [...d.board.route.slice(0, i + 1), { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) }, ...d.board.route.slice(i + 1)],
      },
    }));
  };

  const points = route.map((p) => `${p.x},${p.y}`).join(" ");
  const start = route.length ? pointAtT(route, 0) : null;
  const end = route.length >= 2 ? route[route.length - 1] : null;
  const spriteUrl = board.sprites.length ? interactiveFileUrl(board.sprites[0]) : null;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-[960px]">
        {/* 工具条(路线绘制;关卡放置从左栏进入) */}
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setTool("select")}
            className={`rounded-md px-3 py-1 text-sm border ${tool === "select" ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            选择
          </button>
          <button
            type="button"
            onClick={() => setTool(drawing ? "select" : "route")}
            className={`rounded-md px-3 py-1 text-sm border ${drawing ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            ✏️ 画路线
          </button>
          {route.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("清空整条路线(路线上的关卡位置将失去参照)?")) return;
                commit((d) => ({ ...d, board: { ...d.board, route: [] } }));
                setSelection(null);
              }}
              className="rounded-md px-3 py-1 text-sm border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300"
            >
              清空路线
            </button>
          )}
          <span className="text-xs text-gray-400 ml-1">
            {drawing
              ? "点击背景连点成线;双击/右键/Esc 收笔"
              : placing
                ? `点击路线附近放置${getCheckpointUi(tool === "place:quiz" ? "quiz" : "spot")?.label}(Esc 取消)`
                : "拖拽路线点/关卡可调整;点关卡在右栏编辑题目"}
          </span>
        </div>

        {/* 画布:背景 aspect-ratio 容器,编辑器/大屏同一比例,路线跨屏不变形 */}
        <div
          ref={boxRef}
          className={`relative w-full select-none touch-none rounded-lg overflow-hidden shadow ring-1 ring-black/10 bg-[#20242e] ${drawing || placing ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: ratio }}
          onPointerDown={onBoxPointerDown}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setCursor(null)}
          onDoubleClick={() => drawing && setTool("select")}
          onContextMenu={(e) => {
            e.preventDefault();
            if (drawing || placing) setTool("select");
          }}
        >
          {bgUrl ? (
            <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-white/50 text-sm border border-dashed border-white/30 rounded-lg px-6 py-4">
                先在左栏「场景背景」上传游戏背景图
              </div>
            </div>
          )}

          {/* 路线(SVG 只画线,vector-effect 防非均匀缩放拉扁描边) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {route.length >= 2 && (
              <>
                <polyline points={points} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={points} fill="none" stroke="#FFD54A" strokeWidth={2.5} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {drawing && route.length > 0 && cursor && (
              <line x1={route[route.length - 1].x} y1={route[route.length - 1].y} x2={cursor.x} y2={cursor.y} stroke="#FFD54A" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* 段中点「+」插点(选择模式) */}
          {tool === "select" &&
            route.slice(0, -1).map((p, i) => {
              const q = route[i + 1];
              return (
                <button
                  key={`mid-${i}`}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => insertMidpoint(i)}
                  title="在此插入路线点"
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/85 text-[10px] leading-4 text-gray-600 shadow hover:bg-white"
                  style={{ left: `${(p.x + q.x) / 2}%`, top: `${(p.y + q.y) / 2}%` }}
                >
                  +
                </button>
              );
            })}

          {/* 路线点手柄 */}
          {(tool === "select" || drawing) &&
            route.map((p, i) => {
              const sel = selection?.type === "point" && selection.idx === i;
              return (
                <div
                  key={`pt-${i}`}
                  onPointerDown={(e) => startPointDrag(e, i)}
                  title={i === 0 ? "起点" : i === route.length - 1 ? "终点" : `路线点 ${i + 1}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ${tool === "select" ? "cursor-move" : ""} ${sel ? "w-4 h-4 border-white bg-[var(--party-primary)]" : "w-3 h-3 border-white/90 bg-[#FFD54A]"}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                />
              );
            })}

          {/* 关卡记号(吸附在路线上,可沿路线拖动) */}
          {board.checkpoints.map((cp) => {
            const pos = route.length >= 2 ? pointAtT(route, cp.t) : { x: 50, y: 50 };
            const sel = selection?.type === "checkpoint" && selection.id === cp.id;
            const ui = getCheckpointUi(cp.kind);
            return (
              <div
                key={cp.id}
                onPointerDown={(e) => startCpDrag(e, cp.id)}
                title={`${cp.title || ui?.label}(答错退 ${cp.penaltySteps} 步)`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-move shadow-lg text-base w-8 h-8 ${sel ? "ring-4 ring-[var(--party-primary)]" : "ring-2 ring-white/80"}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: cp.kind === "quiz" ? "#3B82F6" : "#E23B3B" }}
              >
                {ui?.icon}
              </div>
            );
          })}

          {/* 起点人物预览 / 终点旗 */}
          {start && (
            <div className="absolute -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: `${start.x}%`, top: `${start.y}%`, width: `${board.spriteSizePct}%` }}>
              {spriteUrl ? (
                <img src={spriteUrl} alt="" className="w-full h-auto drop-shadow-lg" draggable={false} />
              ) : (
                <div className="text-center drop-shadow-lg" style={{ fontSize: "2em" }}>🏃</div>
              )}
            </div>
          )}
          {end && (
            <div className="absolute -translate-x-1/4 -translate-y-full pointer-events-none text-2xl drop-shadow" style={{ left: `${end.x}%`, top: `${end.y}%` }}>
              🏁
            </div>
          )}
        </div>

        <div className="mt-1.5 text-xs text-gray-400">
          路线 {route.length} 点 · 关卡 {board.checkpoints.length} 个 · 总步数 {board.totalSteps}(全程约需点击 {board.totalSteps} 次,限速 15 次/秒 ≈ 最快 {Math.ceil(board.totalSteps / 15)} 秒)
        </div>
      </div>
    </div>
  );
}

/** 左栏「+关卡」按钮清单(关卡注册表驱动) */
export const CHECKPOINT_PLACE_TOOLS: { tool: CanvasTool; label: string; icon: string }[] = CHECKPOINT_UI_LIST.map(
  (ui) => ({ tool: `place:${ui.kind}` as CanvasTool, label: ui.label, icon: ui.icon }),
);
