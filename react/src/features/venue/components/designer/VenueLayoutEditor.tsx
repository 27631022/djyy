import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  SaveIcon,
  LayoutGridIcon,
  Trash2Icon,
  Undo2Icon,
  Redo2Icon,
  EyeIcon,
  PencilIcon,
  DownloadIcon,
  ChevronDownIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  CopyIcon,
  CheckCircle2Icon,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { layoutApi } from "../../api";
import type {
  CanvasBackground,
  VenueDesignerState,
  VenueElement,
  VenueElementType,
} from "../../lib/venueTypes";
import {
  assignZonesToSeats,
  cloneElement,
  countSeats,
  emptyVenueState,
  makeElement,
} from "../../lib/venueUtils";
import {
  generateVenuePdfDataUrl,
  generateVenuePngDataUrl,
  generateVenueThumbnailDataUrl,
  triggerDownload,
} from "../../lib/venueExport";
import { useHistory } from "../../hooks/useHistory";
import { VenueCanvas, type VenueCanvasHandle } from "./VenueCanvas";
import { ElementPalette } from "./ElementPalette";
import { BackgroundPanel } from "./BackgroundPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { LayerPanel } from "./LayerPanel";
import { GenerateLayoutDialog } from "./GenerateLayoutDialog";
import { AiButton } from "@/shared/components/AiButton";

const PARTY = "var(--party-primary)";
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));

/** 命令式句柄:嵌入方(排座向导)可在「下一步」时先调 save() 落库再前进 */
export interface VenueLayoutEditorHandle {
  save: () => Promise<void>;
}

interface VenueLayoutEditorProps {
  layoutId: string;
  /** 嵌入模式(排座向导第 3 步):去掉返回链接 / 另存为 / 发布,聚焦微调 */
  embedded?: boolean;
  /** 保存成功回调(向导用来感知已落库) */
  onSaved?: () => void;
  /** 智能生成对话框的默认横幅文字(= 会议名称,连带应用) */
  defaultMeetingName?: string;
}

/**
 * 会场图编辑器内核 —— 由 LayoutDesigner 页面抽出,既独立成页(/admin/venue/layouts/:id)
 * 又能嵌入排座向导第 3 步。受 layoutId 驱动,自带加载 / 历史 / 保存。
 */
