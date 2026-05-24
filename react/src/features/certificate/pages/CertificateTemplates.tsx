import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AwardIcon,
  Building2Icon,
  CopyIcon,
  PlusIcon,
  RefreshCwIcon,
  EditIcon,
  TrashIcon,
  PowerIcon,
  PowerOffIcon,
  ImageOffIcon,
  TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateTemplateApi,
  HONOR_LEVEL_LABEL,
  HONOR_TYPE_LABEL,
  type CertificateTemplateDto,
  type HonorLevel,
} from "@/features/certificate";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";

const PARTY = "var(--party-primary)";

export default function CertificateTemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listQuery = useQuery({
    queryKey: ["certificate-templates"],
    queryFn: () => certificateTemplateApi.list(),
  });

  const [confirmDel, setConfirmDel] = useState<CertificateTemplateDto | null>(null);
  /** 左侧分类侧栏当前选中:'all' 或 字典 code */
  const [activeLevel, setActiveLevel] = useState<string>("all");

  /** 字典 cert_honor_level — 用来生成左侧分类侧栏 */
  const levelDictQuery = useQuery({
    queryKey: ["dictionary", DICT_CODES.CERT_HONOR_LEVEL],
    queryFn: () => dictionariesApi.get(DICT_CODES.CERT_HONOR_LEVEL),
    staleTime: 5 * 60 * 1000,
  });
  const levelOptions = (levelDictQuery.data?.items ?? []).filter((i) => i.active);

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      certificateTemplateApi.update(id, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      toast.success("状态已更新");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => certificateTemplateApi.delete(id),
    onSuccess: () => {
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      toast.success("已删除");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  /**
   * 复制模板 — 前端 get + create(零后端改动)。
   * 名称加「-副本」后缀,其他元数据完整继承,新模板默认 active=true。
   */
  const duplicateMut = useMutation({
    mutationFn: async (id: string) => {
      const t = await certificateTemplateApi.get(id);
      return certificateTemplateApi.create({
        name: `${t.name}-副本`,
        description: t.description ?? undefined,
        category: t.category ?? undefined,
        honorCode: t.honorCode ?? "",
        honorType: t.honorType === "collective" ? "collective" : "individual",
        honorLevel: t.honorLevel ?? "company",
        issuingOrgName: t.issuingOrgName ?? "",
        designJson: t.designJson,
        thumbnail: t.thumbnail ?? undefined,
        width: t.width,
        height: t.height,
        active: true,
      });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["certificate-templates"] });
      toast.success(`已复制为「${created.name}」`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "复制失败"),
  });

  const templates = listQuery.data ?? [];

  /** 按当前侧栏选中过滤 */
  const filteredTemplates = useMemo(() => {
    if (activeLevel === "all") return templates;
    if (activeLevel === "_unset") return templates.filter((t) => !t.honorLevel);
    return templates.filter((t) => t.honorLevel === activeLevel);
  }, [templates, activeLevel]);

  /** 各等级模板数量(显示在侧栏 chip 上) */
  const levelCounts = useMemo(() => {
    const m = new Map<string, number>();
    let unset = 0;
    for (const t of templates) {
      if (!t.honorLevel) {
        unset += 1;
        continue;
      }
      m.set(t.honorLevel, (m.get(t.honorLevel) ?? 0) + 1);
    }
    return { byLevel: m, unset, total: templates.length };
  }, [templates]);

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <AwardIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">证书模板</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            可视化设计证书外观,保存为模板供后续发证使用 · 共 {templates.length} 个
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["certificate-templates"] })}
          className="p-2 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
          title="刷新"
        >
          <RefreshCwIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate("/admin/certificate-templates/new")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          新建模板
        </button>
      </div>

      {/* Body:左侧分类侧栏 + 右侧网格 */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-[200px_1fr]">
        {/* 左侧:荣誉等级分类 */}
        <aside className="bg-white border-r border-[#E9E9E9] p-3 overflow-auto">
          <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide px-2 mb-2 flex items-center gap-1">
            <TagIcon className="w-3 h-3" />
            荣誉等级
          </div>
          <SidebarItem
            label="全部"
            count={levelCounts.total}
            active={activeLevel === "all"}
            onClick={() => setActiveLevel("all")}
          />
          {levelOptions.map((opt) => (
            <SidebarItem
              key={opt.code}
              label={opt.label}
              count={levelCounts.byLevel.get(opt.code) ?? 0}
              active={activeLevel === opt.code}
              onClick={() => setActiveLevel(opt.code)}
            />
          ))}
          {levelCounts.unset > 0 && (
            <SidebarItem
              label="(未设置等级)"
              count={levelCounts.unset}
              active={activeLevel === "_unset"}
              onClick={() => setActiveLevel("_unset")}
              muted
            />
          )}
          <p className="mt-3 px-2 text-[10px] text-[#9CA3AF] leading-relaxed">
            等级列表来自字典 <code className="font-mono">cert_honor_level</code>,
            可在「系统设置 → 数据字典」编辑
          </p>
        </aside>

        {/* 右侧:模板网格 */}
        <div className="overflow-auto p-6">
          {listQuery.isLoading ? (
            <div className="text-sm text-[#9CA3AF]">加载中…</div>
          ) : templates.length === 0 ? (
            <EmptyState onNew={() => navigate("/admin/certificate-templates/new")} />
          ) : filteredTemplates.length === 0 ? (
            <div className="text-sm text-[#9CA3AF] py-8 text-center">
              该等级下还没有模板
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onToggle={() => toggleMut.mutate({ id: t.id, active: !t.active })}
                  onDuplicate={() => duplicateMut.mutate(t.id)}
                  duplicating={duplicateMut.isPending}
                  onDelete={() => setConfirmDel(t)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDel && (
        <ConfirmDeleteDialog
          template={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteMut.mutate(confirmDel.id)}
          loading={deleteMut.isPending}
        />
      )}
    </div>
  );
}

/* ─── 侧栏分类项 ─── */

function SidebarItem({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-party-soft text-[var(--party-primary)] font-semibold"
          : muted
            ? "text-[#9CA3AF] hover:bg-[#F7F8FA]"
            : "text-[#374151] hover:bg-[#F7F8FA]"
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          active ? "bg-[var(--party-primary)] text-white" : "bg-[#F0F0F0] text-[#9CA3AF]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── */

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgb(255, 240, 242)" }}
      >
        <AwardIcon className="w-8 h-8" style={{ color: PARTY }} />
      </div>
      <h3 className="text-base font-bold text-[#1A1A1A] mb-1">还没有证书模板</h3>
      <p className="text-xs text-[#9CA3AF] mb-4 max-w-md">
        点击"新建模板"进入可视化设计器,通过拖拽元素、绑定变量字段(姓名/证书编号/...)
        设计你的第一份证书
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: PARTY }}
      >
        <PlusIcon className="w-4 h-4" />
        新建模板
      </button>
    </div>
  );
}

