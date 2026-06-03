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
  type TaskDetail,
  type TaskTargetView,
} from "../api";
import { TaskFormPreview } from "../components/TaskFormPreview";

function fmt(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

/* ─── 派发对象「阶段」分桶 —— 比原始 status 更贴近实际流程 ─────────────────
   原始 status 里 pending 既可能是「没配对口(谁都看不到)」也可能是「配了对口等认领」,
   两者处置完全不同;这里按 (status, handlerOrgId, ownerUserId) 还原成真实阶段。 */
type Bucket = "unconfigured" | "claimable" | "claimed" | "submitted" | "returned" | "done";

function bucketOf(t: TaskTargetView): Bucket {
  if (t.status === "submitted") return "submitted";
  if (t.status === "returned") return "returned";
  if (t.status === "done") return "done";
  // 有责任人(个人直派 assigned / 认领后 in_progress)→ 已认领填报中
  if (t.ownerUserId || t.status === "in_progress" || t.status === "assigned") return "claimed";
  // 余下是单位派发未认领:看有没有对口责任部门
  if (t.targetType === "org" && !t.handlerOrgId) return "unconfigured";
  return "claimable";
}

const BUCKET_META: {
  key: Bucket;
  label: string;
  color: string;
  bg: string;
  hint: string;
}[] = [
  {
    key: "unconfigured",
    label: "未配置对口",
    color: "#C2410C",
    bg: "#FFF7ED",
    hint: "该单位下没有部门把「对口上级」指向派发机关部门 —— 配置前谁都看不到此任务,需尽快配置",
  },
  {
    key: "claimable",
    label: "待认领",
    color: "#1D4ED8",
    bg: "#EFF6FF",
    hint: "已定责任部门,等部门成员在「我的待办」接收",
  },
  {
    key: "claimed",
    label: "已认领",
    color: "#6D28D9",
    bg: "#F5F3FF",
    hint: "已有责任人,填报中",
  },
  {
    key: "submitted",
    label: "已填报",
    color: "#047857",
    bg: "#ECFDF5",
    hint: "责任人已提交报送",
  },
  {
    key: "returned",
    label: "已退回",
    color: "#DC2626",
    bg: "#FEF2F2",
    hint: "审核退回,待重填",
  },
  { key: "done", label: "已完成", color: "#0F766E", bg: "#F0FDFA", hint: "已归档完成" },
];

export default function TaskDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const taskQuery = useQuery({
    queryKey: ["task", id],
    queryFn: () => taskApi.get(id),
    enabled: !!id,
  });
  const task = taskQuery.data;

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-[#E9E9E9] flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/tasks")}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <h1 className="text-base font-bold text-[#1A1A1A] truncate">{task?.title ?? "任务详情"}</h1>
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
          <TaskDetailBody task={task} />
        )}
      </div>
    </div>
  );
}

