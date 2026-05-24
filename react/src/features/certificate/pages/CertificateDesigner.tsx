import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  SaveIcon,
  AwardIcon,
  TrashIcon,
  UndoIcon,
  RedoIcon,
  EyeIcon,
  EditIcon,
  DownloadIcon,
  ChevronDownIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
  certificateTemplateApi,
  HONOR_LEVEL_LABEL,
  type CreateTemplateInput,
} from "@/features/certificate";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import type {
  CanvasBackground,
  DesignerElement,
  DesignerState,
} from "../lib/designerTypes";
import {
  DEFAULT_VARIABLES,
  cloneElement,
  emptyDesignerState,
} from "../lib/designerUtils";
import {
  exportCanvasAsPDF,
  exportCanvasAsPNG,
  generateThumbnail,
} from "../lib/exportUtils";
import { useHistory } from "../hooks/useHistory";
import {
  CanvasStage,
  type CanvasStageHandle,
} from "../components/designer/CanvasStage";
import { ElementPanel } from "../components/designer/ElementPanel";
import { VariablePanel } from "../components/designer/VariablePanel";
import { BackgroundPanel } from "../components/designer/BackgroundPanel";
import { PropertiesPanel } from "../components/designer/PropertiesPanel";
import { LayerPanel } from "../components/designer/LayerPanel";

const PARTY = "var(--party-primary)";

