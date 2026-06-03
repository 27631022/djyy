import { ClockIcon, AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import { dueInfo, dueToneStyle } from "../api";

function fmtDate(s: string): string {
  return s.slice(0, 16).replace("T", " ");
}

/**
 * 截止/完成时效小标:
 * - 未提交:还有 N 天 / 今天截止 / 已逾期 N 天(≤3 天或逾期醒目)
 * - 传 submittedAt:按期完成 / 逾期 N 天完成
 * showDate=true 时在小标后附上截止日期原文(列表用)。
 */
export function DueBadge({
  dueAt,
  submittedAt,
  showDate = false,
  size = "sm",
}: {
  dueAt: string | null;
  submittedAt?: string | null;
  showDate?: boolean;
  size?: "sm" | "md";
}) {
  if (!dueAt) return <span className="text-[12px] text-[#D1D5DB]">不限</span>;
  const info = dueInfo(dueAt, submittedAt);
  if (!info) return <span className="text-[12px] text-[#D1D5DB]">—</span>;
  const Icon =
    info.tone === "overdue"
      ? AlertTriangleIcon
      : info.done
        ? CheckCircle2Icon
        : ClockIcon;
  const pad = size === "md" ? "px-2.5 py-1 text-[13px]" : "px-1.5 py-0.5 text-[11.5px]";
  const ic = size === "md" ? "w-4 h-4" : "w-3 h-3";
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 rounded-md border font-medium ${pad}`}
        style={dueToneStyle(info.tone)}
      >
        <Icon className={ic} />
        {info.text}
      </span>
      {showDate && <span className="text-[11px] text-[#9CA3AF]">{fmtDate(dueAt)}</span>}
    </span>
  );
}
