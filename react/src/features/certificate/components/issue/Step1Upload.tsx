/**
 * 发证向导 Step 1 — 上传 / 拍照 / 跳过 AI 选择来源 + AI 抽取结果展示。
 *
 * 此组件无内部业务状态(extract 结果由父组件持有,以便 Phase 2 的 draft 持久化能透写),
 * 仅持有上传 input 的 ref 和当前抽取 mutation 的 pending 状态。
 *
 * Phase 4 起,Step 2 接管 multi-honor records 表格;Step 1 不再负责"选哪个 honor",
 * 但本组件仍保留 selectedHonorIdx 兼容当前(Phase 3)的单 honor 流。
 */

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";

import { certificateIssueApi, type ExtractHonorResponse } from "../../api";

/* ─── 主组件 ─── */

export function Step1Upload({
  extractResult,
  onExtractDone,
  onReset,
  onSkipAI,
}: {
  extractResult: ExtractHonorResponse | null;
  onExtractDone: (r: ExtractHonorResponse) => void;
  /** 用户点「重新上传」清掉抽取结果(同时父组件应清掉 draft.extracted) */
  onReset: () => void;
  onSkipAI: () => void;
}) {
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const extractMut = useMutation({
    mutationFn: (f: File) => certificateIssueApi.extract(f),
    onSuccess: (r) => {
      if (r.honors.length === 0) {
        toast.warning("AI 未识别到任何荣誉项,请检查文件内容或人工填写");
      } else {
        const total = r.honors.reduce((s, h) => s + h.recipients.length, 0);
        const via =
          r.source.usedProvider && r.source.pipeline
            ? ` · 走 ${r.source.usedProvider}(${r.source.pipeline})`
            : "";
        toast.success(`提取完成:${r.honors.length} 项荣誉,${total} 位对象${via}`);
      }
      onExtractDone(r);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "提取失败"),
  });

  function handleFile(f: File) {
    extractMut.mutate(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (extractMut.isPending) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    // 拖入不受 input accept 限制,这里补一道扩展名校验(点击上传已被 accept 限定)
    if (!/\.(docx?|pdf)$/i.test(f.name)) {
      toast.error("仅支持 .doc / .docx / .pdf 文件");
      return;
    }
    handleFile(f);
  }

  // 抽取结果存在 → 渲染结果面板;否则渲染上传面板
  if (extractResult) {
    return (
      <ExtractedResults
        result={extractResult}
        onReset={() => {
          if (docInputRef.current) docInputRef.current.value = "";
          onReset();
        }}
      />
    );
  }

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第一步 · 上传表彰文件</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        上传一份表彰通知 / 红头文件(Word 或 PDF),AI 会自动提取荣誉名称、表彰年份、
        受表彰人员清单。支持「两优一先」一份文件多荣誉的情况。
      </p>

      {/* 单一上传入口 — 大块面板,鼠标即点即传 */}
      <button
        type="button"
        onClick={() => docInputRef.current?.click()}
        disabled={extractMut.isPending}
        onDragOver={(e) => {
          e.preventDefault();
          if (!extractMut.isPending) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`w-full bg-gradient-to-br from-purple-50 to-blue-50 border-2 rounded-lg p-8 text-left transition-all hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-5 ${
          dragOver
            ? "border-purple-500 bg-purple-100 ring-2 ring-purple-300"
            : "border-purple-200 hover:border-purple-400"
        }`}
      >
        <div className="w-14 h-14 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0">
          {extractMut.isPending ? (
            <Loader2Icon className="w-7 h-7 animate-spin text-purple-600" />
          ) : (
            <FileTextIcon className="w-7 h-7 text-purple-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#1A1A1A] mb-1">
            {extractMut.isPending
              ? "AI 解析中,请稍候…"
              : dragOver
                ? "松开鼠标即可上传"
                : "点击或拖拽上传文件"}
          </div>
          <div className="text-[11px] text-[#6B7280] leading-relaxed">
            支持 .doc / .docx / .pdf · AI 自动识别多荣誉 + 受表彰人员(姓名 + 员工编号 + 单位)
          </div>
        </div>
      </button>
      <input
        ref={docInputRef}
        type="file"
        accept=".doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      <div className="mt-6 pt-4 border-t border-[#F0F0F0] flex items-center justify-between">
        <span className="text-xs text-[#9CA3AF]">没有文件? 也可以直接手动填表发证</span>
        <button
          type="button"
          onClick={onSkipAI}
          className="text-xs px-3 py-1.5 rounded border border-[#E9E9E9] hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          跳过 AI,手动填 →
        </button>
      </div>
    </div>
  );
}

/* ─── ExtractedResults:抽取完成后的纯展示 — 不让选,不带内部 Next 按钮 ─── */

function ExtractedResults({
  result,
  onReset,
}: {
  result: ExtractHonorResponse;
  onReset: () => void;
}) {
  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1 flex items-center gap-2">
        <SparklesIcon className="w-4 h-4 text-purple-500" />
        AI 提取完成
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-xs font-normal text-[#9CA3AF] hover:text-red-600"
        >
          重新上传
        </button>
      </h2>
      <p className="text-xs text-[#9CA3AF] mb-3">
        源:{result.source.fileName || "(草稿恢复)"}
        {result.source.textLength ? ` · ${result.source.textLength} 字` : ""}
        {result.source.usedProvider
          ? ` · 由 ${result.source.usedProvider}(${result.source.usedModel ?? ""}) 提取`
          : ""}
        {result.source.completionTokens
          ? ` · ${result.source.promptTokens ?? "?"}+${result.source.completionTokens} tokens`
          : ""}
      </p>

      <div className="rounded-lg bg-[#F7F8FA] p-3 mb-4 text-xs grid grid-cols-2 gap-2">
        <InfoLine label="文件级年份" value={result.yearLabel || "—"} mono />
        <InfoLine label="文件级颁发日期" value={result.issueDate || "—"} mono />
      </div>

      {result.honors.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <AlertCircleIcon className="w-6 h-6 mx-auto text-amber-500 mb-1" />
          <div className="text-sm text-amber-900">未识别到任何荣誉项</div>
          <div className="text-[11px] text-amber-700 mt-1">
            可点「重新上传」换一份文件,或返回「跳过 AI」手动填
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">
              识别到 <span className="text-[var(--party-primary)]">{result.honors.length}</span>{" "}
              项荣誉
            </h3>
            <span className="text-[11px] text-[#9CA3AF]">
              进入下一步后,所有荣誉会成为表彰记录候选
            </span>
          </div>

          <div className="space-y-2">
            {result.honors.map((h, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#E9E9E9] bg-white p-3"
              >
                <div className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
                  {h.honorName}
                  {/* V3:展示荣誉类型徽章(后端 normalizeHonorType 保证有值) */}
                  {h.honorType && <HonorTypeBadge type={h.honorType} />}
                </div>
                {h.issuingOrg && (
                  <div className="text-[11px] text-[#6B7280] mt-0.5">
                    颁发机构:{h.issuingOrg}
                  </div>
                )}
                <div className="mt-1.5 text-[11px] text-[#9CA3AF]">
                  受表彰对象 {h.recipients.length} 位
                  {h.recipients.length > 0 && (
                    <span className="ml-2 font-mono text-[#6B7280]">
                      {h.recipients
                        .slice(0, 5)
                        .map((r) => r.name)
                        .join("、")}
                      {h.recipients.length > 5 && ` 等`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 小元件 ─── */

function InfoLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-[#9CA3AF]">{label}</span>
      <span className={`text-[#1A1A1A] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

/**
 * 荣誉类型徽章(V3,2 类) — 颜色按语义:个人=蓝、集体=紫
 * 兼容老数据:任何非 'individual' 的值(含老 'unit')都按 collective 显示
 */
function HonorTypeBadge({ type }: { type: string }) {
  const normalized: "individual" | "collective" =
    type === "individual" ? "individual" : "collective";
  const map = {
    individual: { label: "个人", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    collective: { label: "集体", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  }[normalized];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border ${map.cls}`}
    >
      {map.label}
    </span>
  );
}
