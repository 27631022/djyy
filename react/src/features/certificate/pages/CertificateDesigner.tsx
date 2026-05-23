import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  SaveIcon,
  AwardIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateTemplateApi,
  type CreateTemplateInput,
} from "@/features/certificate";

const PARTY = "var(--party-primary)";

/**
 * 空白 DesignerState 占位。Phase B 起会被实际的 elements/background/variables 替换。
 * 关键字段:
 *   - elements:画布上的元素数组(文本/形状/图片/二维码/...)
 *   - background:背景(颜色/图片/纹理)
 *   - canvasWidth/Height:画布尺寸(px)
 *   - variables:变量字段定义(发证时占位符 → 实际值)
 */
// Phase A 阶段的极简结构,Phase B 会用完整的 DesignerState 类型替换
interface PlaceholderDesignerState {
  elements: unknown[];
  background: { type: "color"; color: string };
  canvasWidth: number;
  canvasHeight: number;
  variables: unknown[];
}

const EMPTY_DESIGNER_STATE: PlaceholderDesignerState = {
  elements: [],
  background: { type: "color", color: "#FFFFFF" },
  canvasWidth: 800,
  canvasHeight: 566,
  variables: [],
};

export default function CertificateDesignerPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ─── 编辑模式:加载现有模板 ─── */
  const existingQuery = useQuery({
    queryKey: ["certificate-template", id],
    queryFn: () => certificateTemplateApi.get(id!),
    enabled: !isNew,
  });

  /* ─── 本地状态(Phase A 仅 name + designJson 占位)─── */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [designerState, setDesignerState] = useState<PlaceholderDesignerState>(
    EMPTY_DESIGNER_STATE,
  );

  /** 加载后填充本地状态 */
  useEffect(() => {
    if (!existingQuery.data) return;
    const t = existingQuery.data;
    setName(t.name);
    setDescription(t.description ?? "");
    try {
      const parsed = JSON.parse(t.designJson);
      setDesignerState({ ...EMPTY_DESIGNER_STATE, ...parsed });
    } catch {
      setDesignerState(EMPTY_DESIGNER_STATE);
    }
  }, [existingQuery.data]);

  /* ─── 保存 ─── */
  const createMut = useMutation({
    mutationFn: (input: CreateTemplateInput) => certificateTemplateApi.create(input),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      toast.success("已创建");
      navigate(`/admin/certificate-templates/${created.id}/edit`, { replace: true });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      certificateTemplateApi.update(id!, {
        name,
        description: description || undefined,
        designJson: JSON.stringify(designerState),
        width: designerState.canvasWidth,
        height: designerState.canvasHeight,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      qc.invalidateQueries({ queryKey: ["certificate-template", id] });
      toast.success("已保存");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
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
        designJson: JSON.stringify(designerState),
        width: designerState.canvasWidth,
        height: designerState.canvasHeight,
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
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* ── Top header ── */}
      <header className="h-14 px-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
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

      {/* ── 三栏:左面板 | 画布 | 右面板 ── */}
      <div className="flex-1 flex min-h-0">
        {/* 左:元素 / 变量(Phase B 填充) */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-[#E9E9E9] p-3 overflow-auto">
          <div className="text-xs font-bold text-[#6B7280] mb-2">元素</div>
          <div className="text-xs text-[#9CA3AF] py-8 text-center">
            元素工具栏
            <br />
            (Phase B 实装)
          </div>
        </aside>

        {/* 中:画布 */}
        <main className="flex-1 min-w-0 flex items-center justify-center overflow-auto p-6">
          <div
            className="bg-white shadow-md flex items-center justify-center text-xs text-[#9CA3AF]"
            style={{
              width: designerState.canvasWidth,
              height: designerState.canvasHeight,
              backgroundColor: designerState.background.color ?? "#FFFFFF",
            }}
          >
            画布 {designerState.canvasWidth}×{designerState.canvasHeight} · Canvas 渲染 Phase B 实装
          </div>
        </main>

        {/* 右:属性 / 图层(Phase C 填充) */}
        <aside className="w-64 flex-shrink-0 bg-white border-l border-[#E9E9E9] p-3 overflow-auto">
          <div className="text-xs font-bold text-[#6B7280] mb-2">模板信息</div>
          <label className="block text-[11px] text-[#6B7280] mb-1">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="可选,记录用途/颁发对象等"
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-none"
          />

          <div className="mt-4 text-xs font-bold text-[#6B7280] mb-2">属性面板</div>
          <div className="text-xs text-[#9CA3AF] py-6 text-center">
            选中元素后显示属性
            <br />
            (Phase C 实装)
          </div>
        </aside>
      </div>
    </div>
  );
}
