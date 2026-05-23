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
  type CertificateTemplateDto,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
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
      className={`group relative bg-white rounded-lg overflow-hidden border border-[#E9E9E9] shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
        template.active ? "" : "opacity-60"
      }`}
    >
      {/* ── 缩略图区 — 所有卡片统一 4:3,横/竖版都按 object-contain 居中 ── */}
      <Link
        to={`/admin/certificate-templates/${template.id}/edit`}
        className="block relative bg-gradient-to-br from-[#F4F5F8] to-[#E9EBF0] overflow-hidden"
        style={{ aspectRatio: "4 / 3" }}
      >
        {template.thumbnail ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <img
              src={template.thumbnail}
              alt={template.name}
              className="max-w-full max-h-full object-contain shadow-sm bg-white"
              style={{
                // 保持原图比例的同时,顶满 4:3 容器(取较紧的一边)
                aspectRatio: `${template.width} / ${template.height}`,
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#B5B9C0] gap-1.5">
            <ImageOffIcon className="w-8 h-8" />
            <span className="text-[10px]">暂无预览</span>
          </div>
        )}

        {/* 左上角:横/竖标签 */}
        <span
          className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${orientation.cls}`}
        >
          {orientation.label}
        </span>

        {/* 禁用蒙层标签 */}
        {!template.active && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#9CA3AF] text-white">
            已禁用
          </span>
        )}
      </Link>

      {/* ── 信息区 ── */}
      <div className="p-3.5 flex flex-col gap-1.5">
        <div
          className="font-medium text-sm text-[#1A1A1A] truncate leading-tight"
          title={template.name}
        >
          {template.name}
        </div>
        <div className="text-[11px] text-[#9CA3AF] flex items-center gap-1.5 flex-wrap">
          {template.category && (
            <span className="px-1.5 py-0.5 rounded bg-[#F7F8FA] text-[#6B7280]">
              {template.category}
            </span>
          )}
          <span className="font-mono">
            {template.width} × {template.height}
          </span>
        </div>

        {/* 操作行 */}
        <div className="mt-2 flex items-center gap-1.5">
          <Link
            to={`/admin/certificate-templates/${template.id}/edit`}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-[#FFF7F8] transition-colors"
          >
            <EditIcon className="w-3 h-3" />
            编辑
          </Link>
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-[#6B7280] hover:bg-[#F7F8FA]"
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
            className="p-1.5 rounded text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEE2E2]"
            title="删除"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
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
