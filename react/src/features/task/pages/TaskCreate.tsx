/**
 * 新建任务向导(重构版)——「左竖步骤 / 右操作区」结构 + workbench 视觉。
 *   Step 1 上传识别:AI 上传通知文件自动识别 任务名/填报要求/截止日期 + 按要求生成字段、建议范围
 *   Step 2 设计填报:左工具 / 右画布(FieldDesigner 充满);按填报要求生成字段 / 复制往期任务字段
 *   Step 3 派发对象:组织树 + 快捷选单位(层级 / 自定义组 / AI 建议范围)
 *   Step 4 确认派发:汇总 + 填报预览
 */
import { useMemo, useState, type ElementType } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  SendIcon,
  SparklesIcon,
  PencilRulerIcon,
  UsersIcon,
  ListChecksIcon,
  Building2Icon,
  ClockIcon,
  FileTextIcon,
  Loader2Icon,
  Wand2Icon,
  CopyIcon,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import {
  taskApi,
  type TaskField,
  type TaskTargetInput,
  type TaskExtractResponse,
} from "../api";
import { FieldDesigner } from "../components/FieldDesigner";
import { TaskFormPreview } from "../components/TaskFormPreview";
import { TargetPicker, type PickedTarget, type AiScope } from "../components/TargetPicker";
import { TaskStep1Upload } from "../components/TaskStep1Upload";

const PARTY = "var(--party-primary)";
const PAGE_BG =
  "linear-gradient(120deg, rgba(200,0,30,0.06), transparent 32%), linear-gradient(315deg, rgba(36,107,254,0.10), transparent 34%), #eef2f7";

interface StepDef {
  label: string;
  desc: string;
  icon: ElementType;
}
const STEPS: StepDef[] = [
  { label: "上传识别", desc: "AI 识别通知文件 · 基本信息", icon: SparklesIcon },
  { label: "设计填报", desc: "拖拽搭建填报表单", icon: PencilRulerIcon },
  { label: "派发对象", desc: "选单位 / 个人", icon: UsersIcon },
  { label: "确认派发", desc: "核对并下发", icon: ListChecksIcon },
];

