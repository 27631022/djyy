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
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E9E9E9] flex items-center gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

function TemplateCard({
  template,
  onToggle,
  onDelete,
}: {
  template: CertificateTemplateDto;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative border rounded-lg overflow-hidden bg-white transition-shadow hover:shadow-md ${
        template.active ? "border-[#E9E9E9]" : "border-[#F0F0F0] opacity-60"
      }`}
    >
      {/* 缩略图区(Phase E 加真实缩略图,V1 占位灰底) */}
      <Link
        to={`/admin/certificate-templates/${template.id}/edit`}
        className="block bg-[#F7F8FA] relative"
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
      >
        {template.thumbnail ? (
          <img
            src={template.thumbnail}
            alt={template.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#9CA3AF]">
            <AwardIcon className="w-10 h-10 opacity-40" />
          </div>
        )}
        {!template.active && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#9CA3AF] text-white">
            已禁用
          </span>
        )}
      </Link>

      {/* 信息区 */}
      <div className="p-3">
        <div className="font-medium text-sm text-[#1A1A1A] truncate" title={template.name}>
          {template.name}
        </div>
        <div className="mt-0.5 text-[11px] text-[#9CA3AF] flex items-center gap-2">
          {template.category && (
            <span className="px-1.5 py-0.5 rounded bg-[#F7F8FA]">{template.category}</span>
          )}
          <span>
            {template.width}×{template.height}
          </span>
        </div>

        {/* 操作 */}
        <div className="mt-3 flex items-center gap-1">
          <Link
            to={`/admin/certificate-templates/${template.id}/edit`}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border border-[#E9E9E9] hover:bg-[#F7F8FA]"
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
            className="p-1.5 rounded text-[#EF4444] hover:bg-[#FEE2E2]"
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
