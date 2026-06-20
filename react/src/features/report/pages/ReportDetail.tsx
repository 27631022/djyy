import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
} from "lucide-react";
import { reportApi, centsToYuan, type ReportTargetDetail, type ReportSubmissionRow } from "../api";
import { ReportTaskActions } from "../components/ReportTaskActions";
import { ReportGoalProgress } from "../components/ReportGoalProgress";

const TARGET_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "待接收", bg: "#FEF3C7", color: "#B45309" },
  in_progress: { label: "填报中", bg: "#DBEAFE", color: "#1D4ED8" },
  submitted: { label: "已报送", bg: "#DCFCE7", color: "#047857" },
  closed: { label: "已结束", bg: "#F1F5F9", color: "#64748B" },
};
const SUB_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  submitted: { label: "待审核", bg: "#FEF3C7", color: "#B45309" },
  approved: { label: "已通过", bg: "#DCFCE7", color: "#047857" },
  returned: { label: "已退回", bg: "#FEE2E2", color: "#B91C1C" },
};
const errMsg = (e: unknown, fb: string) => {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fb;
};

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const taskQ = useQuery({ queryKey: ["report", "task", id], queryFn: () => reportApi.getTask(id!), enabled: !!id });
  const targets = useMemo(() => taskQ.data?.targets ?? [], [taskQ.data]);

  const stat = useMemo(() => {
    const submittedUnits = targets.filter((t) => t.submissionCount > 0).length;
    const invoices = targets.reduce((s, t) => s + t.submissionCount, 0);
    return { units: targets.length, submittedUnits, invoices };
  }, [targets]);

  if (taskQ.isLoading) return <div className="p-10 text-center text-sm text-gray-400">加载…</div>;
  if (taskQ.error || !taskQ.data) return <div className="p-10 text-center text-sm text-red-500">{errMsg(taskQ.error, "报送任务不存在")}</div>;
  const task = taskQ.data;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <button onClick={() => navigate("/admin/reports")} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeftIcon className="h-4 w-4" />
        返回多次报送
      </button>

      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-800">{task.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {task.dueAt && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                截止 {new Date(task.dueAt).toLocaleString("zh-CN").slice(0, 16)}
              </span>
            )}
            {task.notes && <span className="truncate">填报要求:{task.notes}</span>}
          </div>
        </div>
        <ReportTaskActions
          task={{ id: task.id, title: task.title, notes: task.notes, dueAt: task.dueAt }}
          onDeleted={() => navigate("/admin/reports")}
        />
      </header>

      {/* 进度汇总 */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="派发单位" value={stat.units} />
        <Stat label="已录入单位" value={`${stat.submittedUnits} / ${stat.units}`} />
        <Stat label="累计发票" value={`${stat.invoices} 张`} />
      </div>

      {/* 目标完成情况(有目标才显示) */}
      <ReportGoalProgress taskId={task.id} />

      {/* 派发对象 */}
      <h2 className="mb-2 text-base font-semibold text-gray-800">派发对象与审核</h2>
      <div className="space-y-2">
        {targets.map((t) => (
          <TargetCard key={t.id} target={t} taskId={task.id} />
        ))}
        {targets.length === 0 && <div className="py-10 text-center text-sm text-gray-400">无派发对象</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
      <div className="text-xl font-semibold text-[var(--party-primary)]">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function TargetCard({ target, taskId }: { target: ReportTargetDetail; taskId: string }) {
  const [open, setOpen] = useState(false);
  const chip = TARGET_STATUS[target.status] ?? { label: target.status, bg: "#F1F5F9", color: "#64748B" };
  const name = target.targetOrgName ?? target.ownerUserName ?? "(对象)";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60">
        {target.submissionCount > 0 ? (
          open ? <ChevronDownIcon className="h-4 w-4 text-gray-400" /> : <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        ) : (
          <span className="w-4" />
        )}
        <Building2Icon className="h-4 w-4 flex-shrink-0 text-[#246BFE]" />
        <span className="font-medium text-gray-800">{name}</span>
        {target.handlerOrgName && <span className="text-xs text-gray-400">责任部门:{target.handlerOrgName}</span>}
        {target.ownerUserName && <span className="text-xs text-gray-400">承办:{target.ownerUserName}</span>}
        <div className="flex-1" />
        <span className="text-xs text-gray-500">已录 {target.submissionCount} 张</span>
        <span className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: chip.bg, color: chip.color }}>
          {chip.label}
        </span>
      </button>
      {open && target.submissionCount > 0 && <TargetReview targetId={target.id} taskId={taskId} />}
    </div>
  );
}

