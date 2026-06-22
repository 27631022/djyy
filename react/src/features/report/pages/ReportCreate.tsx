import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  UploadIcon,
  FileTextIcon,
  CheckCircle2Icon,
  SparklesIcon,
  XIcon,
  EyeIcon,
  PencilIcon,
} from "lucide-react";
import { storageApi } from "@/features/storage";
import { useAuth } from "@/stores/auth";
import {
  reportApi,
  FUPIN_TEMPLATE_FIELDS,
  type ReportField,
  type ReportGoal,
  type PublishReportInput,
} from "../api";
import { findFieldIssue } from "../fields";
import { FieldDesigner } from "../components/FieldDesigner";
import { ReportFillPreview } from "../components/ReportFillPreview";
import { ReportGoalEditor } from "../components/ReportGoalEditor";
import { GoalPerUnitTable } from "../components/GoalPerUnitTable";
import { GoalTargetPasteBox } from "../components/GoalTargetPasteBox";
import { ReportTargetPicker, type PickedTarget } from "../components/ReportTargetPicker";
import { OrgSelect } from "../components/OrgSelect";

const STEPS = ["基本信息", "设计填报字段", "派发对象", "目标设定", "确认发布"];

function defaultDueAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  d.setHours(15, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 找 fields(含明细列)里第一个 catalog_pick 的 catalogTag,作为任务级 catalogTag 快照。 */
function findCatalogTag(fields: ReportField[]): string | undefined {
  for (const f of fields) {
    if (f.type === "catalog_pick" && f.catalogTag) return f.catalogTag;
    if (f.type === "detail_table") {
      for (const c of f.columns ?? []) if (c.type === "catalog_pick" && c.catalogTag) return c.catalogTag;
    }
  }
  return undefined;
}

export default function ReportCreate() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [step, setStep] = useState(0);
  const [designMode, setDesignMode] = useState<"design" | "preview">("design");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState<string>(defaultDueAt());
  const [noticeFile, setNoticeFile] = useState<{ id: string; name: string } | null>(null);
  const [uploadingNotice, setUploadingNotice] = useState(false);
  const [fields, setFields] = useState<ReportField[]>([]);
  const [goals, setGoals] = useState<ReportGoal[]>([]);
  // 逐单位目标值:{ 派发对象id: { goalKey: 目标值 } }(达到≥/不超过≤ 用;exists 无需)
  const [goalTargets, setGoalTargets] = useState<Record<string, Record<string, number>>>({});
  const [targets, setTargets] = useState<PickedTarget[]>([]);
  const perUnitGoals = goals; // 所有目标都可设逐单位目标值(参考)
  // 派发部门 = 对口责任部门解析的 source(在「组织机构」里给各单位部门配 counterpartParentOrgIds);默认派发人主部门
  const [dispatchOrgId, setDispatchOrgId] = useState<string | null>(
    () =>
      me?.memberships.admin.find((m) => m.isPrimary)?.orgId ??
      me?.memberships.admin[0]?.orgId ??
      null,
  );

  const fieldIssue = findFieldIssue(fields);

  const publishMut = useMutation({
    mutationFn: () => {
      const payload: PublishReportInput = {
        title: title.trim(),
        notes: notes.trim() || undefined,
        catalogTag: findCatalogTag(fields),
        dueAt: dueAt || undefined,
        noticeFileId: noticeFile?.id,
        noticeFileName: noticeFile?.name,
        fields,
        goals,
        dispatchOrgId: dispatchOrgId ?? undefined,
        targets: targets.map((t) => ({
          targetType: t.targetType,
          targetOrgId: t.targetType === "org" ? t.id : undefined,
          targetUserId: t.targetType === "user" ? t.id : undefined,
          goalTargets: goalTargets[t.id], // 逐单位目标值(perUnit 金额目标)
        })),
        status: "open",
      };
      return reportApi.publish(payload);
    },
    onSuccess: (task) => {
      toast.success("报送任务已发布");
      navigate(`/admin/reports`, { state: { publishedId: task.id } });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === "string" ? msg : "发布失败");
    },
  });

  async function onPickNotice(file: File) {
    setUploadingNotice(true);
    try {
      const meta = await storageApi.upload(file, { ownerModule: "report", folder: "通知文件" });
      setNoticeFile({ id: meta.id, name: meta.originalName });
    } catch {
      toast.error("通知文件上传失败");
    } finally {
      setUploadingNotice(false);
    }
  }

  const canNext =
    step === 0
      ? title.trim().length > 0
      : step === 1
        ? fields.length > 0 && !fieldIssue
        : step === 2
          ? targets.length > 0 // 派发对象
          : step === 3
            ? true // 目标设定可空
            : true;

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr]">
        {/* 左竖步骤 */}
        <aside className="border-r border-gray-100 bg-gradient-to-b from-party-soft/40 to-white p-5">
          <h1 className="mb-1 text-xl font-semibold text-[var(--party-primary)]">发布报送任务</h1>
          <p className="mb-6 text-xs text-gray-500">一次发布 → 派发到单位 → 责任部门接收录入(可多次提交)</p>
          <ol className="space-y-1">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  i === step ? "bg-white font-medium text-[var(--party-primary)] shadow-sm" : "text-gray-500"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    i < step
                      ? "bg-[var(--party-primary)] text-white"
                      : i === step
                        ? "border border-[var(--party-primary)] text-[var(--party-primary)]"
                        : "border border-gray-200 text-gray-400"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </aside>

        {/* 右操作区 */}
        <main className="min-h-0 overflow-auto bg-white/80 p-6">
          {step === 0 && (
            <div className="max-w-2xl space-y-5">
              <Field label="任务名称" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如:2026 年消费帮扶采买报送"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none"
                />
              </Field>
              <Field label="填报要求">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="对基层单位的填报说明、口径要求等"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none"
                />
              </Field>
              <Field label="报送截止时间">
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--party-primary)] focus:outline-none"
                />
              </Field>
              <Field label="派发部门">
                <OrgSelect value={dispatchOrgId} onChange={setDispatchOrgId} placeholder="选择你的派发部门…" />
                <p className="mt-1 text-xs text-gray-400">
                  对口责任部门按此匹配(在「组织机构」里给各单位部门配「对口上级」即可);默认你的主部门。
                </p>
              </Field>
              <Field label="通知文件(可选)">
                {noticeFile ? (
                  <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm">
                    <FileTextIcon className="h-4 w-4 text-[#1A6BC8]" />
                    {noticeFile.name}
                    <button onClick={() => setNoticeFile(null)} className="text-gray-400 hover:text-red-600">
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]">
                    {uploadingNotice ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
                    上传通知文件
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onPickNotice(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-3">
                {/* 设计 / 预览填报 切换 */}
                <div className="inline-flex flex-shrink-0 rounded-lg border border-gray-200 bg-white p-0.5">
                  <ModeBtn active={designMode === "design"} onClick={() => setDesignMode("design")} icon={PencilIcon} label="设计字段" />
                  <ModeBtn active={designMode === "preview"} onClick={() => setDesignMode("preview")} icon={EyeIcon} label="预览填报" />
                </div>
                {designMode === "design" && (
                  <>
                    <button
                      onClick={() => setFields(structuredClone(FUPIN_TEMPLATE_FIELDS))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--party-primary)] bg-party-soft px-3 py-1.5 text-sm text-[var(--party-primary)]"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      用扶贫采买模板
                    </button>
                    <span className="text-xs text-gray-400">
                      点选清单商品自动带出名称/分类/产地/价格;发票/合同上传一次,明细多行
                    </span>
                  </>
                )}
                {fieldIssue && <span className="ml-auto text-xs text-red-500">⚠ {fieldIssue.label}:{fieldIssue.hint}</span>}
              </div>
              <div className="min-h-0 flex-1">
                {designMode === "design" ? (
                  <FieldDesigner value={fields} onChange={setFields} fill />
                ) : (
                  <ReportFillPreview fields={fields} title={title} notes={notes} dueAt={dueAt} />
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex h-full flex-col">
              <p className="mb-2 text-sm text-gray-500">
                选派发单位(分级树/快捷组,同任务派发)。命中对口的单位自动进其责任部门,否则全单位待认领。
              </p>
              <div className="min-h-0 flex-1">
                <ReportTargetPicker value={targets} onChange={setTargets} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-5xl space-y-5">
              <div>
                <p className="mb-3 text-sm text-gray-500">
                  设定本次报送的目标(可不设)。支持<b>多个</b>:总额 / 分项(费用来源)/ 分部分(第一部分…)金额目标,或「某部分 / 某字段是否有内容」检查。
                </p>
                <ReportGoalEditor value={goals} onChange={setGoals} fields={fields} catalogTag={findCatalogTag(fields)} />
              </div>
              {perUnitGoals.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-medium text-gray-700">逐单位目标值</div>
                  <p className="mb-2 text-xs text-gray-400">
                    以下目标按「逐单位不同」设定,左表逐个填,或右侧从 Excel 粘贴一次性导入(留空 = 暂不设,可发布后在详情补)。
                  </p>
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <GoalPerUnitTable
                        goals={perUnitGoals}
                        units={targets.map((t) => ({ id: t.id, name: t.name }))}
                        value={goalTargets}
                        onChange={setGoalTargets}
                      />
                    </div>
                    <GoalTargetPasteBox
                      goals={perUnitGoals}
                      units={targets.map((t) => ({ id: t.id, name: t.name }))}
                      onApply={(patch) =>
                        setGoalTargets((prev) => {
                          const next = { ...prev };
                          for (const [uid, vals] of Object.entries(patch)) next[uid] = { ...(next[uid] ?? {}), ...vals };
                          return next;
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="max-w-2xl space-y-3">
              <h2 className="text-lg font-semibold text-gray-800">确认发布</h2>
              <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                <Row k="任务名称" v={title} />
                <Row k="填报要求" v={notes || "—"} />
                <Row k="截止时间" v={dueAt ? dueAt.replace("T", " ") : "—"} />
                <Row k="通知文件" v={noticeFile?.name || "—"} />
                <Row k="填报字段" v={`${fields.length} 个`} />
                <Row k="报送目标" v={goals.length ? `${goals.length} 个` : "未设"} />
                <Row k="派发对象" v={`${targets.length} 个对象`} />
              </dl>
            </div>
          )}
        </main>
      </div>

      {/* 底部导航 */}
      <footer className="flex items-center justify-between border-t border-gray-100 bg-white px-6 py-3">
        <button
          onClick={() => (step === 0 ? navigate("/admin/reports") : setStep((s) => s - 1))}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {step === 0 ? "取消" : "上一步"}
        </button>
        {step < 4 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="rounded-lg bg-[var(--party-primary)] px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            下一步
          </button>
        ) : (
          <button
            onClick={() => publishMut.mutate()}
            disabled={publishMut.isPending || !title.trim() || fields.length === 0 || targets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--party-primary)] px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            {publishMut.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <CheckCircle2Icon className="h-4 w-4" />}
            发布报送任务
          </button>
        )}
      </footer>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-[var(--party-primary)] text-white" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </div>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm">
      <dt className="w-24 flex-shrink-0 text-gray-400">{k}</dt>
      <dd className="text-gray-800">{v}</dd>
    </div>
  );
}
