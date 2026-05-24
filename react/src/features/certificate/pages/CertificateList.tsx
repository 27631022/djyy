import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AwardIcon,
  PlusIcon,
  RefreshCwIcon,
  DownloadIcon,
  CheckCircle2Icon,
  BanIcon,
  Loader2Icon,
  PackageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificateIssueApi,
  type CertificateListItemDto,
} from "@/features/certificate";
import { buildPdfFileName } from "../lib/certificateNumber";
import { triggerDownload } from "../lib/certificatePdf";

const PARTY = "var(--party-primary)";

export default function CertificateListPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const highlightId = params.get("highlight");

  const [filterRevoked, setFilterRevoked] = useState<"all" | "active" | "revoked">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRevoke, setConfirmRevoke] = useState<CertificateListItemDto | null>(null);

  const listQuery = useQuery({
    queryKey: ["certificates", { revoked: filterRevoked }],
    queryFn: () =>
      certificateIssueApi.list(
        filterRevoked === "all"
          ? {}
          : { revoked: filterRevoked === "revoked" },
      ),
  });

  const certs = listQuery.data ?? [];
  const selectedActive = useMemo(
    () => certs.filter((c) => selectedIds.has(c.id)),
    [certs, selectedIds],
  );

  const bulkMut = useMutation({
    mutationFn: (ids: string[]) => certificateIssueApi.bulkDownload(ids),
    onSuccess: (blob) => {
      // Blob → object URL → 触发下载
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp =
        `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` +
        `${String(now.getDate()).padStart(2, "0")}-` +
        `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      triggerDownload(url, `djyy-certificates-${stamp}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSelectedIds(new Set());
      toast.success(`已打包 ${selectedActive.length} 张证书`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "批量下载失败"),
  });

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === certs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(certs.map((c) => c.id)));
  }

  const allChecked = certs.length > 0 && selectedIds.size === certs.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < certs.length;

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <header className="px-6 py-4 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <AwardIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#1A1A1A]">已发证书</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            共 {certs.length} 张
            {selectedIds.size > 0 && (
              <>
                {" · "}
                <span className="text-[var(--party-primary)] font-medium">
                  已选 {selectedIds.size}
                </span>
              </>
            )}
          </p>
        </div>

        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => bulkMut.mutate(Array.from(selectedIds))}
            disabled={bulkMut.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-[var(--party-primary)] text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50"
          >
            {bulkMut.isPending ? (
              <Loader2Icon className="w-4 h-4 animate-spin" />
            ) : (
              <PackageIcon className="w-4 h-4" />
            )}
            批量下载 ({selectedIds.size})
          </button>
        )}

        {/* 过滤 */}
        <div className="inline-flex rounded-md border border-[#E9E9E9] overflow-hidden text-xs">
          {(["all", "active", "revoked"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setFilterRevoked(k);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 ${
                filterRevoked === k
                  ? "bg-[var(--party-primary)] text-white"
                  : "bg-white text-[#6B7280] hover:bg-[#F7F8FA]"
              } ${k !== "all" ? "border-l border-[#E9E9E9]" : ""}`}
            >
              {k === "all" ? "全部" : k === "active" ? "有效" : "已撤销"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["certificates"] })}
          className="p-2 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
          title="刷新"
        >
          <RefreshCwIcon className="w-4 h-4" />
        </button>
        <Link
          to="/admin/certificates/issue"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-4 h-4" />
          发证
        </Link>
      </header>

      {/* List body */}
      <div className="flex-1 overflow-auto p-6">
        {listQuery.isLoading ? (
          <div className="text-sm text-[#9CA3AF]">加载中…</div>
        ) : certs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="bg-white rounded-lg border border-[#E9E9E9] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F8FA] border-b border-[#E9E9E9]">
                <tr className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5">证书编号</th>
                  <th className="text-left px-4 py-2.5">持证人</th>
                  <th className="text-left px-4 py-2.5">模板</th>
                  <th className="text-left px-4 py-2.5">颁发日期</th>
                  <th className="text-left px-4 py-2.5">状态</th>
                  <th className="text-right px-4 py-2.5">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {certs.map((c) => (
                  <CertRow
                    key={c.id}
                    cert={c}
                    selected={selectedIds.has(c.id)}
                    onToggle={() => toggleOne(c.id)}
                    onRevoke={() => setConfirmRevoke(c)}
                    highlighted={c.id === highlightId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmRevoke && (
        <RevokeDialog
          cert={confirmRevoke}
          onCancel={() => setConfirmRevoke(null)}
          onDone={() => setConfirmRevoke(null)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgb(255, 240, 242)" }}
      >
        <AwardIcon className="w-8 h-8" style={{ color: PARTY }} />
      </div>
      <h3 className="text-base font-bold text-[#1A1A1A] mb-1">还没发过证书</h3>
      <p className="text-xs text-[#9CA3AF] mb-4 max-w-md">
        点击右上「发证」选模板 → 填变量 → 一键生成并下载证书 PDF
      </p>
      <Link
        to="/admin/certificates/issue"
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: PARTY }}
      >
        <PlusIcon className="w-4 h-4" />
        去发证
      </Link>
    </div>
  );
}

function CertRow({
  cert,
  selected,
  highlighted,
  onToggle,
  onRevoke,
}: {
  cert: CertificateListItemDto;
  selected: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onRevoke: () => void;
}) {
  const qc = useQueryClient();
  const downloadMut = useMutation({
    mutationFn: () => certificateIssueApi.get(cert.id),
    onSuccess: (full) => {
      const pdfData = full.pdfData ?? full.externalFileData;
      if (!pdfData) {
        toast.error("证书 PDF 文件缺失");
        return;
      }
      const filename = buildPdfFileName({
        honorName: cert.template?.name ?? cert.honorCode,
        honorCode: cert.honorCode,
        recipientName: cert.recipientName,
        recipientEmpNo: cert.recipientEmpNo,
      });
      triggerDownload(pdfData, filename);
      qc.invalidateQueries({ queryKey: ["certificate", cert.id] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "下载失败"),
  });

  return (
    <tr
      className={`transition-colors ${
        highlighted
          ? "bg-amber-50"
          : cert.revoked
          ? "bg-[#FAFAFA]"
          : selected
          ? "bg-party-soft"
          : "hover:bg-[#F7F8FA]"
      }`}
    >
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="cursor-pointer"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="font-mono text-xs text-[#1A1A1A]">{cert.certNo}</div>
        <div className="text-[10px] text-[#9CA3AF] mt-0.5">
          批 {cert.batchSeq}/{cert.batchTotal}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="text-sm text-[#1A1A1A]">{cert.recipientName}</div>
        {cert.recipientEmpNo && (
          <div className="text-[10px] text-[#9CA3AF] font-mono">{cert.recipientEmpNo}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="text-xs text-[#1A1A1A]">{cert.template?.name ?? "—"}</div>
        {cert.source === "external" && (
          <span className="inline-block mt-0.5 text-[9px] px-1 py-px rounded bg-blue-100 text-blue-700">
            外部证书
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-[#6B7280]">
        {new Date(cert.issueDate).toLocaleDateString("zh-CN")}
      </td>
      <td className="px-4 py-2.5">
        {cert.revoked ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700"
            title={cert.revokedReason ?? undefined}
          >
            <BanIcon className="w-3 h-3" />
            已撤销
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
            <CheckCircle2Icon className="w-3 h-3" />
            有效
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => downloadMut.mutate()}
            disabled={downloadMut.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#6B7280] hover:text-[var(--party-primary)] hover:bg-party-soft disabled:opacity-50"
          >
            {downloadMut.isPending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="w-3.5 h-3.5" />
            )}
            下载
          </button>
          {!cert.revoked && (
            <button
              type="button"
              onClick={onRevoke}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
            >
              <BanIcon className="w-3.5 h-3.5" />
              撤销
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RevokeDialog({
  cert,
  onCancel,
  onDone,
}: {
  cert: CertificateListItemDto;
  onCancel: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => certificateIssueApi.revoke(cert.id, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      toast.success("已撤销");
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "撤销失败"),
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
          <BanIcon className="w-4 h-4 text-red-600" />
          撤销证书?
        </h3>
        <p className="text-sm text-[#6B7280] mb-3">
          证书 <span className="font-mono text-[#1A1A1A]">{cert.certNo}</span>
          (持证人:<span className="font-medium">{cert.recipientName}</span>)
          将被标记为<span className="text-red-600 font-medium">已撤销</span>,
          公开验证页将显示撤销状态,数据本身保留。
        </p>
        <label className="block">
          <span className="block text-xs text-[#6B7280] mb-1">撤销原因(可选)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="如:个人申请取消 / 证书信息有误 / ..."
            className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none resize-none"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm border border-[#E9E9E9] hover:bg-[#F7F8FA]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-3 py-1.5 rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {mut.isPending ? "撤销中…" : "确认撤销"}
          </button>
        </div>
      </div>
    </div>
  );
}
