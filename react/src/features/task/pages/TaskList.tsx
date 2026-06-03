import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SendIcon, PlusIcon, RefreshCwIcon, LayersIcon } from "lucide-react";
import { taskApi, TASK_STATUS_LABEL } from "../api";
import { TaskProgressBar } from "../components/TaskProgressBar";
import { DueBadge } from "../components/DueBadge";

const PARTY = "var(--party-primary)";

function fmt(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

export default function TaskListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => taskApi.list() });
  const tasks = tasksQuery.data ?? [];

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
          <SendIcon className="w-4 h-4 text-[var(--party-primary)]" />
          任务派发
        </h1>
        <span className="text-xs text-[#9CA3AF]">我派发的任务,共 {tasks.length} 个</span>
        <div className="flex-1" />
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => navigate("/admin/tasks/new")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          新建任务
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {tasksQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : tasks.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9CA3AF]">
            还没派发过任务 —— 点右上「新建任务」开始
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#F7F8FA] z-10">
              <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                <th className="px-4 py-2 font-medium">任务</th>
                <th className="px-4 py-2 font-medium w-24">状态</th>
                <th className="px-4 py-2 font-medium w-72">派发进度</th>
                <th className="px-4 py-2 font-medium w-44">截止</th>
                <th className="px-4 py-2 font-medium w-40">创建</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/admin/tasks/${t.id}`)}
                  className="border-b border-[#F0F0F0] hover:bg-[#FAFBFC] cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium text-[#1A1A1A] flex items-center gap-1.5 flex-wrap">
                      {t.title}
                      {t.periodLabel && (
                        <span className="text-[10px] px-1.5 py-px rounded bg-[#FFF7ED] text-[#C2410C] font-normal">
                          {t.periodLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#9CA3AF] mt-0.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <LayersIcon className="w-3 h-3" />
                        {t.targetCount} 个对象 · {t.fieldCount} 字段
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#EEF4FF] text-[#1A6BC8]">
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <TaskProgressBar counts={t.statusCounts} total={t.targetCount} />
                  </td>
                  <td className="px-4 py-2.5">
                    <DueBadge dueAt={t.dueAt} showDate />
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-[#9CA3AF]">{fmt(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
