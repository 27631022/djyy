/**
 * 任务填报页(P2.2)—— 责任人接收后,按任务字段动态渲染填报表单。
 * 每个字段的可输入控件由字段类型注册表的 FillInput 提供(text/textarea/number/date/select/
 * file/image/richtext/doclink),file/image 内部走 storage 上传。存草稿 / 提交(提交校验必填)。
 */
import { useState } from "react";
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
  CheckCircle2Icon,
} from "lucide-react";
import {
  taskApi,
  taskApiErrorMessage,
  groupTaskFields,
  TASK_TARGET_STATUS_LABEL,
  taskStatusChip,
  type TaskField,
} from "../api";
import { getFieldType } from "../fields";

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
  const returned = subStatus === "returned";
  // 状态小标:草稿态用对象状态,已提交/退回用回执状态
  const chipStatus = subStatus === "draft" ? fill.targetStatus : subStatus;

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
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full"
                  style={taskStatusChip(chipStatus)}
                >
                  {TASK_TARGET_STATUS_LABEL[chipStatus] ?? chipStatus}
                </span>
                {fill.dueAt && (
                  <span className="text-[12px] text-[#667085] inline-flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    截止 {fill.dueAt.replace("T", " ").slice(0, 16)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 填报要求 */}
          {fill.notes && (
            <div className="rounded-xl border border-[#dce4ef] bg-white/85 p-4">
              <div className="text-[13px] font-bold text-[#344054] mb-1">填报要求</div>
              <div className="text-[13px] text-[#475467] whitespace-pre-wrap leading-relaxed">
                {fill.notes}
              </div>
            </div>
          )}

          {/* 退回原因 */}
          {returned && fill.submission.reviewNote && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[13px] font-bold text-red-700">已退回,请修改后重新提交</div>
                <div className="text-[13px] text-red-600 mt-0.5">{fill.submission.reviewNote}</div>
              </div>
            </div>
          )}

          {/* 已提交提示 */}
          {submitted && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] text-indigo-700 flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4 flex-shrink-0" />
              已提交
              {fill.submission.submittedAt
                ? `于 ${fill.submission.submittedAt.replace("T", " ").slice(0, 16)}`
                : ""}
              。如需修改可重新编辑并再次提交。
            </div>
          )}

          {/* 填报表单 */}
          {fill.fields.length === 0 ? (
            <div className="text-center py-12 text-[#9CA3AF] text-sm rounded-xl border border-dashed border-[#dce4ef] bg-white/70">
              本任务没有填报项
            </div>
          ) : (
            groups.map((g) => (
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
            ))
          )}
        </div>
      </div>

      {/* 底部固定操作条 */}
      <div className="border-t border-[#e6ebf2] bg-white/90 backdrop-blur px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2.5">
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
