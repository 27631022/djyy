import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AwardIcon,
  PlusIcon,
  RefreshCwIcon,
  EditIcon,
  TrashIcon,
  PowerIcon,
  PowerOffIcon,
  ImageOffIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateTemplateApi,
  HONOR_LEVEL_LABEL,
  HONOR_TYPE_LABEL,
  type CertificateTemplateDto,
  type HonorLevel,
} from "@/features/certificate";

const PARTY = "var(--party-primary)";

export default function CertificateTemplatesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listQuery = useQuery({
    queryKey: ["certificate-templates"],
    queryFn: () => certificateTemplateApi.list(),
  });

  const [confirmDel, setConfirmDel] = useState<CertificateTemplateDto | null>(null);

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

  const templates = listQuery.data ?? [];

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

      {/* List body */}
      <div className="flex-1 overflow-auto p-6">
        {listQuery.isLoading ? (
          <div className="text-sm text-[#9CA3AF]">加载中…</div>
        ) : templates.length === 0 ? (
          <EmptyState onNew={() => navigate("/admin/certificate-templates/new")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onToggle={() => toggleMut.mutate({ id: t.id, active: !t.active })}
                onDelete={() => setConfirmDel(t)}
              />
            ))}
          </div>
        )}
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
  onDelete,
}: {
  template: CertificateTemplateDto;
  onToggle: () => void;
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

        {/* 右上:横/竖 + 禁用蒙层 */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${orientation.cls}`}>
            {orientation.label}
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

        {/* V3 徽章行:类型 + 等级 + 分类 */}
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
        </div>

        {/* 尺寸小行 */}
        <div className="text-[10px] text-[#9CA3AF] font-mono">
          {template.width} × {template.height}
        </div>

        {/* 操作行 — 编辑占主、启停/删放右 */}
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
