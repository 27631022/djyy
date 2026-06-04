import { Fragment, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ClipboardCheckIcon,
  EyeIcon,
  BarChart3Icon,
  CalendarPlusIcon,
  CalendarClockIcon,
  Settings2Icon,
  ShieldAlertIcon,
  RotateCcwIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { downloadBlob } from "@/shared/lib/download";
import { organizationsApi } from "@/features/organization";
import {
  taskApi,
  taskApiErrorMessage,
  TASK_STATUS_LABEL,
  TASK_TARGET_STATUS_LABEL,
  taskStatusChip,
  CONFIRM_STATUS_LABEL,
  confirmStatusChip,
  type TaskDetail,
  type TaskTargetView,
} from "../api";
import { TaskFormPreview } from "../components/TaskFormPreview";
import { ReviewDrawer } from "../components/ReviewDrawer";
import { DueBadge } from "../components/DueBadge";
import { NewPeriodDialog } from "../components/NewPeriodDialog";
import {
  ConfigureCounterpartDialog,
  SetDispatchOrgDialog,
} from "../components/CounterpartConfig";

/** 有回执可看的状态(可点开审核抽屉) */
const REVIEWABLE = new Set(["submitted", "returned", "done"]);

/* ─── 派发对象「阶段」分桶 —— 比原始 status 更贴近实际流程 ─────────────────
   原始 status 里 pending 既可能是「未指定对口(全单位可认领)」也可能是「配了对口等责任部门认领」,
   两者范围不同;这里按 (status, handlerOrgId, ownerUserId) 还原成真实阶段。 */
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
    label: "全单位待认领",
    color: "#0E7490",
    bg: "#ECFEFF",
    hint: "未指定对口责任部门 —— 该单位全体成员都可在「我的待办」看到并认领;如需固定到某个部门,可点该行「配置对口」(可选)",
  },
  {
    key: "claimable",
    label: "待认领",
    color: "#1D4ED8",
    bg: "#EFF6FF",
    hint: "已定对口责任部门,等该部门成员在「我的待办」接收",
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
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const taskQuery = useQuery({
    queryKey: ["task", id],
    queryFn: () => taskApi.get(id),
    enabled: !!id,
  });
  const task = taskQuery.data;

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate("/admin/tasks")}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <h1 className="text-base font-bold text-[#1A1A1A] truncate max-w-[40vw]">
          {task?.title ?? "任务详情"}
        </h1>
        {task && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#EEF4FF] text-[#1A6BC8] flex-shrink-0">
            {TASK_STATUS_LABEL[task.status] ?? task.status}
          </span>
        )}
        {task?.periodLabel && (
          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#C2410C] flex-shrink-0">
            <CalendarClockIcon className="w-3 h-3" />
            {task.periodLabel}
          </span>
        )}
        {/* 期次切换(同系列多期时) */}
        {task && task.siblings.length > 1 && (
          <select
            value={task.id}
            onChange={(e) => navigate(`/admin/tasks/${e.target.value}`)}
            title="切换期次"
            className="text-[12px] rounded-md border border-[#dce4ef] bg-white px-2 py-1 text-[#475467] focus:outline-none focus:ring-2 focus:ring-party-primary-20"
          >
            {task.siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.periodLabel ?? s.createdAt.slice(0, 10)) + (s.current ? "(本期)" : "")}
              </option>
            ))}
          </select>
        )}
        {task && (
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setNewPeriodOpen(true)}
              title="按本任务发起新一期(周期报表:上期值预填、同责任人接力)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
            >
              <CalendarPlusIcon className="w-4 h-4" />
              发起新一期
            </button>
            <button
              onClick={() => navigate(`/admin/tasks/${id}/summary`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              <BarChart3Icon className="w-4 h-4" />
              填报汇总
            </button>
          </div>
        )}
      </div>

      {newPeriodOpen && task && (
        <NewPeriodDialog
          taskId={task.id}
          taskTitle={task.title}
          onClose={() => setNewPeriodOpen(false)}
        />
      )}

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
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [configUnit, setConfigUnit] = useState<{ orgId: string; orgName: string } | null>(null);
  const [setDispatchOpen, setSetDispatchOpen] = useState(false);

  const qc = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["org-members", expanded?.orgId],
    queryFn: () => organizationsApi.members(expanded!.orgId, true),
    enabled: !!expanded?.orgId,
  });

  // 重新发起被驳回的跨部门派发对象 → 重置回待确认
  const reinitiate = useMutation({
    mutationFn: (targetId: string) => taskApi.reinitiateConfirm(targetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", task.id] });
      toast.success("已重新发起,等待对方部门负责人确认");
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "重新发起失败")),
  });

  const downloadNotice = useMutation({
    mutationFn: async () => {
      const fid = task.noticeFileId;
      if (!fid) return;
      const blob = await storageApi.fetchBlob(fid);
      downloadBlob(blob, task.noticeFileName ?? "通知文件");
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
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6B7280]">
            <ClockIcon className="w-3.5 h-3.5" /> 截止
            <DueBadge dueAt={task.dueAt} showDate />
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
        {!task.dispatchOrgId && task.targets.some((t) => t.targetType === "org") && (
          <div className="mt-3 flex items-start gap-1.5 text-[12px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
            <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              本任务<b>未指定派发部门</b>,接收单位无法匹配对口责任部门。
              <button
                type="button"
                onClick={() => setSetDispatchOpen(true)}
                className="underline font-medium text-[#B91C1C]"
              >
                设置派发部门
              </button>
              {" "}后即可逐个单位配置对口。
            </span>
          </div>
        )}
        {task.dispatchOrgId && counts.unconfigured > 0 && (
          <div className="mt-3 flex items-start gap-1.5 text-[12px] text-[#0E7490] bg-[#ECFEFF] border border-[#A5F0FC] rounded-md px-3 py-2">
            <InfoIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              有 <b>{counts.unconfigured}</b> 个单位未指定对口责任部门 —— 这些单位<b>全体成员</b>都可在「我的待办」接收;
              如需把任务固定到某个部门,可在下方该单位行点
              <b className="text-[var(--party-primary)]">「配置对口」</b>(可选)。
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
                        ) : task.dispatchOrgId ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfigUnit({ orgId: t.targetOrgId as string, orgName: t.targetName })
                            }
                            className="inline-flex items-center gap-1 text-[12px] text-[var(--party-primary)] hover:underline"
                            title="可选:把该单位的任务固定到某个责任部门(设其「对口上级」=本任务派发部门),即时生效;不配则该单位全员可认领"
                          >
                            <Settings2Icon className="w-3.5 h-3.5" />
                            配置对口
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] text-amber-600"
                            title="本任务未指定派发部门,无法匹配对口 —— 请先在上方设置派发部门"
                          >
                            <InfoIcon className="w-3.5 h-3.5" />
                            待设派发部门
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px]">
                        {t.confirmStatus === "pending" || t.confirmStatus === "rejected" ? (
                          <ConfirmCell
                            t={t}
                            onReinitiate={() => reinitiate.mutate(t.id)}
                            reinitiating={reinitiate.isPending}
                          />
                        ) : t.ownerName ? (
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
                        {t.confirmStatus === "pending" || t.confirmStatus === "rejected" ? (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded border"
                            style={confirmStatusChip(t.confirmStatus)}
                          >
                            {CONFIRM_STATUS_LABEL[t.confirmStatus] ?? t.confirmStatus}
                          </span>
                        ) : REVIEWABLE.has(t.status) ? (
                          <button
                            type="button"
                            onClick={() => setReviewTargetId(t.id)}
                            title="查看回执 / 审核"
                            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded hover:brightness-95 transition"
                            style={taskStatusChip(t.status)}
                          >
                            {TASK_TARGET_STATUS_LABEL[t.status] ?? t.status}
                            {t.status === "submitted" ? (
                              <ClipboardCheckIcon className="w-3 h-3" />
                            ) : (
                              <EyeIcon className="w-3 h-3" />
                            )}
                          </button>
                        ) : (
                          <span
                            className="text-[11px] px-1.5 py-0.5 rounded"
                            style={taskStatusChip(t.status)}
                          >
                            {TASK_TARGET_STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        )}
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
          待认领=对口责任部门成员(未指定对口则该单位全员)可在「我的待办」接收;已接收→显示责任人 + 电话;「已填报」点状态可审核(通过 / 退回重填)。
        </div>
      </div>

      {/* 填报表单(空白预览 —— 各单位实际填报内容点上方「已填报/已退回/已完成」状态查看) */}
      <div className="bg-white rounded-lg border border-[#E9E9E9] p-4">
        <div className="text-sm font-semibold text-[#1A1A1A] mb-1">填报表单</div>
        <div className="text-[12px] text-[#9CA3AF] mb-3">
          下方为空白表单结构;各单位提交的实际内容,点派发对象里「已填报」状态即可审核。
        </div>
        <TaskFormPreview fields={task.fields} />
      </div>

      {reviewTargetId && (
        <ReviewDrawer targetId={reviewTargetId} onClose={() => setReviewTargetId(null)} />
      )}
      {configUnit && task.dispatchOrgId && (
        <ConfigureCounterpartDialog
          taskId={task.id}
          unitOrgId={configUnit.orgId}
          unitName={configUnit.orgName}
          dispatchOrgName={task.dispatchOrgName}
          onClose={() => setConfigUnit(null)}
        />
      )}
      {setDispatchOpen && (
        <SetDispatchOrgDialog taskId={task.id} onClose={() => setSetDispatchOpen(false)} />
      )}
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

/** 平级确认状态单元格(机关↔机关互派):显示「待谁确认」或「被谁驳回 + 原因」+ 重新发起。 */
function ConfirmCell({
  t,
  onReinitiate,
  reinitiating,
}: {
  t: TaskTargetView;
  onReinitiate?: () => void;
  reinitiating?: boolean;
}) {
  if (t.confirmStatus === "rejected") {
    const who = t.senderConfirm === "rejected" ? t.senderOwnerName : t.receiverOwnerName;
    return (
      <span className="inline-flex flex-col items-start gap-1 text-[#DC2626]">
        <span className="inline-flex items-center gap-1">
          <ShieldAlertIcon className="w-3 h-3" />
          {who ? `${who} 驳回` : "已驳回"}
        </span>
        {t.confirmNote && (
          <span className="text-[11px] text-[#9CA3AF]">原因:{t.confirmNote}</span>
        )}
        {onReinitiate && (
          <button
            type="button"
            onClick={onReinitiate}
            disabled={reinitiating}
            title="重置回待确认,再走一遍双方确认"
            className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded border border-[#dce4ef] bg-white text-[#1A6BC8] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] disabled:opacity-50"
          >
            <RotateCcwIcon className="w-3 h-3" />
            重新发起
          </button>
        )}
      </span>
    );
  }
  const senderOk = t.senderConfirm === "approved";
  const receiverOk = t.receiverConfirm === "approved";
  const text =
    senderOk && !receiverOk
      ? `待收方负责人${t.receiverOwnerName ? ` ${t.receiverOwnerName}` : "(未设)"}确认`
      : !senderOk && receiverOk
        ? `待发方负责人${t.senderOwnerName ? ` ${t.senderOwnerName}` : "(未设)"}确认`
        : "待双方部门负责人确认";
  return (
    <span className="inline-flex items-center gap-1 text-[#C2410C]">
      <ShieldAlertIcon className="w-3 h-3" />
      {text}
    </span>
  );
}