function getOrientation(w: number, h: number): { label: string; cls: string } {
  if (Math.abs(w - h) < 20) {
    return { label: "方形", cls: "bg-[#EEF2FF] text-[#4F46E5]" };
  }
  if (w > h) {
    return { label: "横版", cls: "bg-[#FEF3C7] text-[#B45309]" };
  }
  return { label: "竖版", cls: "bg-[#DBEAFE] text-[#1E40AF]" };
}

function TemplateCard({
  template,
  onToggle,
  onDuplicate,
  duplicating,
  onDelete,
}: {
  template: CertificateTemplateDto;
  onToggle: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
  onDelete: () => void;
}) {
  const orientation = getOrientation(template.width, template.height);
  return (
    <div
      className={`group relative bg-white rounded-xl overflow-hidden border border-[#E9E9E9] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-[var(--party-primary)] ${
        template.active ? "" : "opacity-60"
      }`}
    >
      {/* ── 缩略图区 — 所有卡片统一 4:3 ── */}
      <Link
        to={`/admin/certificate-templates/${template.id}/edit`}
        className="block relative bg-gradient-to-br from-[#F4F5F8] to-[#E9EBF0] overflow-hidden"
        style={{ aspectRatio: "4 / 3" }}
      >
        {template.thumbnail ? (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <img
              src={template.thumbnail}
              alt={template.name}
              className="max-w-full max-h-full object-contain shadow-sm bg-white"
              style={{
                aspectRatio: `${template.width} / ${template.height}`,
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#B5B9C0] gap-1.5">
            <ImageOffIcon className="w-7 h-7" />
            <span className="text-[10px]">暂无预览</span>
          </div>
        )}

        {/* 左上:荣誉代码徽章(替代旧的横/竖) */}
        {template.honorCode ? (
          <span
            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--party-primary)] text-white shadow-sm"
            title="荣誉代码"
          >
            {template.honorCode}
          </span>
        ) : (
          <span
            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 shadow-sm"
            title="未配置荣誉代码,无法用于发证"
          >
            缺荣誉代码
          </span>
        )}

        {/* 右上:横/竖 + 尺寸 + 禁用蒙层 */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${orientation.cls}`}>
            {orientation.label}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/85 text-[#6B7280] border border-[#E9E9E9] shadow-sm"
            title="画布尺寸"
          >
            {template.width}×{template.height}
          </span>
          {!template.active && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#9CA3AF] text-white">
              已禁用
            </span>
          )}
        </div>
      </Link>

      {/* ── 信息区 ── */}
      <div className="p-3 flex flex-col gap-1.5">
        <div
          className="font-semibold text-sm text-[#1A1A1A] truncate leading-tight"
          title={template.name}
        >
          {template.name}
        </div>

        {/* V3 徽章行 + 落款单位 — 全部并到一行(自动换行) */}
        <div className="flex items-center gap-1 flex-wrap min-h-[18px]">
          {template.honorType && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                template.honorType === "collective"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
            >
              {HONOR_TYPE_LABEL[template.honorType]}
            </span>
          )}
          {template.honorLevel && (
            <HonorLevelBadge level={template.honorLevel} />
          )}
          {template.category && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#F7F8FA] text-[#6B7280] border border-[#E9E9E9]">
              {template.category}
            </span>
          )}
          {template.issuingOrgName && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-start gap-0.5 max-w-full"
              title={`落款单位:${template.issuingOrgName}`}
            >
              <Building2Icon className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
              <span className="break-words">{template.issuingOrgName}</span>
            </span>
          )}
        </div>

        {/* 操作行 — 编辑占主、启停/复制/删放右 */}
        <div className="mt-1.5 flex items-center gap-1">
          <Link
            to={`/admin/certificate-templates/${template.id}/edit`}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium border border-[#E9E9E9] text-[#374151] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-party-soft transition-colors"
          >
            <EditIcon className="w-3 h-3" />
            编辑
          </Link>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#F7F8FA]"
            title={template.active ? "禁用" : "启用"}
          >
            {template.active ? (
              <PowerIcon className="w-3.5 h-3.5" />
            ) : (
              <PowerOffIcon className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onDuplicate}
            disabled={duplicating}
            className="p-1.5 rounded-md text-[#6B7280] hover:text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50 disabled:cursor-wait"
            title="复制模板"
          >
            <CopyIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEE2E2]"
            title="删除"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* 等级徽章 — 与发证 Step 2 同色阶,集中由 lib 维护 label */
function HonorLevelBadge({ level }: { level: HonorLevel }) {
  const cls = {
    national: "bg-red-50 text-red-700 border-red-200",
    provincial: "bg-orange-50 text-orange-700 border-orange-200",
    corporate: "bg-blue-50 text-blue-700 border-blue-200",
    company: "bg-slate-50 text-slate-700 border-slate-200",
  }[level];
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {HONOR_LEVEL_LABEL[level]}
    </span>
  );
}

function ConfirmDeleteDialog({
  template,
  onCancel,
  onConfirm,
  loading,
}: {
  template: CertificateTemplateDto;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg w-[400px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[#1A1A1A] mb-2">删除模板?</h3>
        <p className="text-sm text-[#6B7280] mb-4">
          模板「<span className="font-medium">{template.name}</span>」将被永久删除,不可恢复。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm font-medium text-white bg-[#EF4444] hover:bg-[#DC2626]"
          >
            {loading ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
