import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ClockIcon,
  Building2Icon,
  UserIcon,
  InfoIcon,
  FileTextIcon,
  DownloadIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import {
  taskApi,
  TASK_STATUS_LABEL,
  TASK_TARGET_STATUS_LABEL,
  taskStatusChip,
} from "../api";
import { ProgressBadges } from "../components/ProgressBadges";
import { TaskFormPreview } from "../components/TaskFormPreview";

function fmt(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

export default function TaskDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const taskQuery = useQuery({
    queryKey: ["task", id],
    queryFn: () => taskApi.get(id),
    enabled: !!id,
  });
  const task = taskQuery.data;

  const downloadNotice = useMutation({
    mutationFn: async () => {
      const fid = task?.noticeFileId;
      if (!fid) return;
      const blob = await storageApi.fetchBlob(fid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = task?.noticeFileName ?? "通知文件";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error("下载失败"),
  });

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/tasks")}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <h1 className="text-base font-bold text-[#1A1A1A] truncate">
          {task?.title ?? "任务详情"}
        </h1>
        {task && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#EEF4FF] text-[#1A6BC8] flex-shrink-0">
            {TASK_STATUS_LABEL[task.status] ?? task.status}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {taskQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : !task ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">任务不存在</div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* 概要 */}
            <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
              <div className="flex items-center gap-4 flex-wrap text-[13px] text-[#6B7280]">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="w-3.5 h-3.5" />
                  截止 {fmt(task.dueAt)}
                </span>
                <ProgressBadges counts={task.statusCounts} total={task.targets.length} />
                {task.noticeFileId && (
                  <button
                    onClick={() => downloadNotice.mutate()}
                    disabled={downloadNotice.isPending}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] text-[#1A6BC8] disabled:opacity-50"
                  >
                    <FileTextIcon className="w-3.5 h-3.5" />
                    {task.noticeFileName ?? "通知文件"}
                    <DownloadIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
              {task.description && (
                <p className="text-sm text-[#4B5563] mt-3 whitespace-pre-wrap">{task.description}</p>
              )}
              {task.notes && (
                <div className="mt-3">
                  <div className="text-[12px] font-bold text-[#475467] mb-1">填报要求</div>
                  <p className="text-sm text-[#344054] whitespace-pre-wrap bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
                    {task.notes}
                  </p>
                </div>
              )}
            </div>

            {/* 派发对象 */}
            <div className="bg-white rounded-lg border border-[#E9E9E9] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#F0F0F0] text-sm font-semibold text-[#1A1A1A]">
                派发对象 ({task.targets.length})
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#F7F8FA]">
                  <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">对象</th>
                    <th className="px-4 py-2 font-medium w-24">类型</th>
                    <th className="px-4 py-2 font-medium w-40">责任人</th>
                    <th className="px-4 py-2 font-medium w-24">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {task.targets.map((t) => (
                    <tr key={t.id} className="border-b border-[#F4F4F4] last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-[#1A1A1A]">
                          {t.targetType === "org" ? (
                            <Building2Icon className="w-3.5 h-3.5 text-[#1A6BC8]" />
                          ) : (
                            <UserIcon className="w-3.5 h-3.5 text-[var(--party-primary)]" />
                          )}
                          {t.targetName}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-[#6B7280]">
                        {t.targetType === "org" ? "单位" : "个人"}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-[#4B5563]">
                        {t.ownerName ?? <span className="text-[#C0C6D0]">待分派</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded"
                          style={taskStatusChip(t.status)}
                        >
                          {TASK_TARGET_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-[#FBFBFC] border-t border-[#F0F0F0] text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
                <InfoIcon className="w-3 h-3" />
                接收方填报、退回、数据汇总将在后续阶段开放(P2 填报 · P3 汇总)
              </div>
            </div>

            {/* 填报表单预览 */}
            <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
              <div className="text-sm font-semibold text-[#1A1A1A] mb-3">填报内容</div>
              <TaskFormPreview fields={task.fields} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
