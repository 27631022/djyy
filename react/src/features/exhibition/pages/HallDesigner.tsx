import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  LandmarkIcon,
  Redo2Icon,
  SaveIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { hallApi } from "../api";
import { useHistory } from "../hooks/useHistory";
import type { CanvasTool, HallDesignerState, ResolvedHall, Selection } from "../lib/hallTypes";
import { stripResolvedUrls } from "../lib/hallUtils";
import { renderPlanThumbnail } from "../lib/planThumbnail";
import { HallCanvas } from "../components/designer/HallCanvas";
import { FixturePalette } from "../components/designer/FixturePalette";
import { PropertiesPanel } from "../components/designer/PropertiesPanel";

const PARTY = "var(--party-primary)";

/**
 * 展厅 2D 搭建器:左 组件库/对象列表 · 中 SVG 平面图画布 · 右 属性与内容编辑。
 * 外壳只负责取数;数据就绪后以 hall.id 为 key 挂载内层 —— 所有编辑态用
 * useState 初始化器从服务端数据起步,无「加载→effect 同步」环节。
 */
export default function HallDesignerPage() {
  const { hallId = "" } = useParams<{ hallId: string }>();
  const hallQuery = useQuery({
    queryKey: ["exhibition", "hall", hallId],
    queryFn: () => hallApi.get(hallId),
    enabled: !!hallId,
  });

  if (hallQuery.isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>;
  }
  if (hallQuery.isError || !hallQuery.data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
        展厅不存在或已删除
        <Link to="/admin/halls" className="text-[var(--party-primary)] hover:underline">返回展厅列表</Link>
      </div>
    );
  }
  return <DesignerInner key={hallQuery.data.id} hall={hallQuery.data} />;
}

