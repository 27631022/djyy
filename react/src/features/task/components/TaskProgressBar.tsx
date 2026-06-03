import type { TaskStatusCounts } from "../api";

/**
 * 派发进度条:按对象状态分段的堆叠条 + 可读图例(替代原「0/N 完成」误导写法)。
 * 原始 status 合并为 5 个直观阶段;每段宽度 = 该阶段数 / 总数。
 */
const SEGMENTS: { keys: string[]; label: string; color: string }[] = [
  { keys: ["pending"], label: "待分派", color: "#F59E0B" },
  { keys: ["assigned", "in_progress"], label: "进行中", color: "#3B82F6" },
  { keys: ["submitted"], label: "已提交", color: "#6366F1" },
  { keys: ["returned"], label: "已退回", color: "#EF4444" },
  { keys: ["done"], label: "已完成", color: "#10B981" },
];

export function TaskProgressBar({
  counts,
  total,
}: {
  counts: TaskStatusCounts;
  total: number;
}) {
  if (total === 0) return <span className="text-[12px] text-[#D1D5DB]">无派发对象</span>;
  const segs = SEGMENTS.map((s) => ({
    label: s.label,
    color: s.color,
    n: s.keys.reduce((a, k) => a + (counts[k] ?? 0), 0),
  })).filter((s) => s.n > 0);

  return (
    <div className="space-y-1.5 min-w-[180px] max-w-[260px]">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[#EEF1F4]">
        {segs.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label} ${s.n}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap text-[12px] leading-tight">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[#475467]">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
            <b className="text-[#1A1A1A]">{s.n}</b>
          </span>
        ))}
        <span className="text-[#9CA3AF]">/ 共 {total}</span>
      </div>
    </div>
  );
}