export default function TaskCreatePage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

  // Step1 基本信息
  const [title, setTitle] = useState("");
  const [requirements, setRequirements] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [noticeFileId, setNoticeFileId] = useState<string | null>(null);
  const [noticeFileName, setNoticeFileName] = useState<string | null>(null);
  // Step2 字段
  const [fields, setFields] = useState<TaskField[]>([]);
  // Step3 对象 + AI 建议范围
  const [targets, setTargets] = useState<PickedTarget[]>([]);
  const [aiScope, setAiScope] = useState<AiScope | undefined>(undefined);

  const primaryAdmin = useMemo(
    () => me?.memberships.admin.find((m) => m.isPrimary) ?? me?.memberships.admin[0],
    [me],
  );
  const dispatchOrgId = primaryAdmin?.org.id;
  const dispatchOrgName = primaryAdmin?.org.name;

  // 往期任务(复制字段用)
  const pastTasksQuery = useQuery({
    queryKey: ["tasks", "mine-for-copy"],
    queryFn: () => taskApi.list(),
  });
  const pastTasks = (pastTasksQuery.data ?? []).filter((t) => t.fieldCount > 0);

  function onExtracted(r: TaskExtractResponse) {
    if (r.fields.length > 0) setFields(r.fields.map((f) => ({ ...f })));
    if (r.scopeHint || r.suggestedUnits.length > 0) {
      setAiScope({ level: r.scopeHint, units: r.suggestedUnits });
    }
  }

  // 按填报要求生成字段
  const genFields = useMutation({
    mutationFn: () => taskApi.suggestFields(requirements.trim(), title.trim() || undefined),
    onSuccess: (r) => {
      if (fields.length > 0 && !confirm(`用 AI 生成的 ${r.fields.length} 个字段覆盖当前设计?`)) return;
      setFields(r.fields.map((f) => ({ ...f })));
      toast.success(`已按填报要求生成 ${r.fields.length} 个字段`);
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e.response?.data?.message ?? e.message ?? "生成失败"),
  });

  // 复制往期任务字段
  const copyTask = useMutation({
    mutationFn: (id: string) => taskApi.get(id),
    onSuccess: (t) => {
      if (t.fields.length === 0) {
        toast.warning("该任务没有填报字段");
        return;
      }
      if (fields.length > 0 && !confirm(`用「${t.title}」的 ${t.fields.length} 个字段覆盖当前设计?`)) return;
      setFields(t.fields.map((f) => ({ ...f })));
      toast.success(`已复制「${t.title}」的 ${t.fields.length} 个字段`);
    },
    onError: () => toast.error("复制失败"),
  });

  const dispatch = useMutation({
    mutationFn: () => {
      const targetInputs: TaskTargetInput[] = targets.map((t) =>
        t.targetType === "org"
          ? { targetType: "org", targetOrgId: t.id }
          : { targetType: "user", targetUserId: t.id },
      );
      return taskApi.dispatch({
        title: title.trim(),
        notes: requirements.trim() || undefined,
        dispatchOrgId,
        dueAt: dueAt || undefined,
        noticeFileId: noticeFileId || undefined,
        noticeFileName: noticeFileName || undefined,
        fields,
        targets: targetInputs,
        status: "open",
      });
    },
    onSuccess: (task) => {
      toast.success(`已派发「${task.title}」到 ${task.targets.length} 个对象`);
      navigate(`/admin/tasks/${task.id}`);
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join("; ") : (msg ?? err.message ?? "派发失败"));
    },
  });

  const canNext =
    (step === 0 && !!title.trim()) ||
    (step === 1 && fields.length > 0) ||
    (step === 2 && targets.length > 0) ||
    step === 3;

  function goNext() {
    if (!canNext || step >= 3) return;
    const n = step + 1;
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }
  function goPrev() {
    if (step === 0) navigate("/admin/tasks");
    else setStep(step - 1);
  }
  function jump(i: number) {
    if (i <= maxStep) setStep(i);
  }

  const current = STEPS[step];
  const reqTooShort = requirements.trim().length < 4;

  return (
    <div className="h-full flex flex-col" style={{ background: PAGE_BG }}>
      {/* 顶栏 */}
      <header className="flex-shrink-0 flex items-center gap-3 px-6 h-[60px] border-b border-[#e2e8f0]/80 bg-white/75 backdrop-blur-xl">
        <button
          onClick={() => navigate("/admin/tasks")}
          className="flex items-center gap-1.5 text-[13px] text-[#667085] hover:text-[#172033]"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          任务列表
        </button>
        <div className="w-px h-5 bg-[#e2e8f0]" />
        <SendIcon className="w-5 h-5" style={{ color: PARTY }} />
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold text-[#172033] leading-tight">新建任务</h1>
          <p className="text-[12px] text-[#667085]">上传识别 → 设计填报 → 派发对象 → 确认下发</p>
        </div>
      </header>

      {/* 主体:左竖步骤 / 右操作区 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 px-6 py-5 overflow-hidden">
        {/* 左:步骤卡 */}
        <aside className="hidden lg:flex flex-col gap-2 rounded-xl border border-[#dce4ef] bg-white/80 shadow-[0_12px_34px_rgba(28,42,68,0.06)] p-4 overflow-auto">
          {STEPS.map((s, i) => {
            const status = i === step ? "active" : i < step ? "done" : "pending";
            const Icon = s.icon;
            const clickable = i <= maxStep && i !== step;
            return (
              <div key={s.label} className="relative">
                <button
                  type="button"
                  disabled={!clickable && i !== step}
                  onClick={() => jump(i)}
                  className={`w-full flex items-start gap-3 rounded-xl p-3 text-left transition-all ${
                    status === "active"
                      ? "bg-party-soft border border-[var(--party-primary)]/60"
                      : "border border-transparent"
                  } ${clickable ? "cursor-pointer hover:bg-[#f4f7fb]" : status === "pending" ? "opacity-50" : ""}`}
                >
                  <span
                    className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 text-[12px] font-bold ${
                      status === "done"
                        ? "bg-green-500 text-white"
                        : status === "active"
                          ? "bg-[var(--party-primary)] text-white"
                          : "bg-[#e8edf4] text-[#9CA3AF]"
                    }`}
                  >
                    {status === "done" ? <CheckIcon className="w-4 h-4" /> : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[14px] font-bold flex items-center gap-1.5 ${
                        status === "active" ? "text-[var(--party-primary)]" : "text-[#172033]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
                      {s.label}
                    </div>
                    <div className="text-[12px] text-[#9CA3AF] mt-0.5">{s.desc}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[1.75rem] top-[3.25rem] w-px h-2 bg-[#e2e8f0]" />
                )}
              </div>
            );
          })}
          <div className="mt-auto pt-3 text-[11px] leading-relaxed text-[#9CA3AF]">
            点已完成的步骤可返回修改。第二步可「按填报要求生成字段」或复制往期任务。
          </div>
        </aside>

        {/* 右:操作区 */}
        <section className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[#dce4ef] bg-white/85 shadow-[0_14px_38px_rgba(28,42,68,0.08)] overflow-hidden">
            {/* 操作区头 */}
            <div className="flex-shrink-0 flex items-center gap-2.5 px-6 pt-5 pb-3.5 border-b border-[#eef2f7]">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-party-soft flex-shrink-0">
                <current.icon className="w-[18px] h-[18px]" style={{ color: PARTY }} />
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-[#172033] leading-tight">
                  第 {step + 1} 步 · {current.label}
                </h2>
                <p className="text-[12px] text-[#667085]">{current.desc}</p>
              </div>
            </div>

            {/* 操作区体 */}
            {step === 1 ? (
              <div className="flex-1 min-h-0 flex flex-col p-4">
                <div className="flex-shrink-0 flex items-center flex-wrap gap-2 mb-2.5">
                  <button
                    type="button"
                    onClick={() => genFields.mutate()}
                    disabled={genFields.isPending || reqTooShort}
                    title={reqTooShort ? "先在第一步填写「填报要求」" : "让 AI 按填报要求生成字段"}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold border border-purple-300 bg-gradient-to-r from-purple-50 to-blue-50 text-purple-700 hover:border-purple-500 disabled:opacity-50"
                  >
                    {genFields.isPending ? (
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2Icon className="w-4 h-4" />
                    )}
                    按填报要求生成字段
                  </button>
                  <div className="relative">
                    <select
                      value=""
                      onChange={(e) => e.target.value && copyTask.mutate(e.target.value)}
                      disabled={pastTasks.length === 0 || copyTask.isPending}
                      className="appearance-none pl-8 pr-3 py-1.5 text-[13px] border border-[#dce4ef] rounded-lg bg-white text-[#344054] focus:outline-none focus:border-[var(--party-primary)] disabled:opacity-50"
                    >
                      <option value="">
                        {pastTasks.length === 0 ? "无往期任务可复制" : "复制往期任务字段…"}
                      </option>
                      {pastTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}（{t.fieldCount} 字段）
                        </option>
                      ))}
                    </select>
                    <CopyIcon className="w-4 h-4 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <div className="flex-1" />
                  <span className="text-[12px] text-[#9CA3AF]">{fields.length} 个字段</span>
                </div>
                <div className="flex-1 min-h-0">
                  <FieldDesigner value={fields} onChange={setFields} fill />
                </div>
              </div>
            ) : step === 2 ? (
              <div className="flex-1 min-h-0 p-4">
                <TargetPicker
                  value={targets}
                  onChange={setTargets}
                  aiScope={aiScope}
                  uid={me?.id ?? "anon"}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto p-6">
                {step === 0 && (
                  <TaskStep1Upload
                    title={title}
                    setTitle={setTitle}
                    requirements={requirements}
                    setRequirements={setRequirements}
                    dueAt={dueAt}
                    setDueAt={setDueAt}
                    noticeFileName={noticeFileName}
                    setNoticeFile={(id, name) => {
                      setNoticeFileId(id);
                      setNoticeFileName(name);
                    }}
                    clearNoticeFile={() => {
                      setNoticeFileId(null);
                      setNoticeFileName(null);
                    }}
                    dispatchOrgName={dispatchOrgName}
                    onExtracted={onExtracted}
                  />
                )}

                {step === 3 && (
                  <ConfirmStep
                    title={title}
                    requirements={requirements}
                    dueAt={dueAt}
                    dispatchOrgName={dispatchOrgName}
                    noticeFileName={noticeFileName}
                    targets={targets}
                    fields={fields}
                  />
                )}
              </div>
            )}
          </div>

          {/* 底部导航 */}
          <div className="flex-shrink-0 mt-4 flex items-center justify-between">
            <button
              onClick={goPrev}
              disabled={dispatch.isPending}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[14px] rounded-lg border border-[#dce4ef] bg-white/85 hover:bg-white text-[#475467] disabled:opacity-50"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              {step === 0 ? "返回列表" : "上一步"}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#9CA3AF]">
                {step === 0
                  ? title.trim()
                    ? "基本信息已就绪"
                    : "请填写任务名称"
                  : step === 1
                    ? `${fields.length} 个填报字段`
                    : step === 2
                      ? `已选 ${targets.length} 个对象`
                      : `${targets.length} 个对象 · ${fields.length} 字段`}
              </span>
              {step < 3 ? (
                <button
                  disabled={!canNext}
                  onClick={goNext}
                  className="flex items-center gap-1.5 px-6 py-2.5 text-[14px] font-bold text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: PARTY }}
                >
                  下一步
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              ) : (
                <button
                  disabled={dispatch.isPending || targets.length === 0 || !title.trim()}
                  onClick={() => dispatch.mutate()}
                  className="flex items-center gap-1.5 px-6 py-2.5 text-[14px] font-bold text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: PARTY }}
                >
                  {dispatch.isPending ? (
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                  ) : (
                    <SendIcon className="w-4 h-4" />
                  )}
                  {dispatch.isPending ? "派发中…" : `派发给 ${targets.length} 个对象`}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── 确认步 ─── */
function ConfirmStep({
  title,
  requirements,
  dueAt,
  dispatchOrgName,
  noticeFileName,
  targets,
  fields,
}: {
  title: string;
  requirements: string;
  dueAt: string;
  dispatchOrgName?: string;
  noticeFileName: string | null;
  targets: PickedTarget[];
  fields: TaskField[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
        <Info label="任务名称" value={title || "—"} />
        <Info label="派发部门" value={dispatchOrgName ?? "(无)"} icon={Building2Icon} />
        <Info label="截止时间" value={dueAt ? dueAt.replace("T", " ") : "不限"} icon={ClockIcon} />
        <Info label="通知文件" value={noticeFileName ?? "无"} icon={noticeFileName ? FileTextIcon : undefined} />
      </div>

      {requirements && (
        <Block label="填报要求">
          <p className="text-[14px] text-[#344054] whitespace-pre-wrap leading-relaxed bg-[#f7f9fc] border border-[#dce4ef] rounded-lg px-3.5 py-2.5">
            {requirements}
          </p>
        </Block>
      )}

      <Block label={`派发对象（${targets.length}）`}>
        <div className="flex flex-wrap gap-2">
          {targets.map((t) => (
            <span
              key={`${t.targetType}:${t.id}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#dce4ef] text-[13px] text-[#475467]"
            >
              {t.targetType === "org" ? (
                <Building2Icon className="w-3.5 h-3.5 text-[#246BFE]" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--party-primary)]" />
              )}
              {t.name}
            </span>
          ))}
        </div>
      </Block>

      <Block label={`填报内容预览（${fields.length} 字段）`}>
        <TaskFormPreview fields={fields} />
      </Block>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: ElementType }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0">
        <div className="text-[12px] text-[#9CA3AF]">{label}</div>
        <div className="text-[14px] text-[#172033] mt-0.5 flex items-center gap-1.5">
          {Icon && <Icon className="w-4 h-4 text-[#667085]" />}
          <span className="truncate">{value}</span>
        </div>
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-[#667085] mb-1.5">{label}</div>
      {children}
    </div>
  );
}
