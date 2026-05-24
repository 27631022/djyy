/**
 * 发证向导 Step 1 — 上传 / 拍照 / 跳过 AI 选择来源 + AI 抽取结果展示。
 *
 * 此组件无内部业务状态(extract 结果由父组件持有,以便 Phase 2 的 draft 持久化能透写),
 * 仅持有上传 input 的 ref 和当前抽取 mutation 的 pending 状态。
 *
 * Phase 4 起,Step 2 接管 multi-honor records 表格;Step 1 不再负责"选哪个 honor",
 * 但本组件仍保留 selectedHonorIdx 兼容当前(Phase 3)的单 honor 流。
 */

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";

import { certificateIssueApi, type ExtractHonorResponse } from "../../api";

const PARTY = "var(--party-primary)";

/* ─── 主组件 ─── */

export function Step1Upload({
  extractResult,
  selectedHonorIdx,
  onSelectHonor,
  onExtractDone,
  onReset,
  onSkipAI,
  onContinueWithHonor,
  onGoExternal,
}: {
  extractResult: ExtractHonorResponse | null;
  selectedHonorIdx: number;
  onSelectHonor: (i: number) => void;
  onExtractDone: (r: ExtractHonorResponse) => void;
  /** 用户点「重新上传」清掉抽取结果(同时父组件应清掉 draft.extracted) */
  onReset: () => void;
  onSkipAI: () => void;
  onContinueWithHonor: () => void;
  onGoExternal: () => void;
}) {
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);

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

  // 抽取结果存在 → 渲染结果面板;否则渲染选择面板
  if (extractResult) {
    return (
      <ExtractedResults
        result={extractResult}
        selectedHonorIdx={selectedHonorIdx}
        onSelectHonor={onSelectHonor}
        onReset={() => {
          if (docInputRef.current) docInputRef.current.value = "";
          if (imgInputRef.current) imgInputRef.current.value = "";
          onReset();
        }}
        onContinue={onContinueWithHonor}
      />
    );
  }

  return (
    <div>
      <h2 className="text-base font-bold text-[#1A1A1A] mb-1">第一步 · 选择数据来源</h2>
      <p className="text-xs text-[#9CA3AF] mb-4">
        选择最贴合你场景的方式开始。AI 自动按「系统设置 → 外部 API」配置的优先级挑模型 ——
        文档走 LLM,图片走 Vision。支持「两优一先」一份文件多荣誉的情况。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 选项 A:上传文档 */}
        <UploadTile
          color="purple"
          icon={<FileTextIcon className="w-6 h-6" />}
          label="上传表彰文件"
          desc="Word / PDF · AI 提取荣誉、年份、受表彰人员"
          loading={extractMut.isPending}
          onClick={() => docInputRef.current?.click()}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {/* 选项 B:拍照 / 图片(OCR via vision) */}
        <UploadTile
          color="blue"
          icon={<CameraIcon className="w-6 h-6" />}
          label="拍照录入证书"
          desc="拍照或选图 · AI 视觉模型识别证书内容(豆包/千问/GPT-4o)"
          loading={extractMut.isPending}
          onClick={() => imgInputRef.current?.click()}
        />
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {/* 选项 C:外部证书 */}
        <UploadTile
          color="amber"
          icon={<UploadIcon className="w-6 h-6" />}
          label="外部证书直接录入"
          desc="上传外部单位颁发的 PDF · 录入审核"
          onClick={onGoExternal}
        />
      </div>

      <div className="mt-6 pt-4 border-t border-[#F0F0F0] flex items-center justify-between">
        <span className="text-xs text-[#9CA3AF]">不想用 AI? 也可以直接手动填表发证</span>
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

/* ─── UploadTile:3 个入口 tile 复用 ─── */

function UploadTile({
  color,
  icon,
  label,
  desc,
  onClick,
  disabled,
  loading,
}: {
  color: "purple" | "blue" | "amber";
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = {
    purple: "from-purple-50 to-blue-50 border-purple-200 hover:border-purple-400 text-purple-600",
    blue: "from-blue-50 to-cyan-50 border-blue-200 hover:border-blue-400 text-blue-600",
    amber: "from-amber-50 to-orange-50 border-amber-200 hover:border-amber-400 text-amber-700",
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`bg-gradient-to-br ${colors} border-2 rounded-lg p-5 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="w-11 h-11 rounded-lg bg-white/80 flex items-center justify-center mb-3">
        {loading ? <Loader2Icon className="w-6 h-6 animate-spin" /> : icon}
      </div>
      <div className="text-sm font-bold text-[#1A1A1A] mb-1">{label}</div>
      <div className="text-[11px] text-[#6B7280] leading-relaxed">{desc}</div>
    </button>
  );
}

/* ─── ExtractedResults:抽取完成后的展示 + 单/多 honor 选择 ─── */

function ExtractedResults({
  result,
  selectedHonorIdx,
  onSelectHonor,
  onReset,
  onContinue,
}: {
  result: ExtractHonorResponse;
  selectedHonorIdx: number;
  onSelectHonor: (i: number) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  const multi = result.honors.length > 1;
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
        {result.source.pipeline === "vision"
          ? " · 图像识别"
          : result.source.textLength
            ? ` · ${result.source.textLength} 字`
            : ""}
        {result.source.usedProvider
          ? ` · 由 ${result.source.usedProvider}(${result.source.usedModel ?? ""})${result.source.pipeline === "vision" ? " vision" : ""} 提取`
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
              {multi ? (
                <>
                  发现 <span className="text-[var(--party-primary)]">{result.honors.length}</span>{" "}
                  项荣誉 — 请选择本次要发的一项
                </>
              ) : (
                "识别到 1 项荣誉"
              )}
            </h3>
            <span className="text-[11px] text-[#9CA3AF]">
              本次只发选中项;其余可后续重新进入向导发证
            </span>
          </div>

          <div className="space-y-2">
            {result.honors.map((h, i) => {
              const active = i === selectedHonorIdx;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => onSelectHonor(i)}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                    active
                      ? "border-[var(--party-primary)] bg-party-soft"
                      : "border-[#E9E9E9] hover:border-[#CBD5E1] bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        active
                          ? "bg-[var(--party-primary)] text-white"
                          : "border border-[#CBD5E1]"
                      }`}
                    >
                      {active && <CheckIcon className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
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
                  </div>
                </button>
              );
            })}
          </div>

          {selectedHonorIdx >= 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onContinue}
                className="flex items-center gap-1 px-4 py-2 rounded text-sm font-medium text-white"
                style={{ backgroundColor: PARTY }}
              >
                确认并进入下一步
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
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

/** 荣誉类型徽章(V3 新增) — 颜色按语义:个人=蓝、集体=紫、单位=琥珀 */
function HonorTypeBadge({ type }: { type: "individual" | "collective" | "unit" }) {
  const map = {
    individual: { label: "个人", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    collective: { label: "集体", cls: "bg-purple-50 text-purple-700 border-purple-200" },
    unit: { label: "单位", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  }[type];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border ${map.cls}`}
    >
      {map.label}
    </span>
  );
}
