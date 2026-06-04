/**
 * 任务填报页(P2.2)—— 责任人接收后,按任务字段动态渲染填报表单。
 * 每个字段的可输入控件由字段类型注册表的 FillInput 提供(text/textarea/number/date/select/
 * file/image/richtext/doclink),file/image 内部走 storage 上传。存草稿 / 提交(提交校验必填)。
 */
import { Fragment, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ClockIcon,
  SaveIcon,
  SendIcon,
  Loader2Icon,
  AlertTriangleIcon,
  LockIcon,
  CalendarClockIcon,
  HistoryIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Building2Icon,
  UserIcon,
  PhoneIcon,
} from "lucide-react";
import {
  taskApi,
  taskApiErrorMessage,
  groupTaskFields,
  TASK_TARGET_STATUS_LABEL,
  SUBMISSION_STATUS_LABEL,
  taskStatusChip,
  dueInfo,
  dueToneStyle,
  type TaskField,
  type TaskFillHistoryEntry,
} from "../api";
import { getFieldType } from "../fields";
import { DueBadge } from "../components/DueBadge";

const PARTY = "var(--party-primary)";
const PAGE_BG = "linear-gradient(120deg, rgba(200,0,30,0.05), transparent 30%), #eef2f7";

export default function TaskFillPage() {
  const { targetId } = useParams<{ targetId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["task-fill", targetId],
    queryFn: () => taskApi.getFill(targetId!),
    enabled: !!targetId,
  });

  // 编辑覆盖层:null = 显示服务端回执原值;首次编辑即捕获整张表 + 改动。
  // 用「派生值」而非 useEffect 同步 setState,避开 set-state-in-effect 告警。
  const [edits, setEdits] = useState<Record<string, unknown> | null>(null);

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      taskApi.saveFill(targetId!, edits ?? q.data?.submission.formData ?? {}, submit),
    onSuccess: (_r, submit) => {
      qc.invalidateQueries({ queryKey: ["task-fill", targetId] });
      qc.invalidateQueries({ queryKey: ["task-inbox"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(submit ? "已提交报送" : "草稿已保存");
      if (submit) navigate("/admin/tasks/inbox");
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "保存失败"), { duration: 8000 }),
  });

  if (q.isLoading) return <Centered>加载填报表单…</Centered>;
  if (q.isError || !q.data)
    return <Centered>{taskApiErrorMessage(q.error, "无法打开填报表单")}</Centered>;

  const fill = q.data;
  const base = fill.submission.formData ?? {};
  const formData = edits ?? base;
  const groups = groupTaskFields(fill.fields);
  const subStatus = fill.submission.status;
  const submitted = subStatus === "submitted";
  const approved = subStatus === "approved";
  const returned = subStatus === "returned";
  const locked = !fill.editable; // 已提交 / 已通过 → 锁定只读
  const returnCount = fill.submission.returnCount;
  const submittedAt = fill.submission.submittedAt;
  // 状态小标:草稿态用对象状态,已提交/退回/已通过用回执状态(各自的中文标签)
  const chipStatus = subStatus === "draft" ? fill.targetStatus : subStatus;
  const chipLabel =
    subStatus === "draft"
      ? TASK_TARGET_STATUS_LABEL[fill.targetStatus] ?? fill.targetStatus
      : SUBMISSION_STATUS_LABEL[subStatus] ?? subStatus;
  // 醒目截止提醒(仍可编辑且临近/逾期时)
  const reminder = !locked ? dueInfo(fill.dueAt) : null;
  const showReminder = reminder && (reminder.tone === "soon" || reminder.tone === "overdue");

  return (
    <div className="h-full flex flex-col" style={{ background: PAGE_BG }}>
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          {/* 头部 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-lg grid place-items-center border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] flex-shrink-0"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[20px] font-bold text-[#172033] truncate">{fill.taskTitle}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full"
                  style={taskStatusChip(chipStatus)}
                >
                  {chipLabel}
                </span>
                {fill.periodLabel && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C]">
                    <CalendarClockIcon className="w-3 h-3" />
                    {fill.periodLabel}
                  </span>
                )}
                <DueBadge
                  dueAt={fill.dueAt}
                  submittedAt={submitted || approved ? submittedAt : null}
                  showDate
                />
              </div>
              {/* 派发来源:派发部门 · 派发人 · 电话 —— 便于基层咨询 */}
              {(fill.dispatchOrgName || fill.dispatchUserName || fill.dispatchUserPhone) && (
                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 flex-wrap text-[12px] text-[#667085]">
                  {fill.dispatchOrgName && (
                    <span className="inline-flex items-center gap-1">
                      <Building2Icon className="w-3.5 h-3.5" />
                      派发部门:{fill.dispatchOrgName}
                    </span>
                  )}
                  {fill.dispatchUserName && (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5" />
                      派发人:{fill.dispatchUserName}
                    </span>
                  )}
                  {fill.dispatchUserPhone && (
                    <a
                      href={`tel:${fill.dispatchUserPhone}`}
                      className="inline-flex items-center gap-1 text-[#1A6BC8] hover:underline"
                      title="拨打派发人电话咨询"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      {fill.dispatchUserPhone}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 醒目截止提醒(临近 / 逾期) */}
          {showReminder && reminder && (
            <div
              className="rounded-xl border px-4 py-3 flex items-center gap-2.5 text-[14px] font-bold"
              style={dueToneStyle(reminder.tone)}
            >
              {reminder.tone === "overdue" ? (
                <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
              ) : (
                <ClockIcon className="w-5 h-5 flex-shrink-0" />
              )}
              {reminder.text}
              {reminder.tone === "overdue" ? ",请尽快提交报送" : ",请尽快完成填报"}
            </div>
          )}

          {/* 填报要求 */}
          {fill.notes && (
            <div className="rounded-xl border border-[#dce4ef] bg-white/85 p-4">
              <div className="text-[13px] font-bold text-[#344054] mb-1">填报要求</div>
              <div className="text-[13px] text-[#475467] whitespace-pre-wrap leading-relaxed">
                {fill.notes}
              </div>
            </div>
          )}

          {/* 退回原因(含累计退回次数) */}
          {returned && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-red-700">
                  已退回,请按修订意见修改后重新提交
                  {returnCount > 0 && (
                    <span className="ml-1.5 font-normal text-red-500">(第 {returnCount} 次退回)</span>
                  )}
                </div>
                {fill.submission.reviewNote && (
                  <div className="text-[13px] text-red-600 mt-1 whitespace-pre-wrap">
                    修订意见:{fill.submission.reviewNote}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 已提交 / 已通过 —— 锁定只读提示 */}
          {locked && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-start gap-2 text-[13px] text-indigo-700">
              <LockIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2 flex-wrap">
                  {approved ? "已通过审核" : "已提交,等待审核"}
                  <DueBadge dueAt={fill.dueAt} submittedAt={submittedAt} />
                </div>
                <div className="mt-0.5 text-indigo-600">
                  {submittedAt
                    ? `提交于 ${submittedAt.replace("T", " ").slice(0, 16)}。`
                    : ""}
                  内容已锁定,不能再改;{approved ? "如需变更请联系派发人。" : "如需修改请联系派发人退回后再编辑。"}
                  {returnCount > 0 && `(此前已被退回 ${returnCount} 次)`}
                </div>
              </div>
            </div>
          )}

          {/* 填报表单(锁定时整组 fieldset 禁用 → 原生只读) */}
          {fill.fields.length === 0 ? (
            <div className="text-center py-12 text-[#9CA3AF] text-sm rounded-xl border border-dashed border-[#dce4ef] bg-white/70">
              本任务没有填报项
            </div>
          ) : (
            <fieldset
              disabled={locked}
              className="space-y-4 border-0 p-0 m-0 min-w-0 disabled:opacity-75"
            >
              {groups.map((g) => (
                <div
                  key={g.key}
                  className="rounded-xl border border-[#dce4ef] bg-white/85 overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-[#F7F8FA] text-[15px] font-bold text-[#344054]">
                    {g.label}
                  </div>
                  <div className="divide-y divide-[#F1F3F5]">
                    {g.fields.map((f) => (
                      <FillRow
                        key={f.code}
                        field={f}
                        value={formData[f.code]}
                        onChange={(v) => setEdits((p) => ({ ...(p ?? base), [f.code]: v }))}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          {/* 往期填报(同单位历史,只读回看) */}
          {fill.history.length > 0 && (
            <HistoryPanel history={fill.history} fields={fill.fields} />
          )}
        </div>
      </div>

      {/* 底部固定操作条 —— 锁定时只留返回 */}
      <div className="border-t border-[#e6ebf2] bg-white/90 backdrop-blur px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2.5">
          {locked ? (
            <div className="flex-1 flex items-center justify-between gap-3">
              <span className="text-[13px] text-[#667085] inline-flex items-center gap-1.5">
                <LockIcon className="w-4 h-4" />
                已提交锁定,需派发人退回后才能修改
              </span>
              <button
                type="button"
                onClick={() => navigate("/admin/tasks/inbox")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[14px] font-bold border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
              >
                返回待办
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => save.mutate(false)}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[14px] font-bold border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] disabled:opacity-50"
              >
                <SaveIcon className="w-4 h-4" />
                存草稿
              </button>
              <button
                type="button"
                onClick={() => save.mutate(true)}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-[14px] font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: PARTY }}
              >
                {save.isPending ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <SendIcon className="w-4 h-4" />
                )}
                提交报送
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 一行 = 左:字段名 + 说明 / 右:可输入填报控件(注册表 FillInput)。 */
function FillRow({
  field: f,
  value,
  onChange,
}: {
  field: TaskField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const def = getFieldType(f.type);
  const Icon = def.icon;
  const Fill = def.FillInput;
  return (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-4 items-start px-4 py-3">
      <div className="text-[14px] text-[#1A1A1A] leading-snug pt-1.5 min-w-0" title={f.label}>
        <Icon className="inline w-4 h-4 text-[#9CA3AF] mr-1 -mt-0.5 align-middle" />
        {f.label}
        {f.required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
        {f.description && (
          <div className="text-[12px] text-[#9CA3AF] mt-0.5 font-normal">{f.description}</div>
        )}
      </div>
      <div className="min-w-0">
        {Fill ? (
          <Fill field={f} value={value} onChange={onChange} />
        ) : (
          <span className="text-xs text-[#9CA3AF]">该字段暂不支持填报</span>
        )}
      </div>
    </div>
  );
}

/** 往期填报值 → 只读文本(file/image 取文件名,doclink 完成态,number 带单位) */
function histValueText(field: TaskField, value: unknown): string {
  if (field.type === "file" || field.type === "image") {
    if (!Array.isArray(value)) return "—";
    const names = (value as unknown[])
      .map((it) =>
        it && typeof it === "object"
          ? (it as { name?: string }).name ?? ""
          : typeof it === "string"
            ? it
            : "",
      )
      .filter(Boolean);
    return names.length ? names.join("、") : "—";
  }
  if (field.type === "doclink") return value === true ? "已完成" : "未完成";
  if (value === null || value === undefined || value === "") return "—";
  let t = String(value);
  if (field.type === "number" && field.unit) t = `${t}${field.unit}`;
  return t;
}

/** 往期填报回看:折叠面板,每期一卡展示本单位历史提交值(只读)。 */
function HistoryPanel({
  history,
  fields,
}: {
  history: TaskFillHistoryEntry[];
  fields: TaskField[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#dce4ef] bg-white/85 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold text-[#344054] hover:bg-[#F7F8FA]"
      >
        {open ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronRightIcon className="w-4 h-4" />
        )}
        <HistoryIcon className="w-4 h-4 text-[#1A6BC8]" />
        往期填报
        <span className="text-[12px] font-normal text-[#9CA3AF]">
          本单位近 {history.length} 期
        </span>
      </button>
      {open && (
        <div className="divide-y divide-[#F1F3F5] border-t border-[#F1F3F5]">
          {history.map((h) => (
            <div key={h.taskId} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#C2410C]">
                  <CalendarClockIcon className="w-3.5 h-3.5" />
                  {h.periodLabel ?? "往期"}
                </span>
                {h.submittedAt && (
                  <span className="text-[12px] text-[#9CA3AF]">
                    提交于 {h.submittedAt.replace("T", " ").slice(0, 16)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                {fields.map((f) => (
                  <Fragment key={f.code}>
                    <div className="text-[#6B7280] truncate" title={f.label}>
                      {f.label}
                    </div>
                    <div className="text-[#172033] break-words whitespace-pre-wrap">
                      {histValueText(f, h.formData[f.code])}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full grid place-items-center text-sm text-[#9CA3AF]"
      style={{ background: PAGE_BG }}
    >
      {children}
    </div>
  );
}
