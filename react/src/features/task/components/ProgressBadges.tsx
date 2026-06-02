import { TASK_TARGET_STATUS_LABEL, taskStatusChip, type TaskStatusCounts } from "../api";

/** 派发进度小标:done 绿 / returned 红 / submitted 靛 / pending 琥珀 / 其它蓝灰 */
export function ProgressBadges({ counts, total }: { counts: TaskStatusCounts; total: number }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <span className="text-[11px] text-[#D1D5DB]">—</span>;
  const done = counts.done ?? 0;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] text-[#6B7280]">
        {done}/{total} 完成
      </span>
      <div className="flex gap-1 flex-wrap">
        {entries.map(([st, n]) => (
          <span
            key={st}
            className="text-[10px] px-1 py-px rounded"
            style={taskStatusChip(st)}
            title={TASK_TARGET_STATUS_LABEL[st] ?? st}
          >
            {TASK_TARGET_STATUS_LABEL[st] ?? st} {n}
          </span>
        ))}
      </div>
    </div>
  );
}
