import { isValidYearLabel } from "../../lib/certificateNumber";

interface BatchInfoFormProps {
  yearLabel: string;
  batchTotal: number;
  validUntil: string;
  onChange: (patch: { yearLabel?: string; batchTotal?: number; validUntil?: string }) => void;
}

/**
 * 批次信息:
 *   - yearLabel:"2024" 或 "2024-2025"
 *   - batchTotal:本次发证的总人数(单证 = 1)
 *   - validUntil:可选,空字符串 = 永久
 */
export function BatchInfoForm({
  yearLabel,
  batchTotal,
  validUntil,
  onChange,
}: BatchInfoFormProps) {
  const yearOk = isValidYearLabel(yearLabel);
  return (
    <div className="grid grid-cols-3 gap-3">
      <label className="block">
        <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
          年份段 *
        </span>
        <input
          type="text"
          value={yearLabel}
          onChange={(e) => onChange({ yearLabel: e.target.value.trim() })}
          placeholder="2024 或 2024-2025"
          className={`w-full px-2 py-1.5 text-xs font-mono rounded border focus:outline-none ${
            yearOk
              ? "border-[#E9E9E9] focus:border-[var(--party-primary)]"
              : "border-amber-300 focus:border-amber-500"
          }`}
        />
        {!yearOk && (
          <span className="block mt-1 text-[10px] text-amber-600">
            格式:2024 或 2024-2025
          </span>
        )}
      </label>

      <label className="block">
        <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
          批次总数 *
        </span>
        <input
          type="number"
          min={1}
          max={99999}
          value={batchTotal}
          onChange={(e) => onChange({ batchTotal: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className="w-full px-2 py-1.5 text-xs font-mono rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
        <span className="block mt-1 text-[10px] text-[#9CA3AF]">单证发 1</span>
      </label>

      <label className="block">
        <span className="block text-[10px] font-medium text-[#6B7280] mb-1">
          有效期至(可选)
        </span>
        <input
          type="date"
          value={validUntil}
          onChange={(e) => onChange({ validUntil: e.target.value })}
          className="w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none"
        />
        <span className="block mt-1 text-[10px] text-[#9CA3AF]">留空 = 永久</span>
      </label>
    </div>
  );
}
