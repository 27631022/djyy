import { Fragment, useState } from "react";
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
  ChevronDownIcon,
  ChevronRightIcon,
  PhoneIcon,
  UsersIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { organizationsApi } from "@/features/organization";
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

  // 展开某派发对象的「责任部门人员」(便于提醒未接收 / 对接)
  const [expanded, setExpanded] = useState<{ targetId: string; orgId: string; orgName: string } | null>(
    null,
  );
  const membersQuery = useQuery({
    queryKey: ["org-members", expanded?.orgId],
    queryFn: () => organizationsApi.members(expanded!.orgId, true),
    enabled: !!expanded?.orgId,
  });

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
                <span className="ml-2 text-[11px] font-normal text-[#9CA3AF]">
                  点「责任部门」展开该部门人员(便于提醒未接收 / 对接)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#F7F8FA]">
                  <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                    <th className="px-4 py-2 font-medium">单位 / 对象</th>
                    <th className="px-4 py-2 font-medium">责任部门</th>
                    <th className="px-4 py-2 font-medium w-52">责任人 / 电话</th>
                    <th className="px-4 py-2 font-medium w-20">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {task.targets.map((t) => {
                    const expandOrgId =
                      t.targetType === "org" ? t.handlerOrgId ?? t.targetOrgId : null;
                    const expandOrgName = t.handlerOrgName ?? t.targetName;
                    const isOpen = expanded?.targetId === t.id;
                    return (
                      <Fragment key={t.id}>
                        <tr className="border-b border-[#F4F4F4]">
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
                          <td className="px-4 py-2.5">
                            {t.targetType === "org" ? (
                              <button
                                type="button"
                                disabled={!expandOrgId}
                                onClick={() =>
                                  setExpanded(
                                    isOpen
                                      ? null
                                      : { targetId: t.id, orgId: expandOrgId as string, orgName: expandOrgName },
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[12px] text-[#1A6BC8] hover:underline disabled:text-[#9CA3AF] disabled:no-underline disabled:cursor-default"
                              >
                                {isOpen ? (
                                  <ChevronDownIcon className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRightIcon className="w-3.5 h-3.5" />
                                )}
                                {t.handlerOrgName ?? <span className="text-[#9CA3AF]">整单位可见</span>}
                              </button>
                            ) : (
                              <span className="text-[12px] text-[#C0C6D0]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[12px]">
                            {t.ownerName ? (
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[#1A1A1A]">
                                  <UserIcon className="w-3 h-3 text-[#6B7280]" />
                                  {t.ownerName}
                                </span>
                                {t.ownerPhone && (
                                  <a
                                    href={`tel:${t.ownerPhone}`}
                                    className="inline-flex items-center gap-0.5 text-[#1A6BC8] hover:underline"
                                  >
                                    <PhoneIcon className="w-3 h-3" />
                                    {t.ownerPhone}
                                  </a>
                                )}
                              </span>
                            ) : (
                              <span className="text-[#C0C6D0]">待接收</span>
                            )}
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
                        {isOpen && (
                          <tr className="bg-[#FBFCFE]">
                            <td colSpan={4} className="px-4 py-2.5">
                              <div className="text-[11px] text-[#6B7280] mb-1.5 flex items-center gap-1">
                                <UsersIcon className="w-3 h-3" />
                                {expandOrgName} · 可承揽人员
                              </div>
                              {membersQuery.isLoading ? (
                                <div className="text-[12px] text-[#9CA3AF]">加载人员…</div>
                              ) : (membersQuery.data ?? []).length === 0 ? (
                                <div className="text-[12px] text-[#9CA3AF]">该部门暂无人员</div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {(membersQuery.data ?? []).map((m) => (
                                    <span
                                      key={m.userId}
                                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[#E9E9E9] bg-white text-[12px]"
                                    >
                                      <span className="text-[#1A1A1A]">{m.name}</span>
                                      {m.position && <span className="text-[#9CA3AF]">{m.position}</span>}
                                      {m.phone && (
                                        <a
                                          href={`tel:${m.phone}`}
                                          className="inline-flex items-center gap-0.5 text-[#1A6BC8] hover:underline"
                                        >
                                          <PhoneIcon className="w-3 h-3" />
                                          {m.phone}
                                        </a>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-[#FBFBFC] border-t border-[#F0F0F0] text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
                <InfoIcon className="w-3 h-3" />
                待接收=该责任部门成员可在「我的待办」接收;已接收→显示责任人 + 电话便于上级对接。
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
