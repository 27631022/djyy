import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, Gamepad2Icon, Redo2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { useHistory } from "../useHistory";
import { designApi, type GameDesignRow } from "../designApi";
import { findDesignIssues, parseDesign, type RouteRaceDesign } from "../designTypes";
import { BoardCanvas, type CanvasTool, type DesignSelection } from "../components/BoardCanvas";
import { LobbyCanvas } from "../components/LobbyCanvas";
import { AwardCanvas } from "../components/AwardCanvas";
import { LeftPanel } from "../components/LeftPanel";
import { PropertiesPanel } from "../components/PropertiesPanel";
import { SCENE_TABS, type DesignScene } from "../components/sceneTabs";

const DESIGNS_KEY = ["interactive", "designs"];

/**
 * 互动游戏编辑器(自制闯关赛)—— 三栏全页设计器,布局照证书设计器:
 * 左=背景/关卡/人物/音乐,中=三场景画布(游戏前/游戏中/颁奖),右=属性面板。
 * 外壳 useQuery + key 重挂载内层(零 effect 同步范式);useHistory 撤销重做(Ctrl+Z/Y)。
 */
export default function GameDesignerPage() {
  const { designId } = useParams<{ designId: string }>();
  const query = useQuery({
    queryKey: [...DESIGNS_KEY, designId],
    queryFn: () => designApi.get(designId!),
    enabled: !!designId,
  });
  if (query.isLoading) return <div className="p-10 text-center text-gray-400">加载设计中…</div>;
  if (!query.data) return <div className="p-10 text-center text-gray-400">设计不存在或已删除</div>;
  return <DesignerInner key={query.data.id} row={query.data} />;
}

function DesignerInner({ row }: { row: GameDesignRow }) {
  const qc = useQueryClient();
  const [name, setName] = useState(row.name);
  const { state, setState, record, undo, redo, canUndo, canRedo } = useHistory<RouteRaceDesign>(parseDesign(row.configJson));
  const [scene, setScene] = useState<DesignScene>("board");
  const [tool, setTool] = useState<CanvasTool>("select");
  const [selection, setSelection] = useState<DesignSelection>(null);

  /** 一次性动作 = 动作前存档 + 更新(useHistory 既定范式;拖拽中间态走 setState 不进历史) */
  const commit = (fn: (d: RouteRaceDesign) => RouteRaceDesign) => {
    record();
    setState(fn);
  };

  const saveMut = useMutation({
    mutationFn: () => designApi.update(row.id, { name: name.trim() || row.name, config: state }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESIGNS_KEY });
      const issues = findDesignIssues(state);
      if (issues.length) toast.warning(`已保存,但有 ${issues.length} 处待完善(见右栏),不完善的内容运行时会被忽略`);
      else toast.success("设计已保存;可到「互动活动」的节目单里添加这款游戏");
    },
    onError: () => toast.error("保存失败"),
  });

  // 快捷键:Ctrl+Z/Y 撤销重做、Delete 删选中、Esc 收工具(输入框内不劫持)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setTool("select");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        record();
        if (selection.type === "checkpoint") {
          setState((d) => ({ ...d, board: { ...d.board, checkpoints: d.board.checkpoints.filter((c) => c.id !== selection.id) } }));
        } else {
          setState((d) => ({ ...d, board: { ...d.board, route: d.board.route.filter((_, i) => i !== selection.idx) } }));
        }
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, record, setState, selection]);

  const issues = findDesignIssues(state);

  return (
    <div className="h-full flex flex-col bg-[#F0F1F4]">
      {/* 顶栏 */}
      <header className="h-14 px-4 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
        <Link to="/admin/interactive/designs" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeftIcon className="w-4 h-4" />
          返回游戏库
        </Link>
        <div className="w-px h-6 bg-gray-200" />
        <Gamepad2Icon className="w-4 h-4" style={{ color: "var(--party-primary)" }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="游戏名称"
          className="w-56 px-2 py-1.5 text-sm rounded border border-transparent hover:border-gray-200 focus:border-[var(--party-primary)] focus:outline-none"
        />
        <span className="text-xs text-gray-400">
          路线 {state.board.route.length} 点 · 关卡 {state.board.checkpoints.length} · 人物 {state.board.sprites.length}
        </span>
        {issues.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">待完善 {issues.length}</span>
        )}
        <div className="flex-1" />
        <button type="button" onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40">
          <Undo2Icon className="w-4 h-4" />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Y)" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40">
          <Redo2Icon className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="rounded-md px-5 py-1.5 text-white text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--party-primary)" }}
        >
          {saveMut.isPending ? "保存中…" : "保存"}
        </button>
      </header>

      {/* 三栏:左 素材/关卡/音乐 · 中 场景画布 · 右 属性 */}
      <div className="flex-1 min-h-0 flex">
        <LeftPanel
          design={state}
          designId={row.id}
          tool={tool}
          setTool={setTool}
          selection={selection}
          setSelection={setSelection}
          commit={commit}
        />

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-1 px-4 pt-3">
            {SCENE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setScene(t.key)}
                className={`rounded-t-md px-4 py-1.5 text-sm border border-b-0 ${scene === t.key ? "bg-white border-gray-200 font-semibold text-[var(--party-primary)]" : "bg-transparent border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex flex-col bg-white/60 mx-4 mb-4 rounded-b-lg rounded-tr-lg border border-gray-200">
            {scene === "board" && (
              <BoardCanvas
                design={state}
                tool={tool}
                setTool={setTool}
                selection={selection}
                setSelection={setSelection}
                record={record}
                update={setState}
                commit={commit}
              />
            )}
            {scene === "lobby" && <LobbyCanvas design={state} />}
            {scene === "award" && <AwardCanvas design={state} designId={row.id} commit={commit} />}
          </div>
        </main>

        <PropertiesPanel
          design={state}
          designId={row.id}
          scene={scene}
          selection={selection}
          setSelection={setSelection}
          commit={commit}
        />
      </div>
    </div>
  );
}
