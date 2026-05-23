import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, SaveIcon, AwardIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
  certificateTemplateApi,
  type CreateTemplateInput,
} from "@/features/certificate";
import type {
  CanvasBackground,
  DesignerElement,
  DesignerState,
} from "../lib/designerTypes";
import { DEFAULT_VARIABLES, emptyDesignerState } from "../lib/designerUtils";
import { CanvasStage } from "../components/designer/CanvasStage";
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

  /* ─── 本地状态 ─── */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<DesignerState>(() => emptyDesignerState());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!existingQuery.data) return;
    const t = existingQuery.data;
    setName(t.name);
    setDescription(t.description ?? "");
    try {
      const parsed = JSON.parse(t.designJson) as Partial<DesignerState>;
      const empty = emptyDesignerState(t.width, t.height);
      setState({
        ...empty,
        ...parsed,
        // 兜底:旧模板可能没存 variables/background;空数组也补默认值
        variables:
          parsed.variables && parsed.variables.length > 0
            ? parsed.variables
            : DEFAULT_VARIABLES,
        background: parsed.background ?? empty.background,
        elements: parsed.elements ?? [],
      });
    } catch {
      setState(emptyDesignerState(t.width, t.height));
    }
    setSelectedIds([]);
  }, [existingQuery.data]);

  const selected = useMemo<DesignerElement | null>(() => {
    if (selectedIds.length === 0) return null;
    return state.elements.find((e) => e.id === selectedIds[0]) ?? null;
  }, [state.elements, selectedIds]);

  /* ─── 操作 ─── */

  const addElement = useCallback((el: DesignerElement) => {
    setState((s) => ({ ...s, elements: [...s.elements, el] }));
    setSelectedIds([el.id]);
  }, []);

  const updateElement = useCallback(
    (id: string, patch: Partial<DesignerElement>) => {
      setState((s) => ({
        ...s,
        elements: s.elements.map((e) =>
          e.id === id ? ({ ...e, ...patch } as DesignerElement) : e,
        ),
      }));
    },
    [],
  );

  const setElementsArray = useCallback((next: DesignerElement[]) => {
    setState((s) => ({ ...s, elements: next }));
  }, []);

  const setBackground = useCallback((bg: CanvasBackground) => {
    setState((s) => ({ ...s, background: bg }));
  }, []);

  const setCanvasSize = useCallback((w: number, h: number) => {
    setState((s) => ({ ...s, canvasWidth: w, canvasHeight: h }));
  }, []);

  const deleteElement = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      elements: s.elements.filter((e) => e.id !== id),
    }));
    setSelectedIds((ids) => ids.filter((x) => x !== id));
  }, []);

  const reorderElement = useCallback((id: string, direction: "up" | "down") => {
    setState((s) => {
      const idx = s.elements.findIndex((e) => e.id === id);
      if (idx < 0) return s;
      const swap = direction === "up" ? idx + 1 : idx - 1;
      if (swap < 0 || swap >= s.elements.length) return s;
      const next = [...s.elements];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...s, elements: next };
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setState((s) => ({
      ...s,
      elements: s.elements.filter((e) => !selectedIds.includes(e.id)),
    }));
    setSelectedIds([]);
  }, [selectedIds]);

  /* ─── 保存 ─── */

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
        designJson: JSON.stringify(state),
        width: state.canvasWidth,
        height: state.canvasHeight,
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
    if (isNew) {
      createMut.mutate({
        name: name.trim(),
        description: description || undefined,
        designJson: JSON.stringify(state),
        width: state.canvasWidth,
        height: state.canvasHeight,
      });
    } else {
      updateMut.mutate();
    }
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
        {selectedIds.length > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-[#EF4444] hover:bg-[#FEE2E2]"
            title="删除选中元素"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            删除选中
          </button>
        )}
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
          {/* 上半:tabs 容器 ~60% */}
          <div className="flex-[3] min-h-0 flex flex-col">
            <Tabs defaultValue="elements" className="flex-1 min-h-0 flex flex-col gap-0">
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
              <TabsContent value="elements" className="flex-1 overflow-auto p-3 m-0">
                <ElementPanel onAdd={addElement} />
              </TabsContent>
              <TabsContent value="variables" className="flex-1 overflow-auto p-3 m-0">
                <VariablePanel
                  variables={state.variables}
                  canvasWidth={state.canvasWidth}
                  canvasHeight={state.canvasHeight}
                  onAdd={addElement}
                />
              </TabsContent>
              <TabsContent value="background" className="flex-1 overflow-auto p-3 m-0">
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

          {/* 下半:常驻图层栏 ~40% */}
          <div className="flex-[2] min-h-0 border-t border-[#E9E9E9] flex flex-col">
            <LayerPanel
              elements={state.elements}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onUpdate={updateElement}
              onDelete={deleteElement}
              onReorder={reorderElement}
            />
          </div>
        </aside>

        {/* 中:画布 */}
        <main className="flex-1 min-w-0 flex items-center justify-center overflow-auto p-8">
          <CanvasStage
            state={state}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onElementsChange={setElementsArray}
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
        </aside>
      </div>
    </div>
  );
}
