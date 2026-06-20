import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { InboxIcon, PlusIcon, UsersIcon, CalendarClockIcon } from "lucide-react";
import { reportApi } from "../api";
import { ReportTaskActions } from "../components/ReportTaskActions";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  open: "进行中",
  closed: "已关闭",
  archived: "已归档",
};

/** 报送管理 · 我派发的报送任务列表 + 发布入口。 */
export default function ReportTasks() {
  const navigate = useNavigate();
  const tasksQuery = useQuery({
    queryKey: ["report", "tasks", "mine"],
    queryFn: () => reportApi.listTasks(true),
  });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--party-primary)]">报送管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            通用「一次发布 · 多次提交」报送平台。扶贫采买录入是它的第一个实例。
          </p>
        </div>
        <button
          onClick={() => navigate("/admin/reports/new")}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-3 py-2 text-sm text-white"
        >
          <PlusIcon className="h-4 w-4" />
          发布多次报送
        </button>
      </header>

      {tasksQuery.isLoading ? (
        <div className="text-sm text-gray-400">加载中…</div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 py-20 text-center">
          <InboxIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">暂无报送任务</p>
          <button onClick={() => navigate("/admin/reports/new")} className="mt-2 text-sm text-[var(--party-primary)] hover:underline">
            点此发布第一个报送任务
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              onClick={() => navigate(`/admin/reports/${t.id}`)}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm hover:border-gray-300 hover:shadow"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-800">{t.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon className="h-3.5 w-3.5" />
                    {t.targetCount} 单位 · 已提交 {t.submittedCount}
                  </span>
                  {t.dueAt && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClockIcon className="h-3.5 w-3.5" />
                      截止 {new Date(t.dueAt).toLocaleDateString("zh-CN")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className="rounded bg-party-soft px-2 py-0.5 text-xs text-[var(--party-primary)]">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <ReportTaskActions task={{ id: t.id, title: t.title, notes: t.notes, dueAt: t.dueAt }} compact />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