export const VenueLayoutEditor = forwardRef<VenueLayoutEditorHandle, VenueLayoutEditorProps>(
  function VenueLayoutEditor({ layoutId, embedded = false, onSaved, defaultMeetingName }, ref) {
    const qc = useQueryClient();
    const navigate = useNavigate();

    const layoutQuery = useQuery({
      queryKey: ["venue", "layout", layoutId],
      queryFn: () => layoutApi.get(layoutId),
      enabled: !!layoutId,
    });

    const history = useHistory<VenueDesignerState>(emptyVenueState());
    const { state, setState, record, undo, redo, reset, canUndo, canRedo } = history;

    const [name, setName] = useState("");
    const [roomId, setRoomId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPreview, setIsPreview] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [genOpen, setGenOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const canvasRef = useRef<VenueCanvasHandle>(null);
    const mainRef = useRef<HTMLElement>(null);

    /* 加载会场图 */
    useEffect(() => {
      if (!layoutQuery.data) return;
      const l = layoutQuery.data;
      // 加载服务端数据 → 本地编辑态,是合法的"外部数据同步"
      setName(l.name);
      setRoomId(l.roomId);
      try {
        const parsed = JSON.parse(l.layoutJson) as Partial<VenueDesignerState>;
        const empty = emptyVenueState(l.width, l.height, l.gridSize);
        reset({
          ...empty,
          ...parsed,
          background: parsed.background ?? empty.background,
          elements: parsed.elements ?? [],
          gridSize: parsed.gridSize ?? l.gridSize,
          showGrid: parsed.showGrid ?? true,
        });
      } catch {
        reset(emptyVenueState(l.width, l.height, l.gridSize));
      }
      setSelectedIds([]);
    }, [layoutQuery.data, reset]);

    const selected = useMemo<VenueElement | null>(() => {
      if (selectedIds.length === 0) return null;
      return state.elements.find((e) => e.id === selectedIds[0]) ?? null;
    }, [state.elements, selectedIds]);

    /* 缩放适配 */
    const computeFitZoom = useCallback(() => {
      const el = mainRef.current;
      if (!el) return 1;
      const pad = 80; // 画布 p-8(64)+ 滚动条/余量,避免「适应屏幕」吸边后出横向滚动条
      const cw = el.clientWidth - pad;
      const ch = el.clientHeight - pad;
      if (cw <= 0 || ch <= 0) return 1;
      const raw = Math.min(cw / state.canvasWidth, ch / state.canvasHeight, 1);
      // 向下取整到 1%,防 clampZoom 四舍五入放大导致画布略宽于容器
      return Math.max(ZOOM_MIN, Math.floor(raw * 100) / 100);
    }, [state.canvasWidth, state.canvasHeight]);
    useEffect(() => {
      // 画布尺寸变化时按容器自动适配缩放
      setZoom(computeFitZoom());
    }, [computeFitZoom]);

    /* 操作 */
    const addElement = useCallback(
      (type: VenueElementType) => {
        record();
        const el = makeElement(type);
        setState((s) => {
          const centered: VenueElement = {
            ...el,
            x: Math.round((s.canvasWidth - el.width) / 2),
            y: Math.round((s.canvasHeight - el.height) / 2),
          };
          return { ...s, elements: [...s.elements, centered] };
        });
        setSelectedIds([el.id]);
      },
      [record, setState],
    );

    /* 智能生成:整体替换画布(可撤销) */
    const applyGenerated = useCallback(
      (gen: VenueDesignerState) => {
        record();
        setState(() => gen);
        setSelectedIds([]);
      },
      [record, setState],
    );

    const updateElement = useCallback(
      (id: string, patch: Partial<VenueElement>) => {
        record();
        setState((s) => ({
          ...s,
          elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as VenueElement) : e)),
        }));
      },
      [record, setState],
    );

    const setElementsDuringDrag = useCallback(
      (next: VenueElement[]) => setState((s) => ({ ...s, elements: next })),
      [setState],
    );
    const commitElements = useCallback(
      (next: VenueElement[]) => {
        record();
        setState((s) => ({ ...s, elements: next }));
      },
      [record, setState],
    );

    const setBackground = useCallback(
      (bg: CanvasBackground) => {
        record();
        setState((s) => ({ ...s, background: bg }));
      },
      [record, setState],
    );
    const setCanvasSize = useCallback(
      (w: number, h: number) => {
        record();
        setState((s) => ({ ...s, canvasWidth: w, canvasHeight: h }));
      },
      [record, setState],
    );
    const setGridSize = useCallback(
      (n: number) => {
        record();
        setState((s) => ({ ...s, gridSize: n }));
      },
      [record, setState],
    );
    const setShowGrid = useCallback((b: boolean) => setState((s) => ({ ...s, showGrid: b })), [setState]);

    const deleteElement = useCallback(
      (id: string) => {
        record();
        setState((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));
        setSelectedIds((ids) => ids.filter((x) => x !== id));
      },
      [record, setState],
    );
    const deleteSelected = useCallback(() => {
      if (selectedIds.length === 0) return;
      record();
      setState((s) => ({ ...s, elements: s.elements.filter((e) => !selectedIds.includes(e.id)) }));
      setSelectedIds([]);
    }, [selectedIds, record, setState]);
    const duplicateSelected = useCallback(() => {
      if (selectedIds.length === 0) return;
      record();
      const newEls: VenueElement[] = [];
      setState((s) => {
        const next = [...s.elements];
        for (const id of selectedIds) {
          const orig = s.elements.find((e) => e.id === id);
          if (orig) {
            const clone = cloneElement(orig, s.gridSize);
            newEls.push(clone);
            next.push(clone);
          }
        }
        return { ...s, elements: next };
      });
      queueMicrotask(() => setSelectedIds(newEls.map((e) => e.id)));
    }, [selectedIds, record, setState]);
    const nudgeSelected = useCallback(
      (dx: number, dy: number) => {
        if (selectedIds.length === 0) return;
        record();
        setState((s) => ({
          ...s,
          elements: s.elements.map((e) => (selectedIds.includes(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)),
        }));
      },
      [selectedIds, record, setState],
    );

    /* 多选对齐:以选中元素整体包围盒为基准对齐 */
    function alignSelected(kind: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
      if (selectedIds.length < 2) return;
      const ids = new Set(selectedIds);
      const sel = state.elements.filter((e) => ids.has(e.id));
      const minX = Math.min(...sel.map((e) => e.x));
      const maxR = Math.max(...sel.map((e) => e.x + e.width));
      const minY = Math.min(...sel.map((e) => e.y));
      const maxB = Math.max(...sel.map((e) => e.y + e.height));
      const cx = (minX + maxR) / 2;
      const cy = (minY + maxB) / 2;
      record();
      setState((s) => ({
        ...s,
        elements: s.elements.map((e) => {
          if (!ids.has(e.id)) return e;
          let patch: Partial<VenueElement> = {};
          switch (kind) {
            case "left": patch = { x: Math.round(minX) }; break;
            case "right": patch = { x: Math.round(maxR - e.width) }; break;
            case "hcenter": patch = { x: Math.round(cx - e.width / 2) }; break;
            case "top": patch = { y: Math.round(minY) }; break;
            case "bottom": patch = { y: Math.round(maxB - e.height) }; break;
            case "vcenter": patch = { y: Math.round(cy - e.height / 2) }; break;
          }
          return { ...e, ...patch } as VenueElement;
        }),
      }));
    }

    /* 多选等距:沿轴排序,固定两端,中间元素中心点平均分布(选最左最右后其余自动均分) */
    function distributeSelected(axis: "h" | "v") {
      if (selectedIds.length < 3) return;
      const ids = new Set(selectedIds);
      const items = state.elements
        .filter((e) => ids.has(e.id))
        .map((e) => ({
          id: e.id,
          c: axis === "h" ? e.x + e.width / 2 : e.y + e.height / 2,
          half: (axis === "h" ? e.width : e.height) / 2,
        }))
        .sort((a, b) => a.c - b.c);
      const first = items[0].c;
      const last = items[items.length - 1].c;
      const n = items.length;
      const lead = new Map<string, number>();
      items.forEach((it, i) => lead.set(it.id, first + ((last - first) * i) / (n - 1) - it.half));
      record();
      setState((s) => ({
        ...s,
        elements: s.elements.map((e) => {
          if (!lead.has(e.id)) return e;
          const pos = Math.round(lead.get(e.id)!);
          return axis === "h" ? { ...e, x: pos } : { ...e, y: pos };
        }),
      }));
    }

    /* 键盘快捷键 */
    useEffect(() => {
      function isInTextInput(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName.toLowerCase();
        return tag === "input" || tag === "textarea" || target.isContentEditable;
      }
      function onKeyDown(e: KeyboardEvent) {
        if (isInTextInput(e.target)) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom((z) => clampZoom(z + 0.1)); return; }
        if (mod && e.key === "-") { e.preventDefault(); setZoom((z) => clampZoom(z - 0.1)); return; }
        if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }
        if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((mod && (e.key === "y" || e.key === "Y")) || (mod && (e.key === "z" || e.key === "Z") && e.shiftKey)) { e.preventDefault(); redo(); return; }
        if (mod && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateSelected(); return; }
        if (e.key === "Delete" || e.key === "Backspace") { if (selectedIds.length > 0) { e.preventDefault(); deleteSelected(); } return; }
        if (e.key === "Escape") { setSelectedIds([]); return; }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
          if (selectedIds.length === 0) return;
          const step = e.shiftKey ? (state.gridSize || 10) : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          e.preventDefault();
          nudgeSelected(dx, dy);
        }
      }
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [undo, redo, deleteSelected, duplicateSelected, nudgeSelected, selectedIds.length, state.gridSize]);

    /* 保存 */
    const saveMut = useMutation({
      mutationFn: async () => {
        const finalState: VenueDesignerState = { ...state, elements: assignZonesToSeats(state.elements) };
        const thumbnail = await generateVenueThumbnailDataUrl(finalState);
        return layoutApi.update(layoutId, {
          name: name.trim() || "未命名会场图",
          layoutJson: JSON.stringify(finalState),
          thumbnail,
          width: state.canvasWidth,
          height: state.canvasHeight,
          gridSize: state.gridSize,
          seatCount: countSeats(state.elements),
        });
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["venue", "layout", layoutId] });
        qc.invalidateQueries({ queryKey: ["venue", "layouts"] });
        qc.invalidateQueries({ queryKey: ["venue", "rooms"] });
        if (roomId) qc.invalidateQueries({ queryKey: ["venue", "layouts", roomId] });
        toast.success("已保存");
        onSaved?.();
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
    });

    // 句柄:嵌入方在「下一步」前调 save()
    useImperativeHandle(
      ref,
      () => ({
        save: async () => {
          await saveMut.mutateAsync();
        },
      }),
      [saveMut],
    );

    /* 另存为新图(复制成草稿,原图不动)→ 跳到新图继续编辑 —— 仅独立页 */
    const dupMut = useMutation({
      mutationFn: () => layoutApi.duplicate(layoutId),
      onSuccess: (l) => {
        qc.invalidateQueries({ queryKey: ["venue", "layouts"] });
        toast.success("已另存为新图(草稿),原图不变");
        navigate(`/admin/venue/layouts/${l.id}`);
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "另存为失败"),
    });
    /* 发布:草稿 → 已发布,排座向导才能选用 —— 仅独立页 */
    const publishMut = useMutation({
      mutationFn: () => layoutApi.update(layoutId, { status: "published" }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["venue", "layout", layoutId] });
        qc.invalidateQueries({ queryKey: ["venue", "layouts"] });
        toast.success("已发布,排座向导可选用");
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "发布失败"),
    });

    async function handleExport(format: "png" | "pdf") {
      const baseName = (name.trim() || "会场图").replace(/[/\\:*?"<>|]/g, "_");
      try {
        const dataUrl = format === "png" ? await generateVenuePngDataUrl(state) : await generateVenuePdfDataUrl(state);
        triggerDownload(dataUrl, `${baseName}.${format}`);
        toast.success(`${format.toUpperCase()} 已下载`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "导出失败");
      }
      setExportMenuOpen(false);
    }

    if (layoutQuery.isLoading) {
      return <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">加载中…</div>;
    }
    if (layoutQuery.isError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#9CA3AF]">
          会场图不存在或已删除
          {!embedded && (
            <Link to="/admin/venue/rooms" className="text-[var(--party-primary)] hover:underline">返回会议室列表</Link>
          )}
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-[#F0F1F4]">
        {/* 工具栏 */}
        <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
          {!embedded && (
            <>
              <Link to="/admin/venue/rooms" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]">
                <ArrowLeftIcon className="w-4 h-4" />
                返回列表
              </Link>
              <div className="w-px h-6 bg-[#E9E9E9]" />
            </>
          )}
          <LayoutGridIcon className="w-4 h-4" style={{ color: PARTY }} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="会场图名称"
            className="flex-1 max-w-md px-2 py-1.5 text-sm rounded border border-transparent hover:border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
          {!embedded && layoutQuery.data && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                layoutQuery.data.status === "draft" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
              }`}
            >
              {layoutQuery.data.status === "draft" ? "草稿" : "已发布"}
            </span>
          )}
          <div className="flex-1" />

          <AiButton onClick={() => setGenOpen(true)} title="按参数 / AI 一键生成排式布局" className="px-2.5 py-1.5 text-xs">
            智能生成
          </AiButton>
          <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

          <button
            onClick={() => setIsPreview((p) => !p)}
            title={isPreview ? "回到编辑模式" : "预览(隐藏选中框/网格操作)"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              isPreview ? "bg-[var(--party-primary)] text-white" : "text-[#6B7280] hover:bg-[#F7F8FA]"
            }`}
          >
            {isPreview ? <PencilIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
            {isPreview ? "编辑" : "预览"}
          </button>
          <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

          <button onClick={undo} disabled={!canUndo || isPreview} title="撤销 (Ctrl+Z)" className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40 disabled:cursor-not-allowed">
            <Undo2Icon className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={!canRedo || isPreview} title="重做 (Ctrl+Y)" className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40 disabled:cursor-not-allowed">
            <Redo2Icon className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

          {selectedIds.length > 0 && (
            <button onClick={deleteSelected} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-[#EF4444] hover:bg-[#FEE2E2]" title="删除选中 (Delete)">
              <Trash2Icon className="w-3.5 h-3.5" />
              删除 ({selectedIds.length})
            </button>
          )}

          <div className="relative">
            <button onClick={() => setExportMenuOpen((v) => !v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:bg-[#F7F8FA]" title="导出">
              <DownloadIcon className="w-3.5 h-3.5" />
              导出
              <ChevronDownIcon className="w-3 h-3" />
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-[#E9E9E9] rounded shadow-lg z-50 overflow-hidden">
                  <button onClick={() => handleExport("png")} className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8FA]">导出 PNG</button>
                  <button onClick={() => handleExport("pdf")} className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8FA] border-t border-[#F0F0F0]">导出 PDF</button>
                </div>
              </>
            )}
          </div>

          {/* 嵌入(会议向导)模式:本会议的座次图默认私有(草稿);可「设为模板」供其它会议复用 */}
          {embedded && layoutQuery.data?.status === "draft" && (
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              title="把这张图设为「可复用模板」——其它会议在「选座次图」时也能选用(默认只属于本会议)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-green-500 text-green-600 hover:bg-green-50 disabled:opacity-60"
            >
              <CheckCircle2Icon className="w-3.5 h-3.5" />
              设为模板
            </button>
          )}
          {!embedded && (
            <>
              <button
                onClick={() => dupMut.mutate()}
                disabled={dupMut.isPending}
                title="复制成一张新图(草稿),原图不动 —— 从预设图改时用它"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-60"
              >
                <CopyIcon className="w-3.5 h-3.5" />
                另存为新图
              </button>
              {layoutQuery.data?.status === "draft" && (
                <button
                  onClick={() => publishMut.mutate()}
                  disabled={publishMut.isPending}
                  title="发布后,排座向导才能选到这张图"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-green-500 text-green-600 hover:bg-green-50 disabled:opacity-60"
                >
                  <CheckCircle2Icon className="w-3.5 h-3.5" />
                  发布
                </button>
              )}
            </>
          )}
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: PARTY }}>
            <SaveIcon className="w-4 h-4" />
            {saveMut.isPending ? "保存中…" : "保存"}
          </button>
        </header>

        {/* 三栏 */}
        <div className="flex-1 flex min-h-0">
          {/* 左:元素/背景 tabs + 图层 */}
          <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-[#E9E9E9] overflow-hidden">
            <div className="flex-[3] min-h-0 flex flex-col">
              <Tabs defaultValue="elements" className="flex-1 min-h-0 flex flex-col gap-0">
                <TabsList className="w-full h-9 rounded-none border-b border-[#E9E9E9] bg-[#FAFAFA] p-0 flex-shrink-0">
                  <TabsTrigger value="elements" className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)] text-xs">
                    元素
                  </TabsTrigger>
                  <TabsTrigger value="background" className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)] text-xs">
                    画布
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="elements" className="flex-1 overflow-auto p-3 m-0">
                  <ElementPalette onAdd={addElement} />
                </TabsContent>
                <TabsContent value="background" className="flex-1 overflow-auto p-3 m-0">
                  <BackgroundPanel
                    background={state.background}
                    canvasWidth={state.canvasWidth}
                    canvasHeight={state.canvasHeight}
                    gridSize={state.gridSize}
                    showGrid={state.showGrid}
                    onBackgroundChange={setBackground}
                    onCanvasSizeChange={setCanvasSize}
                    onGridSizeChange={setGridSize}
                    onShowGridChange={setShowGrid}
                  />
                </TabsContent>
              </Tabs>
            </div>
            <div className="flex-[2] min-h-0 border-t border-[#E9E9E9] flex flex-col">
              <LayerPanel
                elements={state.elements}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onUpdate={updateElement}
                onDelete={deleteElement}
                onReorder={commitElements}
              />
            </div>
          </aside>

          {/* 中:画布 */}
          <div className="flex-1 min-w-0 relative flex flex-col">
            <main ref={mainRef} className="flex-1 overflow-auto p-8 flex items-center justify-center">
              <VenueCanvas
                ref={canvasRef}
                state={state}
                zoom={zoom}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onElementsChange={setElementsDuringDrag}
                onRecordHistory={record}
                isPreview={isPreview}
              />
            </main>
            {/* 多选对齐 / 均分 浮动工具条(≥2 选中显示) */}
            {!isPreview && selectedIds.length >= 2 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-white border border-[#E9E9E9] rounded-lg shadow-md px-1.5 py-1 text-[#6B7280]">
                <span className="text-[11px] text-[#9CA3AF] px-1 select-none">已选 {selectedIds.length}</span>
                <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
                <button onClick={() => alignSelected("left")} title="左对齐" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignStartVertical className="w-4 h-4" /></button>
                <button onClick={() => alignSelected("hcenter")} title="水平居中(对齐竖中线)" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignCenterVertical className="w-4 h-4" /></button>
                <button onClick={() => alignSelected("right")} title="右对齐" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignEndVertical className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
                <button onClick={() => alignSelected("top")} title="顶对齐" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignStartHorizontal className="w-4 h-4" /></button>
                <button onClick={() => alignSelected("vcenter")} title="垂直居中(对齐横中线)" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignCenterHorizontal className="w-4 h-4" /></button>
                <button onClick={() => alignSelected("bottom")} title="底对齐" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]"><AlignEndHorizontal className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
                <button onClick={() => distributeSelected("h")} disabled={selectedIds.length < 3} title="水平等距(选最左最右,其余平均分布)" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)] disabled:opacity-30 disabled:cursor-not-allowed"><AlignHorizontalDistributeCenter className="w-4 h-4" /></button>
                <button onClick={() => distributeSelected("v")} disabled={selectedIds.length < 3} title="垂直等距" className="p-1.5 rounded hover:bg-[#F7F8FA] hover:text-[var(--party-primary)] disabled:opacity-30 disabled:cursor-not-allowed"><AlignVerticalDistributeCenter className="w-4 h-4" /></button>
              </div>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-white border border-[#E9E9E9] rounded-full shadow-md px-1.5 py-1 text-[#6B7280]">
              <button onClick={() => setZoom((z) => clampZoom(z - 0.1))} title="缩小 (Ctrl -)" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
                <ZoomOutIcon className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(1)} title="实际大小 (Ctrl 0)" className="min-w-[46px] px-1 py-1 rounded text-xs font-medium tabular-nums hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom((z) => clampZoom(z + 0.1))} title="放大 (Ctrl +)" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
                <ZoomInIcon className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-[#E9E9E9] mx-0.5" />
              <button onClick={() => setZoom(computeFitZoom())} title="适应屏幕" className="p-1.5 rounded-full hover:bg-[#F7F8FA] hover:text-[var(--party-primary)]">
                <MaximizeIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 右:属性 */}
          <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-l border-[#E9E9E9] overflow-hidden">
            <div className="px-3 py-2 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#F0F0F0]">属性</div>
            <div className="flex-1 overflow-auto p-3">
              <PropertiesPanel selected={selected} onChange={(patch) => selected && updateElement(selected.id, patch)} />
              <div className="mt-4 pt-3 border-t border-[#F0F0F0] text-[10px] text-[#9CA3AF] leading-relaxed">
                <div className="font-semibold mb-1">快捷键</div>
                Ctrl+Z 撤销 · Ctrl+Y 重做 · Ctrl+D 复制 · Delete 删除
                <br />
                方向键 微移(Shift = 一格) · 拖动按 Alt 关闭网格吸附 · Esc 取消选择
              </div>
            </div>
          </aside>
        </div>

        {genOpen && (
          <GenerateLayoutDialog
            onClose={() => setGenOpen(false)}
            onGenerate={applyGenerated}
            defaultMeetingName={defaultMeetingName}
          />
        )}
      </div>
    );
  },
);