export default function CertificateDesignerPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── 加载已有模板 ─── */
  const existingQuery = useQuery({
    queryKey: ["certificate-template", id],
    queryFn: () => certificateTemplateApi.get(id!),
    enabled: !isNew,
  });

  /* ─── 设计器状态(走 useHistory,支持 undo/redo) ─── */
  const history = useHistory<DesignerState>(emptyDesignerState());
  const { state, setState, record, undo, redo, reset, canUndo, canRedo } =
    history;

  /* ─── 模板元数据(不进历史) ─── */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** V2 + V3+:荣誉代码,如 "QDJL"(庆典奖励)— 必填,用于发证编号 */
  const [honorCode, setHonorCode] = useState("");
  /** V3:荣誉类型 — individual(个人)/ collective(集体) */
  const [honorType, setHonorType] = useState<"individual" | "collective">("individual");
  /** V3+:荣誉等级 — 字典 cert_honor_level 的 code(默认 company) */
  const [honorLevel, setHonorLevel] = useState<string>("company");
  /** V3+:落款单位 — 必填,用于印章顶弧默认文字 */
  const [issuingOrgName, setIssuingOrgName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const canvasStageRef = useRef<CanvasStageHandle>(null);

  useEffect(() => {
    if (!existingQuery.data) return;
    const t = existingQuery.data;
    setName(t.name);
    setDescription(t.description ?? "");
    setHonorCode(t.honorCode ?? "");
    setHonorType(t.honorType === "collective" ? "collective" : "individual");
    setHonorLevel(t.honorLevel || "company");
    setIssuingOrgName(t.issuingOrgName ?? "");
    try {
      const parsed = JSON.parse(t.designJson) as Partial<DesignerState>;
      const empty = emptyDesignerState(t.width, t.height);
      reset({
        ...empty,
        ...parsed,
        variables:
          parsed.variables && parsed.variables.length > 0
            ? parsed.variables
            : DEFAULT_VARIABLES,
        background: parsed.background ?? empty.background,
        elements: parsed.elements ?? [],
      });
    } catch {
      reset(emptyDesignerState(t.width, t.height));
    }
    setSelectedIds([]);
  }, [existingQuery.data, reset]);

  const selected = useMemo<DesignerElement | null>(() => {
    if (selectedIds.length === 0) return null;
    return state.elements.find((e) => e.id === selectedIds[0]) ?? null;
  }, [state.elements, selectedIds]);

  /* ─── 操作(都先 record 再 setState) ─── */

  const addElement = useCallback(
    (el: DesignerElement) => {
      record();
      // V3+:新加的印章顶部弧形文字总是用「落款单位」覆盖工厂默认值
      //     (createStampElement 内置默认是「中共党建益友委员会」,这里强制覆盖)
      //     落款单位为空时保留工厂默认,提醒用户先填模板表单
      const enhanced: DesignerElement =
        el.type === "stamp" && issuingOrgName.trim()
          ? { ...el, text: issuingOrgName.trim() }
          : el;
      setState((s) => ({ ...s, elements: [...s.elements, enhanced] }));
      setSelectedIds([enhanced.id]);
    },
    [record, setState, issuingOrgName],
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<DesignerElement>) => {
      record();
      setState((s) => ({
        ...s,
        elements: s.elements.map((e) =>
          e.id === id ? ({ ...e, ...patch } as DesignerElement) : e,
        ),
      }));
    },
    [record, setState],
  );

  /** CanvasStage 拖拽中实时位置 — 不进历史(record 在 onRecordHistory 里已经做过) */
  const setElementsArrayDuringDrag = useCallback(
    (next: DesignerElement[]) => {
      setState((s) => ({ ...s, elements: next }));
    },
    [setState],
  );

  /** LayerPanel 拖拽排序 / chevron 上下移 — 一次性操作,要进历史 */
  const commitElementsArray = useCallback(
    (next: DesignerElement[]) => {
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

  const deleteElement = useCallback(
    (id: string) => {
      record();
      setState((s) => ({
        ...s,
        elements: s.elements.filter((e) => e.id !== id),
      }));
      setSelectedIds((ids) => ids.filter((x) => x !== id));
    },
    [record, setState],
  );

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    record();
    setState((s) => ({
      ...s,
      elements: s.elements.filter((e) => !selectedIds.includes(e.id)),
    }));
    setSelectedIds([]);
  }, [selectedIds, record, setState]);

  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    record();
    const newEls: DesignerElement[] = [];
    setState((s) => {
      const next = [...s.elements];
      for (const id of selectedIds) {
        const orig = s.elements.find((e) => e.id === id);
        if (orig) {
          const clone = cloneElement(orig);
          newEls.push(clone);
          next.push(clone);
        }
      }
      return { ...s, elements: next };
    });
    // 用 setTimeout 延后选择新元素,确保 setState 已 flush
    queueMicrotask(() => setSelectedIds(newEls.map((e) => e.id)));
  }, [selectedIds, record, setState]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      record();
      setState((s) => ({
        ...s,
        elements: s.elements.map((e) =>
          selectedIds.includes(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e,
        ),
      }));
    },
    [selectedIds, record, setState],
  );

  /* ─── 键盘快捷键 ─── */
  useEffect(() => {
    function isInTextInput(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" || tag === "textarea" || target.isContentEditable
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      // 在 input / textarea 里 — 让浏览器/控件原生处理,不抢
      if (isInTextInput(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        (mod && (e.key === "y" || e.key === "Y")) ||
        (mod && (e.key === "z" || e.key === "Z") && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        if (selectedIds.length === 0) return;
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        e.preventDefault();
        nudgeSelected(dx, dy);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, deleteSelected, duplicateSelected, nudgeSelected, selectedIds.length]);

  /* ─── 保存 — 顺手生成缩略图(列表页用) ─── */

  function getThumbnailDataUrl(): string | undefined {
    const c = canvasStageRef.current?.getMainCanvas();
    if (!c) return undefined;
    return generateThumbnail(c, 300, 0.7);
  }

  const createMut = useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      certificateTemplateApi.create(input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      toast.success("已创建");
      navigate(`/admin/certificate-templates/${created.id}/edit`, {
        replace: true,
      });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      certificateTemplateApi.update(id!, {
        name,
        description: description || undefined,
        honorCode: honorCode.trim(),
        honorType,
        honorLevel,
        issuingOrgName: issuingOrgName.trim(),
        designJson: JSON.stringify(state),
        width: state.canvasWidth,
        height: state.canvasHeight,
        thumbnail: getThumbnailDataUrl(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      qc.invalidateQueries({ queryKey: ["certificate-template", id] });
      toast.success("已保存");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  function handleSave() {
    if (!name.trim()) {
      toast.error("请填写模板名");
      return;
    }
    // V3+:荣誉代码 / 落款单位 / 荣誉等级 全部必填
    if (!honorCode.trim()) {
      toast.error("请填写荣誉代码(用于发证编号生成)");
      return;
    }
    if (!issuingOrgName.trim()) {
      toast.error("请填写落款单位(印章顶弧文字默认引用)");
      return;
    }
    if (!honorLevel) {
      toast.error("请选择荣誉等级");
      return;
    }
    if (isNew) {
      createMut.mutate({
        name: name.trim(),
        description: description || undefined,
        honorCode: honorCode.trim(),
        honorType,
        honorLevel,
        issuingOrgName: issuingOrgName.trim(),
        designJson: JSON.stringify(state),
        width: state.canvasWidth,
        height: state.canvasHeight,
        thumbnail: getThumbnailDataUrl(),
      });
    } else {
      updateMut.mutate();
    }
  }

  function handleExport(format: "png" | "pdf") {
    const c = canvasStageRef.current?.getMainCanvas();
    if (!c) {
      toast.error("画布尚未就绪");
      return;
    }
    const baseName = (name.trim() || "证书模板").replace(/[/\\:*?"<>|]/g, "_");
    if (format === "png") {
      exportCanvasAsPNG(c, baseName);
      toast.success("PNG 已下载");
    } else {
      exportCanvasAsPDF(c, baseName);
      toast.success("PDF 已下载");
    }
    setExportMenuOpen(false);
  }

  const saving = createMut.isPending || updateMut.isPending;
  const loading = !isNew && existingQuery.isLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#9CA3AF]">
        加载中…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F0F1F4]">
      {/* ── Top header ── */}
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-shrink-0">
        <Link
          to="/admin/certificate-templates"
          className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <div className="w-px h-6 bg-[#E9E9E9]" />
        <AwardIcon className="w-4 h-4" style={{ color: PARTY }} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="证书模板名(如:年度优秀党员证书)"
          className="flex-1 max-w-md px-2 py-1.5 text-sm rounded border border-transparent hover:border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
        <div className="flex-1" />

        {/* 预览模式 */}
        <button
          onClick={() => setIsPreview((p) => !p)}
          title={isPreview ? "回到编辑模式" : "预览(变量替换为示例值)"}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
            isPreview
              ? "bg-[var(--party-primary)] text-white"
              : "text-[#6B7280] hover:bg-[#F7F8FA]"
          }`}
        >
          {isPreview ? (
            <EditIcon className="w-3.5 h-3.5" />
          ) : (
            <EyeIcon className="w-3.5 h-3.5" />
          )}
          {isPreview ? "编辑" : "预览"}
        </button>
        <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

        {/* 撤销 / 重做 */}
        <button
          onClick={undo}
          disabled={!canUndo || isPreview}
          title="撤销 (Ctrl+Z)"
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UndoIcon className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo || isPreview}
          title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RedoIcon className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-[#E9E9E9] mx-1" />

        {selectedIds.length > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-[#EF4444] hover:bg-[#FEE2E2]"
            title="删除选中元素 (Delete)"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            删除 ({selectedIds.length})
          </button>
        )}

        {/* 导出 PNG / PDF — 简易下拉 */}
        <div className="relative">
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            title="导出"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            导出
            <ChevronDownIcon className="w-3 h-3" />
          </button>
          {exportMenuOpen && (
            <>
              {/* 透明遮罩,点外部关菜单 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setExportMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-[#E9E9E9] rounded shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => handleExport("png")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8FA]"
                >
                  导出 PNG
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#F7F8FA] border-t border-[#F0F0F0]"
                >
                  导出 PDF
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-4 h-4" />
          {saving ? "保存中…" : "保存"}
        </button>
      </header>

      {/* ── 三栏:左面板(tabs + 图层) | 画布 | 右面板(属性) ── */}
      <div className="flex-1 flex min-h-0">
        {/* 左:tabs 上 + 图层 下 */}
        <aside className="w-72 flex-shrink-0 flex flex-col bg-white border-r border-[#E9E9E9] overflow-hidden">
          <div className="flex-[3] min-h-0 flex flex-col">
            <Tabs
              defaultValue="elements"
              className="flex-1 min-h-0 flex flex-col gap-0"
            >
              <TabsList className="w-full h-9 rounded-none border-b border-[#E9E9E9] bg-[#FAFAFA] p-0 flex-shrink-0">
                <TabsTrigger
                  value="elements"
                  className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)] text-xs"
                >
                  元素
                </TabsTrigger>
                <TabsTrigger
                  value="variables"
                  className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)] text-xs"
                >
                  变量
                </TabsTrigger>
                <TabsTrigger
                  value="background"
                  className="flex-1 rounded-none data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)] text-xs"
                >
                  背景
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="elements"
                className="flex-1 overflow-auto p-3 m-0"
              >
                <ElementPanel onAdd={addElement} />
              </TabsContent>
              <TabsContent
                value="variables"
                className="flex-1 overflow-auto p-3 m-0"
              >
                <VariablePanel
                  variables={state.variables}
                  canvasWidth={state.canvasWidth}
                  canvasHeight={state.canvasHeight}
                  onAdd={addElement}
                />
              </TabsContent>
              <TabsContent
                value="background"
                className="flex-1 overflow-auto p-3 m-0"
              >
                <BackgroundPanel
                  background={state.background}
                  canvasWidth={state.canvasWidth}
                  canvasHeight={state.canvasHeight}
                  onBackgroundChange={setBackground}
                  onCanvasSizeChange={setCanvasSize}
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
              onElementsChange={commitElementsArray}
            />
          </div>
        </aside>

        {/* 中:画布 */}
        <main className="flex-1 min-w-0 flex items-center justify-center overflow-auto p-8">
          <CanvasStage
            ref={canvasStageRef}
            state={state}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onElementsChange={setElementsArrayDuringDrag}
            onRecordHistory={record}
            isPreview={isPreview}
          />
        </main>

        {/* 右:属性 */}
        <aside className="w-72 flex-shrink-0 bg-white border-l border-[#E9E9E9] p-3 overflow-auto">
          <PropertiesPanel
            selected={selected}
            onElementChange={updateElement}
          />
          <div className="mt-6 pt-4 border-t border-[#F0F0F0]">
            <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
              模板描述
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="可选,记录用途/颁发对象等"
              className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-none"
            />
          </div>
          <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
            <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
              荣誉代码 <span className="text-red-500">*</span>
              <span className="text-[10px] text-[#9CA3AF] normal-case ml-1">用于发证编号</span>
            </div>
            <input
              type="text"
              value={honorCode}
              onChange={(e) => setHonorCode(e.target.value.toUpperCase().slice(0, 16))}
              placeholder="如 QDJL (庆典奖励)"
              className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono uppercase tracking-wider"
            />
            <p className="mt-1 text-[10px] text-[#9CA3AF] leading-relaxed">
              发证编号格式:<span className="font-mono">2024-{honorCode || "XXXX"}-100-001</span>
            </p>
          </div>

          {/* V3:荣誉类型(模板带出,发证时不让用户选) */}
          <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
            <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
              荣誉类型 <span className="text-red-500">*</span>
            </div>
            <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden">
              {(
                [
                  { v: "individual" as const, label: "个人" },
                  { v: "collective" as const, label: "集体" },
                ]
              ).map((opt) => {
                const active = honorType === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setHonorType(opt.v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "text-white"
                        : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
                    }`}
                    style={
                      active ? { backgroundColor: "var(--party-primary)" } : undefined
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-[#9CA3AF]">
              发证时此模板所有证书自动用此类型
            </p>
          </div>

          {/* V3+:落款单位 — 必填,印章顶弧文字默认引用 */}
          <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
            <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
              落款单位(发证机构) <span className="text-red-500">*</span>
            </div>
            <input
              type="text"
              value={issuingOrgName}
              onChange={(e) => setIssuingOrgName(e.target.value.slice(0, 64))}
              placeholder="如:中共 XX 委员会"
              className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-[#9CA3AF]">
              证书印章顶部弧形文字默认引用此值
            </p>
          </div>

          {/* V3+:荣誉等级 — 字典 cert_honor_level */}
          <HonorLevelSelect value={honorLevel} onChange={setHonorLevel} />

          <div className="mt-4 pt-3 border-t border-[#F0F0F0] text-[10px] text-[#9CA3AF] leading-relaxed">
            <div className="font-semibold mb-1">快捷键</div>
            Ctrl+Z 撤销 · Ctrl+Y/Shift+Z 重做
            <br />
            Ctrl+D 复制 · Delete 删除
            <br />
            方向键 微移 (Shift 大步)
            <br />
            Esc 取消选择 · Shift+点击 多选
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── 荣誉等级选择器 — 字典驱动(cert_honor_level) ─── */

function HonorLevelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const dictQuery = useQuery({
    queryKey: ["dictionary", DICT_CODES.CERT_HONOR_LEVEL],
    queryFn: () => dictionariesApi.get(DICT_CODES.CERT_HONOR_LEVEL),
    staleTime: 5 * 60 * 1000,
  });
  const items = (dictQuery.data?.items ?? []).filter((i) => i.active);

  return (
    <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
        荣誉等级 <span className="text-red-500">*</span>
        {dictQuery.isLoading && (
          <span className="text-[10px] text-[#9CA3AF] ml-1 normal-case">加载中…</span>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
      >
        {items.length === 0 && (
          <option value={value}>
            {HONOR_LEVEL_LABEL[value] ?? value}
          </option>
        )}
        {items.map((it) => (
          <option key={it.id} value={it.code}>
            {it.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-[#9CA3AF]">
        管理员可在「系统设置 → 数据字典」编辑 cert_honor_level 字典增减等级
      </p>
    </div>
  );
}
