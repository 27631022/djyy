/**
 * 发证向导 Step 2 — 确认表彰公共信息。
 *
 * 从原 Step2HonorRecords 顶部「共享信息」拆出来,独立成一步:
 *   - 表彰年度(yearLabel)
 *   - 表彰日期(issueDate)
 *   - 有效期(validUntil,可空 = 永久)
 *
 * 同一份表彰文件下所有荣誉共用这组时间元数据(不再 per-record)。
 * AI 抽取的年度/日期在进入本步前已由容器带入,这里供人工确认/修改。
 */
import { CalendarDaysIcon } from "lucide-react";

export function Step2SharedInfo({
  yearLabel,
  onYearLabelChange,
  issueDate,
  onIssueDateChange,
  validUntil,
  onValidUntilChange,
}: {
  yearLabel: string;
  onYearLabelChange: (v: string) => void;
  issueDate: string;
  onIssueDateChange: (v: string) => void;
  validUntil: string;
  onValidUntilChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#1A1A1A]">第二步 · 确认表彰公共信息</h2>
        <p className="text-sm text-[#9CA3AF] mt-1">
          这组信息同一份表彰文件下所有荣誉证书共用。若用了 AI 识别,已自动带入,核对即可。
        </p>
      </div>

      <div className="rounded-lg border border-[#E9E9E9] bg-white p-5 max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A] mb-4">
          <CalendarDaysIcon className="w-4 h-4 text-[var(--party-primary)]" />
          本次表彰共享信息
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-[#374151] mb-1.5">
              表彰年度 <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={yearLabel}
              onChange={(e) => onYearLabelChange(e.target.value.trim())}
              placeholder="2024 或 2024-2025"
              className="w-full px-3 py-2 text-sm font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <span className="block text-xs text-[#9CA3AF] mt-1">
              同一份表彰文件下所有荣誉共用此年份
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-[#374151] mb-1.5">
              表彰日期 <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => onIssueDateChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <span className="block text-xs text-[#9CA3AF] mt-1">
              所有荣誉证书共用此颁发日期
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-[#374151] mb-1.5">
              有效期{" "}
              <span className="text-[#9CA3AF] font-normal">(可空 = 永久)</span>
            </span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => onValidUntilChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
            />
            <span className="block text-xs text-[#9CA3AF] mt-1">
              留空则证书永久有效
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
