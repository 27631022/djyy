import { getCheckpointUi } from "../../checkpoints/registry";
import { type Checkpoint } from "../../checkpoints/types";
import { findDesignIssues, type RouteRaceDesign } from "../designTypes";
import { type DesignScene } from "./sceneTabs";
import { type DesignSelection } from "./BoardCanvas";

/**
 * 右栏属性面板(照证书设计器):按选中对象条件渲染 ——
 * 无选中=全局/场景设置;路线点=坐标微调;关卡=惩罚/位置 + 按 kind 委托关卡注册表 EditorPanel。
 */
export function PropertiesPanel({
  design,
  designId,
  scene,
  selection,
  setSelection,
  commit,
}: {
  design: RouteRaceDesign;
  designId: string;
  scene: DesignScene;
  selection: DesignSelection;
  setSelection: (s: DesignSelection) => void;
  commit: (fn: (d: RouteRaceDesign) => RouteRaceDesign) => void;
}) {
  const patchCp = (id: string, patch: Partial<Checkpoint>) =>
    commit((d) => ({
      ...d,
      board: { ...d.board, checkpoints: d.board.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
    }));

  const selectedCp =
    selection?.type === "checkpoint" ? design.board.checkpoints.find((c) => c.id === selection.id) ?? null : null;
  const selectedPointIdx = selection?.type === "point" ? selection.idx : null;
  const issues = findDesignIssues(design);

  return (
    <aside className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-3 space-y-3">
        {/* ── 选中关卡:属性 + kind 专属编辑(注册表委托) ── */}
        {selectedCp && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-gray-700">
                {getCheckpointUi(selectedCp.kind)?.icon} {getCheckpointUi(selectedCp.kind)?.label}
              </div>
              <button
                type="button"
                onClick={() => {
                  commit((d) => ({ ...d, board: { ...d.board, checkpoints: d.board.checkpoints.filter((c) => c.id !== selectedCp.id) } }));
                  setSelection(null);
                }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                删除关卡
              </button>
            </div>
            <label className="block text-xs text-gray-500">
              关卡名称(选填)
              <input
                value={selectedCp.title ?? ""}
                onChange={(e) => patchCp(selectedCp.id, { title: e.target.value || undefined })}
                maxLength={40}
                placeholder={getCheckpointUi(selectedCp.kind)?.label}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-500">
              答错退回步数(0 = 原地重答不退步)
              <input
                type="number"
                min={0}
                max={500}
                value={selectedCp.penaltySteps}
                onChange={(e) => patchCp(selectedCp.id, { penaltySteps: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-500">
              路线位置(约在第 {Math.max(1, Math.round(selectedCp.t * design.board.totalSteps))} 步拦截)
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="range"
                  min={2}
                  max={100}
                  step={1}
                  value={Math.round(selectedCp.t * 100)}
                  onChange={(e) => patchCp(selectedCp.id, { t: Number(e.target.value) / 100 })}
                  className="flex-1"
                />
                <span className="w-10 text-right tabular-nums">{Math.round(selectedCp.t * 100)}%</span>
              </div>
            </label>
            <div className="border-t border-gray-100 pt-2">
              <div className="text-xs font-bold text-gray-500 mb-2">
                {selectedCp.kind === "quiz" ? "题目(答对通过 · 答错退步换下一题)" : "找错图(点中热区通过 · 点错退步换下一图)"}
              </div>
              {(() => {
                const ui = getCheckpointUi(selectedCp.kind);
                if (!ui) return null;
                const Editor = ui.EditorPanel;
                return <Editor value={selectedCp} onChange={(cp) => patchCp(cp.id, cp)} designId={designId} />;
              })()}
            </div>
          </>
        )}

        {/* ── 选中路线点 ── */}
        {selectedPointIdx !== null && design.board.route[selectedPointIdx] && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-gray-700">
                路线点 {selectedPointIdx + 1}
                {selectedPointIdx === 0 ? "(起点)" : selectedPointIdx === design.board.route.length - 1 ? "(终点)" : ""}
              </div>
              <button
                type="button"
                onClick={() => {
                  commit((d) => ({ ...d, board: { ...d.board, route: d.board.route.filter((_, i) => i !== selectedPointIdx) } }));
                  setSelection(null);
                }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                删除点
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y"] as const).map((axis) => (
                <label key={axis} className="block text-xs text-gray-500">
                  {axis.toUpperCase()}(%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={design.board.route[selectedPointIdx][axis]}
                    onChange={(e) =>
                      commit((d) => ({
                        ...d,
                        board: {
                          ...d.board,
                          route: d.board.route.map((pt, i) =>
                            i === selectedPointIdx ? { ...pt, [axis]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : pt,
                          ),
                        },
                      }))
                    }
                    className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="text-[11px] text-gray-400">画布上可直接拖拽;段中点「+」可插新点</div>
          </>
        )}

        {/* ── 无选中:全局 + 当前场景设置 ── */}
        {!selectedCp && selectedPointIdx === null && (
          <>
            <div className="text-sm font-bold text-gray-700">游戏设置</div>
            <label className="block text-xs text-gray-500">
              总时长(秒;时间到按进度排名,先冲线按用时排名)
              <input
                type="number"
                min={5}
                max={1800}
                value={design.durationSec}
                onChange={(e) => commit((d) => ({ ...d, durationSec: Math.max(5, Math.min(1800, Math.round(Number(e.target.value) || 120))) }))}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-500">
              总步数(走完全程需要的点击数;服务端限速 15 次/秒)
              <input
                type="number"
                min={10}
                max={2000}
                value={design.board.totalSteps}
                onChange={(e) => commit((d) => ({ ...d, board: { ...d.board, totalSteps: Math.max(10, Math.min(2000, Math.round(Number(e.target.value) || 100))) } }))}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            {scene === "lobby" && (
              <label className="block text-xs text-gray-500">
                报名页标题
                <input
                  value={design.lobby.title ?? ""}
                  onChange={(e) => commit((d) => ({ ...d, lobby: { ...d.lobby, title: e.target.value || undefined } }))}
                  maxLength={60}
                  placeholder="扫码报名参赛"
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
            )}
            <div className="rounded-md bg-gray-50 p-2 text-[11px] text-gray-500 leading-relaxed">
              玩法:玩家手机连点推进角色沿路线前进,撞到关卡被拦下,在<b>自己手机上</b>答题/找错 ——
              答对通过,答错退回并换题重新挑战;团队模式全队共享进度、同题作答,第 1 人答对全队通过。
            </div>

            {issues.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1">
                <div className="text-xs font-bold text-amber-700">待完善({issues.length})</div>
                {issues.map((s, i) => (
                  <div key={i} className="text-[11px] text-amber-700 leading-snug">
                    · {s}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