function TaskDetailBody({ task }: { task: TaskDetail }) {
  const [expanded, setExpanded] = useState<{
    targetId: string;
    orgId: string;
    orgName: string;
  } | null>(null);
  const [filter, setFilter] = useState<Bucket | null>(null);

  const membersQuery = useQuery({
    queryKey: ["org-members", expanded?.orgId],
    queryFn: () => organizationsApi.members(expanded!.orgId, true),
    enabled: !!expanded?.orgId,
  });

  const downloadNotice = useMutation({
    mutationFn: async () => {
      const fid = task.noticeFileId;
      if (!fid) return;
      const blob = await storageApi.fetchBlob(fid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = task.noticeFileName ?? "通知文件";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error("下载失败"),
  });

  // targets 量级小(几十~几百),直接每渲染分桶,不用 useMemo(避开 React Compiler 噪声)
  const counts: Record<Bucket, number> = {
    unconfigured: 0,
    claimable: 0,
    claimed: 0,
    submitted: 0,
    returned: 0,
    done: 0,
  };
  for (const t of task.targets) counts[bucketOf(t)]++;
  const total = task.targets.length;
  const visibleTargets = filter ? task.targets.filter((t) => bucketOf(t) === filter) : task.targets;
  const filterLabel = filter ? BUCKET_META.find((b) => b.key === filter)?.label : null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 概要 / 填报要求(有内容才显示) */}
      {(task.noticeFileId || task.description || task.notes) && (
        <div className="bg-white rounded-lg border border-[#E9E9E9] p-4 space-y-3">
          {task.noticeFileId && (
            <button
              onClick={() => downloadNotice.mutate()}
              disabled={downloadNotice.isPending}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] text-[13px] text-[#1A6BC8] disabled:opacity-50"
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              {task.noticeFileName ?? "通知文件"}
              <DownloadIcon className="w-3 h-3" />
            </button>
          )}
          {task.description && (
            <p className="text-sm text-[#4B5563] whitespace-pre-wrap">{task.description}</p>
          )}
          {task.notes && (
            <div>
              <div className="text-[12px] font-bold text-[#475467] mb-1">填报要求</div>
              <p className="text-sm text-[#344054] whitespace-pre-wrap bg-[#f7f9fc] border border-[#dce4ef] rounded-md px-3 py-2">
                {task.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 进度总览(填报要求下方 / 派发对象上方 —— 点数字筛选下方对象) */}
      <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm font-semibold text-[#1A1A1A]">
            进度总览
            <span className="ml-2 text-[12px] font-normal text-[#9CA3AF]">点数字查看对应对象</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[12px] text-[#6B7280]">
            <ClockIcon className="w-3.5 h-3.5" /> 截止 {fmt(task.dueAt)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatCard
            active={filter === null}
            onClick={() => setFilter(null)}
            label="全部对象"
            count={total}
            color="#374151"
            bg="#F3F4F6"
          />
          {BUCKET_META.map((b) => {
            // 已退回 / 已完成 为 0 时隐藏(减噪);4 个核心阶段始终显示
            if ((b.key === "returned" || b.key === "done") && counts[b.key] === 0) return null;
            return (
              <StatCard
                key={b.key}
                active={filter === b.key}
                onClick={() => setFilter(filter === b.key ? null : b.key)}
                label={b.label}
                count={counts[b.key]}
                color={b.color}
                bg={b.bg}
                hint={b.hint}
              />
            );
          })}
        </div>
        {counts.unconfigured > 0 && (
          <div className="mt-3 flex items-start gap-1.5 text-[12px] text-[#C2410C] bg-[#FFF7ED] border border-[#FED7AA] rounded-md px-3 py-2">
            <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              有 <b>{counts.unconfigured}</b> 个单位未配置对口部门 —— 到「组织机构」给这些单位的承办部门设「对口上级
              = 派发机关部门」后,任务才会进对应人员的待办。点上方「未配置对口」可看是哪些单位。
            </span>
          </div>
        )}
      </div>

      {/* 派发对象(按筛选) */}
      <div className="bg-white rounded-lg border border-[#E9E9E9] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#F0F0F0] text-sm font-semibold text-[#1A1A1A] flex items-center gap-2 flex-wrap">
          派发对象
          <span className="text-[12px] font-normal text-[#6B7280]">
            {filter ? `${filterLabel}:${visibleTargets.length}` : `共 ${total}`}
          </span>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="text-[12px] text-[#1A6BC8] hover:underline"
            >
              清除筛选
            </button>
          )}
          <span className="ml-auto text-[11px] font-normal text-[#9CA3AF]">
            点「责任部门」展开部门人员
          </span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F8FA] sticky top-0 z-10">
              <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                <th className="px-4 py-2 font-medium">单位 / 对象</th>
                <th className="px-4 py-2 font-medium">责任部门</th>
                <th className="px-4 py-2 font-medium w-52">责任人 / 电话</th>
                <th className="px-4 py-2 font-medium w-20">状态</th>
              </tr>
            </thead>
            <tbody>
              {visibleTargets.map((t) => {
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
                        {t.targetType !== "org" ? (
                          <span className="text-[12px] text-[#C0C6D0]">—</span>
                        ) : t.handlerOrgId ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded(
                                isOpen
                                  ? null
                                  : {
                                      targetId: t.id,
                                      orgId: t.handlerOrgId as string,
                                      orgName: t.handlerOrgName ?? "",
                                    },
                              )
                            }
                            className="inline-flex items-center gap-1 text-[12px] text-[#1A6BC8] hover:underline"
                          >
                            {isOpen ? (
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRightIcon className="w-3.5 h-3.5" />
                            )}
                            {t.handlerOrgName}
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] text-amber-600"
                            title="该单位下没有部门把「对口上级」指向本任务的派发机关部门 —— 未配置对口前谁都看不到此任务"
                          >
                            <InfoIcon className="w-3.5 h-3.5" />
                            未配置对口
                          </span>
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
                            {t.handlerOrgName} · 可承揽人员
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
              {visibleTargets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[13px] text-[#9CA3AF]">
                    该阶段暂无对象
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-[#FBFBFC] border-t border-[#F0F0F0] text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
          <InfoIcon className="w-3 h-3" />
          待接收=该责任部门成员可在「我的待办」接收;未配置对口前谁都看不到;已接收→显示责任人 + 电话便于上级对接。
        </div>
      </div>

      {/* 填报内容 */}
      <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
        <div className="text-sm font-semibold text-[#1A1A1A] mb-3">填报内容</div>
        <TaskFormPreview fields={task.fields} />
      </div>
    </div>
  );
}

/** 进度总览里的可点统计卡:大数字 + 阶段名;选中=描边高亮,点它筛选下方对象。 */
function StatCard({
  active,
  onClick,
  label,
  count,
  color,
  bg,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color: string;
  bg: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`text-left rounded-lg border-2 px-3 py-2 min-w-[92px] flex-1 transition-all ${
        active ? "shadow-sm" : "hover:brightness-95"
      }`}
      style={{ backgroundColor: bg, borderColor: active ? color : bg }}
    >
      <div className="text-[22px] font-bold leading-none" style={{ color }}>
        {count}
      </div>
      <div className="text-[12px] mt-1 font-medium" style={{ color }}>
        {label}
      </div>
    </button>
  );
}
