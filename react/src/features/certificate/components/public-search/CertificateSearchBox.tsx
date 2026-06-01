import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  SearchIcon,
  AwardIcon,
  CheckCircle2Icon,
  BanIcon,
  DownloadIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  certificatePublicApi,
  type CertificatePublicListItem,
  type CertificatePublicDetail,
} from "../../api";
import { buildPdfFileName } from "../../lib/certificateNumber";
import { triggerDownload } from "../../lib/certificatePdf";

interface CertificateSearchBoxProps {
  /**
   * 嵌入模式 — 去掉容器 padding / 自带卡片样式,
   * 让外层(如未来的"首页综合查询"页)可以自由控制 UI 布局
   */
  embedded?: boolean;
  /** 自定义占位文本 */
  placeholder?: string;
}

/**
 * 公开证书查询/验证组件 — 设计成可独立挂载,任何前台页面都能复用。
 *
 * 用法:
 *   1. /verify 页:挂这个组件(默认非嵌入,带卡片样式)
 *   2. 未来"首页综合查询":<CertificateSearchBox embedded /> 即可
 *
 * 状态机:
 *   idle  → 用户键入 → submit → loading → results(空 / 多张 / 单张)
 *   results 单张时直接展开详情区(含 PDF 下载按钮)
 */
export function CertificateSearchBox({
  embedded = false,
  placeholder = "输入证书编号查询 · 例:2024-QDJL-100-001",
}: CertificateSearchBoxProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CertificatePublicListItem[] | null>(null);
  const [activeDetail, setActiveDetail] = useState<CertificatePublicDetail | null>(null);

  const searchMut = useMutation({
    mutationFn: () => certificatePublicApi.search(q.trim()),
    onSuccess: (data) => {
      setResults(data);
      setActiveDetail(null);
      if (data.length === 1) {
        // 单条直接展开详情
        verifyMut.mutate(data[0].publicToken);
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "查询失败"),
  });

  const verifyMut = useMutation({
    mutationFn: (token: string) => certificatePublicApi.verifyByToken(token),
    onSuccess: (data) => setActiveDetail(data),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "证书加载失败"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      toast.error("请输入证书编号");
      return;
    }
    searchMut.mutate();
  }

  const containerCls = embedded
    ? ""
    : "bg-white rounded-xl border border-[#E9E9E9] shadow-sm p-6";

  return (
    <div className={containerCls}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-10 pr-3 py-2.5 text-sm font-mono rounded-lg border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searchMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          {searchMut.isPending ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <SearchIcon className="w-4 h-4" />
          )}
          查询
        </button>
      </form>

      {/* 结果 */}
      <div className="mt-4">
        {results === null ? (
          <Hint />
        ) : results.length === 0 ? (
          <NotFound query={q} />
        ) : results.length === 1 && activeDetail ? (
          <CertificateDetailCard detail={activeDetail} />
        ) : results.length === 1 && verifyMut.isPending ? (
          <div className="flex items-center justify-center py-8 text-xs text-[#9CA3AF]">
            <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
            加载证书详情…
          </div>
        ) : (
          <MultipleResults
            results={results}
            onSelect={(r) => verifyMut.mutate(r.publicToken)}
            loading={verifyMut.isPending ? verifyMut.variables : null}
          />
        )}
        {results !== null && results.length > 1 && activeDetail && (
          <div className="mt-4">
            <CertificateDetailCard detail={activeDetail} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 子组件 ─── */

function Hint() {
  return (
    <div className="rounded-lg border border-dashed border-[#E9E9E9] p-6 text-center">
      <AwardIcon className="w-8 h-8 mx-auto text-[#9CA3AF] mb-2" />
      <p className="text-sm text-[#6B7280]">输入完整的证书编号查询并验证真伪</p>
      <p className="text-[11px] text-[#9CA3AF] mt-1">
        编号格式:<span className="font-mono">年份-荣誉代码-总数-序号</span>
      </p>
    </div>
  );
}

function NotFound({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
      <AlertCircleIcon className="w-8 h-8 mx-auto text-amber-500 mb-2" />
      <p className="text-sm text-amber-900">未查询到证书</p>
      <p className="text-xs text-amber-700 mt-1">
        编号 <span className="font-mono">{query}</span> 不存在于本系统
      </p>
    </div>
  );
}

function MultipleResults({
  results,
  onSelect,
  loading,
}: {
  results: CertificatePublicListItem[];
  onSelect: (r: CertificatePublicListItem) => void;
  loading: string | null;
}) {
  return (
    <div>
      <div className="text-xs text-[#6B7280] mb-2">找到 {results.length} 条匹配,点击查看详情:</div>
      <div className="rounded-lg border border-[#E9E9E9] divide-y divide-[#F0F0F0]">
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            disabled={loading === r.publicToken}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F7F8FA] disabled:opacity-50"
          >
            <div>
              <div className="font-mono text-sm text-[#1A1A1A]">{r.certNo}</div>
              <div className="text-xs text-[#9CA3AF] mt-0.5">
                {r.recipientName} · {new Date(r.issueDate).toLocaleDateString("zh-CN")}
              </div>
            </div>
            {loading === r.publicToken ? (
              <Loader2Icon className="w-4 h-4 animate-spin text-[var(--party-primary)]" />
            ) : (
              <span className="text-xs text-[var(--party-primary)]">查看 →</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CertificateDetailCard({ detail }: { detail: CertificatePublicDetail }) {
  const downloadMut = useMutation({
    mutationFn: () => certificatePublicApi.downloadFile(detail.publicToken),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      triggerDownload(
        url,
        buildPdfFileName({
          honorName: detail.template?.name ?? detail.honorCode,
          honorCode: detail.honorCode,
          recipientName: detail.recipientName,
          recipientEmpNo: detail.recipientEmpNo,
        }),
      );
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "下载失败"),
  });

  return (
    <div
      className={`rounded-lg border-2 p-5 ${
        detail.revoked
          ? "border-red-200 bg-red-50"
          : "border-green-200 bg-green-50"
      }`}
    >
      {/* 真伪标识 */}
      <div className="flex items-center gap-2 mb-4">
        {detail.revoked ? (
          <>
            <BanIcon className="w-5 h-5 text-red-600" />
            <h3 className="text-base font-bold text-red-700">证书已撤销</h3>
            {detail.revokedReason && (
              <span className="ml-auto text-xs text-red-600">
                原因:{detail.revokedReason}
              </span>
            )}
          </>
        ) : (
          <>
            <CheckCircle2Icon className="w-5 h-5 text-green-600" />
            <h3 className="text-base font-bold text-green-700">证书真实有效</h3>
          </>
        )}
      </div>

      {/* 证书预览 — 轻量缩略图(任何上下文都能 <img> 渲染;不用 data:PDF iframe,避免非 HTTPS 下空白) */}
      {detail.thumbnail ? (
        <div className="mb-4 rounded border border-[#E9E9E9] bg-white overflow-hidden">
          <img src={detail.thumbnail} alt="证书预览" className="w-full block" />
        </div>
      ) : (
        <div className="mb-4 rounded border border-dashed border-[#E9E9E9] bg-white/60 py-6 text-center text-xs text-[#6B7280]">
          该证书为上传文件,点下方「下载证书」查看原件
        </div>
      )}

      {/* 信息 */}
      <div className="bg-white rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Info label="证书编号">
          <span className="font-mono text-[#1A1A1A]">{detail.certNo}</span>
        </Info>
        <Info label="模板">{detail.template?.name ?? "—"}</Info>
        <Info label="持证人">{detail.recipientName}</Info>
        {detail.recipientEmpNo && (
          <Info label="员工编号">
            <span className="font-mono">{detail.recipientEmpNo}</span>
          </Info>
        )}
        {detail.recipientDept && <Info label="单位/部门">{detail.recipientDept}</Info>}
        <Info label="表彰年度">
          <span className="font-mono">{detail.yearLabel}</span>
        </Info>
        <Info label="颁发日期">
          {new Date(detail.issueDate).toLocaleDateString("zh-CN")}
        </Info>
        {detail.validUntil && (
          <Info label="有效期至">
            {new Date(detail.validUntil).toLocaleDateString("zh-CN")}
          </Info>
        )}
        {detail.issuingOrgName && <Info label="颁发机构">{detail.issuingOrgName}</Info>}
        <Info label="发证人">{detail.issuerName}</Info>
        <Info label="批次">
          第 {detail.batchSeq} / 共 {detail.batchTotal} 张
        </Info>
      </div>

      {/* 下载 — 按需拉取原件(避免验证页加载就传十几 MB) */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => downloadMut.mutate()}
          disabled={downloadMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          {downloadMut.isPending ? (
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <DownloadIcon className="w-3.5 h-3.5" />
          )}
          下载证书 PDF
        </button>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-[#9CA3AF] flex-shrink-0">{label}</span>
      <span className="text-[#1A1A1A] truncate">{children}</span>
    </div>
  );
}