function TargetReview({ targetId, taskId }: { targetId: string; taskId: string }) {
  const qc = useQueryClient();
  const subsQ = useQuery({ queryKey: ["report", "submissions", targetId], queryFn: () => reportApi.listSubmissions(targetId) });
  const review = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "return"; note?: string }) =>
      reportApi.reviewSubmission(v.id, v.decision, v.note),
    onSuccess: () => {
      toast.success("已处理");
      qc.invalidateQueries({ queryKey: ["report", "submissions", targetId] });
      qc.invalidateQueries({ queryKey: ["report", "task", taskId] });
    },
    onError: (e) => toast.error(errMsg(e, "操作失败")),
  });
  const subs = subsQ.data ?? [];

  if (subsQ.isLoading) return <div className="px-4 py-3 text-sm text-gray-400">加载发票…</div>;
  return (
    <div className="space-y-3 border-t border-gray-50 bg-gray-50/40 p-3">
      {subs.map((sub) => (
        <SubmissionReviewCard key={sub.id} sub={sub} busy={review.isPending} onReview={(decision, note) => review.mutate({ id: sub.id, decision, note })} />
      ))}
    </div>
  );
}

function SubmissionReviewCard({
  sub,
  busy,
  onReview,
}: {
  sub: ReportSubmissionRow;
  busy: boolean;
  onReview: (decision: "approve" | "return", note?: string) => void;
}) {
  const baseChip = SUB_STATUS[sub.status] ?? { label: sub.status, bg: "#F1F5F9", color: "#64748B" };
  const chip = sub.status === "approved" && sub.autoApproved ? { ...baseChip, label: "已通过 · 自动" } : baseChip;
  const feeSource = sub.lines[0]?.feeSource ?? "";
  return (
    <div className="overflow-hidden rounded-lg border border-gray-100 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-50 px-3 py-2">
        <span className="text-xs text-gray-400">#{sub.seq}</span>
        <span className="font-medium text-gray-800">发票号 {sub.invoiceNo}</span>
        <span className="text-xs text-gray-400">{sub.purchaseDate?.slice(0, 10)}</span>
        <span className="text-sm font-medium text-[var(--party-primary)]">
          ¥{centsToYuan(sub.totalAmountCents + sub.totalTaxCents)} <span className="text-[11px] font-normal text-gray-400">含税</span>
        </span>
        {feeSource && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{feeSource}</span>}
        <span className="rounded-full px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: chip.bg, color: chip.color }}>
          {chip.label}
        </span>
        <div className="flex-1" />
        {sub.status === "submitted" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onReview("approve")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "#059669" }}
            >
              <CheckIcon className="h-3.5 w-3.5" />
              通过
            </button>
            <button
              onClick={() => {
                const note = window.prompt("退回原因(承办人会看到):");
                if (note && note.trim()) onReview("return", note.trim());
              }}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-white px-2.5 py-1 text-xs font-bold text-[#DC2626] disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" />
              退回
            </button>
          </div>
        )}
      </div>
      {sub.supplier && (
        <div className="border-b border-gray-50 px-3 py-1 text-xs text-gray-500">销售方:{sub.supplier}</div>
      )}
      {sub.status === "returned" && sub.reviewNote && (
        <div className="border-b border-gray-50 bg-red-50 px-3 py-1 text-xs text-red-700">退回原因:{sub.reviewNote}</div>
      )}
      {sub.discrepancyNote && (
        <div className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          ⚠ 需重点审查(提交人已确认差异):{sub.discrepancyNote}
        </div>
      )}
      {sub.status === "approved" && sub.autoApproved && (
        <div className="border-b border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
          ✓ 系统自动审核通过:明细金额与发票一致,且均在扶贫清单目录
        </div>
      )}
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-50">
          {sub.lines.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-1.5 text-gray-800">
                {l.productName}
                {l.spec && <span className="ml-1 text-[11px] text-gray-400">{l.spec}</span>}
              </td>
              <td className="px-3 py-1.5 text-gray-500">{l.origin}</td>
              <td className="px-3 py-1.5 text-right text-gray-700">{centsToYuan(l.amountCents + l.taxCents)} 元 <span className="text-[11px] text-gray-400">含税</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