function DesignerInner({ hall }: { hall: ResolvedHall }) {
  const hallId = hall.id;
  const qc = useQueryClient();

  const history = useHistory<HallDesignerState>({
    walls: hall.walls ?? [],
    fixtures: hall.fixtures ?? [],
    meta: { gridM: 0.5, wallH: 4.2, ...hall.meta },
  });
  const { state, setState, record, undo, redo, canUndo, canRedo } = history;

  const [name, setName] = useState(hall.name);
  const [published, setPublished] = useState(hall.published);
  const [tool, setTool] = useState<CanvasTool>({ mode: "select" });
  const [selection, setSelection] = useState<Selection>(null);

  const accent = state.meta.theme?.accent || "#C8001E";

  /** record + 应用(一次性动作) */
  const update = useCallback(
    (mutate: (s: HallDesignerState) => HallDesignerState) => {
      record();
      setState(mutate);
    },
    [record, setState],
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "fixture") {
      update((s) => ({ ...s, fixtures: s.fixtures.filter((f) => f.id !== selection.id) }));
    } else if (selection.kind === "wall") {
      update((s) => ({ ...s, walls: s.walls.filter((w) => w.id !== selection.id) }));
    } else {
      return; // 出生点不可删
    }
    setSelection(null);
  }, [selection, update]);

  /* 键盘:撤销重做/删除/旋转/微移/退出工具 */
  useEffect(() => {
    function inText(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (inText(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((mod && (e.key === "y" || e.key === "Y")) || (mod && e.shiftKey && (e.key === "z" || e.key === "Z"))) { e.preventDefault(); redo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }
      if (e.key === "Escape") {
        // 画墙锚点的 Esc 由画布捕获;这里兜底:退出工具/取消选择
        if (tool.mode !== "select") setTool({ mode: "select" });
        else setSelection(null);
        return;
      }
      if ((e.key === "r" || e.key === "R") && selection?.kind === "fixture") {
        update((s) => ({ ...s, fixtures: s.fixtures.map((f) => (f.id === selection.id ? { ...f, rot: (f.rot + 90) % 360 } : f)) }));
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && selection?.kind === "fixture") {
        e.preventDefault();
        const step = e.shiftKey ? (state.meta.gridM ?? 0.5) : 0.1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        update((s) => ({
          ...s,
          fixtures: s.fixtures.map((f) =>
            f.id === selection.id ? { ...f, x: Math.round((f.x + dx) * 100) / 100, y: Math.round((f.y + dy) * 100) / 100 } : f,
          ),
        }));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelection, selection, tool.mode, state.meta.gridM, update]);

  /* 保存:剥已解析 url → PATCH + 平面缩略图 */
  const saveMut = useMutation({
    mutationFn: async () => {
      let thumbnailFileId: string | undefined;
      try {
        const blob = await renderPlanThumbnail(state, accent);
        const meta = await storageApi.upload(blob, { ownerModule: "exhibition", folder: `${hallId}/_thumb` }, "plan.png");
        thumbnailFileId = meta.id;
      } catch {
        /* 缩略图失败不阻塞保存 */
      }
      const saved = await hallApi.update(hallId, {
        name: name.trim() || "未命名展厅",
        meta: state.meta,
        walls: state.walls,
        fixtures: stripResolvedUrls(state.fixtures),
        ...(thumbnailFileId ? { thumbnailFileId } : {}),
      });
      // 旧缩略图变孤儿,顺手删(尽力而为)
      if (thumbnailFileId && hall.thumbnail) {
        const oldId = hall.thumbnail.split("/").pop();
        if (oldId && oldId !== thumbnailFileId) {
          storageApi.remove(oldId).catch((): void => undefined);
        }
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exhibition", "halls"] });
      toast.success("已保存");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const publishMut = useMutation({
    mutationFn: (next: boolean) => hallApi.update(hallId, { published: next }),
    onSuccess: (_h, next) => {
      setPublished(next);
      qc.invalidateQueries({ queryKey: ["exhibition", "halls"] });
      toast.success(next ? "已发布,3D 客户端可访问" : "已下架");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "操作失败"),
  });

  async function previewIn3d() {
    try {
      await saveMut.mutateAsync();
      window.open(`/exhibition/?hall=${hallId}`, "_blank", "noopener");
    } catch {
      /* 保存失败时 toast 已提示,不再开窗 */
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#F0F1F4]">
      {/* 工具栏 */}
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
        <Link to="/admin/halls" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]">
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <div className="w-px h-6 bg-[#E9E9E9]" />
        <LandmarkIcon className="w-4 h-4" style={{ color: PARTY }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="展厅名称"
          className="w-56 px-2 py-1.5 text-sm rounded border border-transparent hover:border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
        <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
          {published ? "已发布" : "未发布"}
        </span>
        <span className="text-xs text-[#9CA3AF]">{state.walls.length} 段墙 · {state.fixtures.length} 个组件</span>
        <div className="flex-1" />

        <button onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)" className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40">
          <Undo2Icon className="w-4 h-4" />
        </button>
        <button onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Y)" className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40">
          <Redo2Icon className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

        <button
          onClick={() => publishMut.mutate(!published)}
          disabled={publishMut.isPending}
          title={published ? "下架后 3D 客户端目录不再展示" : "发布后可在 3D 客户端访问"}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border disabled:opacity-60 ${
            published ? "border-[#E9E9E9] text-[#6B7280] hover:bg-[#F7F8FA]" : "border-green-500 text-green-600 hover:bg-green-50"
          }`}
        >
          <CheckCircle2Icon className="w-3.5 h-3.5" />
          {published ? "下架" : "发布"}
        </button>
        <button
          onClick={previewIn3d}
          disabled={saveMut.isPending}
          title="保存并在新窗口打开 3D 展厅"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-60"
        >
          <EyeIcon className="w-3.5 h-3.5" />
          3D 预览
        </button>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-4 h-4" />
          {saveMut.isPending ? "保存中…" : "保存"}
        </button>
      </header>

      {/* 三栏 */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-60 flex-shrink-0 bg-white border-r border-[#E9E9E9] overflow-hidden">
          <FixturePalette
            state={state}
            tool={tool}
            selection={selection}
            onToolChange={(t) => {
              setTool(t);
              if (t.mode !== "select") setSelection(null);
            }}
            onSelectionChange={setSelection}
          />
        </aside>

        <main className="flex-1 min-w-0 relative">
          <HallCanvas
            state={state}
            selection={selection}
            tool={tool}
            accent={accent}
            onSelectionChange={setSelection}
            onToolChange={setTool}
            onStateChange={(next) => setState(() => next)}
            onRecordHistory={record}
          />
        </main>

        <aside className="w-72 flex-shrink-0 flex flex-col bg-white border-l border-[#E9E9E9] overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#F0F0F0]">
            {selection ? "属性与内容" : "展厅设置"}
          </div>
          <div className="flex-1 overflow-auto p-3">
            <PropertiesPanel
              state={state}
              selection={selection}
              hallId={hallId}
              accent={accent}
              onUpdate={update}
              onDeleteSelection={deleteSelection}
            />
            <div className="mt-4 pt-3 border-t border-[#F0F0F0] text-[10px] text-[#9CA3AF] leading-relaxed">
              <div className="font-semibold mb-1">快捷键</div>
              Ctrl+Z 撤销 · Ctrl+Y 重做 · Delete 删除 · R 旋转90°
              <br />
              方向键 微移(Shift=一格)· 滚轮缩放 · 空白拖动平移
              <br />
              贴墙组件拖近墙自动吸附(Alt 取消)
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
