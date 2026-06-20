import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2Icon, ClockIcon, HandIcon, PencilLineIcon, FileStackIcon } from "lucide-react";
import { reportApi, type ReportInboxItem } from "../api";
import { ReportAssignPicker } from "./ReportAssignPicker";

const PARTY = "var(--party-primary)";

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "待接收", bg: "#FEF3C7", color: "#B45309" },
  in_progress: { label: "填报中", bg: "#DBEAFE", color: "#1D4ED8" },
  submitted: { label: "已提交", bg: "#DCFCE7", color: "#047857" },
  closed: { label: "已结束", bg: "#F1F5F9", color: "#64748B" },
};

function errMsg(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof m === "string" ? m : fallback;
}

/**
 * 报送待办分区(挂进统一「我的待办」)。无报送待办时渲染 null —— 不与任务待办互相干扰。
 * 数据层独立(自有 react-query),与 task 后端互不依赖,仅 UI 层并列。
 */
export function ReportInboxSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["report-inbox"], queryFn: () => reportApi.inbox() });
  const items = q.data ?? [];

  const claim = useMutation({
    mutationFn: (targetId: string) => reportApi.claim(targetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-inbox"] });
      toast.success("已接收,可开始录入");
    },
    onError: (e) => toast.error(errMsg(e, "接收失败"), { duration: 8000 }),
  });
  const assign = useMutation({
    mutationFn: (v: { targetId: string; userId: string }) => reportApi.assign(v.targetId, v.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-inbox"] });
      toast.success("已指派,进入承办人待办");
    },
    onError: (e) => toast.error(errMsg(e, "指派失败"), { duration: 8000 }),
  });

  if (items.length === 0) return null; // 无报送待办 → 不渲染

  const pending = items.filter((i) => i.claimable);
  const mine = items.filter((i) => !i.claimable);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--party-primary)]">
          <FileStackIcon className="h-4 w-4" />
          报送待办({items.length})
        </h2>
        <span className="text-[12px] text-[#9CA3AF]">扶贫采买等报送任务 · 同一任务可多次提交</span>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-[#344054]">待接收({pending.length})</div>
          {pending.map((it) => (
            <Row key={it.targetId} item={it}>
              <div className="flex items-center gap-2">
                {it.canAssign && it.assignOrgId && (
                  <ReportAssignPicker
                    orgId={it.assignOrgId}
                    orgName={it.assignOrgName}
                    busy={assign.isPending}
                    onPick={(userId) => assign.mutate({ targetId: it.targetId, userId })}
                  />
                )}
                <button
                  type="button"
                  onClick={() => claim.mutate(it.targetId)}
                  disabled={claim.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: PARTY }}
                >
                  <HandIcon className="h-4 w-4" />
                  接收
                </button>
              </div>
            </Row>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-[#344054]">我承办的({mine.length})</div>
          {mine.map((it) => (
            <Row key={it.targetId} item={it}>
              <button
                type="button"
                onClick={() => navigate(`/admin/reports/fill/${it.targetId}`)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white"
                style={{ backgroundColor: PARTY }}
              >
                <PencilLineIcon className="h-4 w-4" />
                录入{it.submissionCount > 0 ? `(已 ${it.submissionCount} 张)` : ""}
              </button>
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ item, children }: { item: ReportInboxItem; children: React.ReactNode }) {
  const chip = STATUS_CHIP[item.status] ?? { label: item.status, bg: "#F1F5F9", color: "#64748B" };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(28,42,68,0.04)]">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold text-[#172033]">{item.title}</span>
          <span className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: chip.bg, color: chip.color }}>
            {chip.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#667085]">
          {item.targetOrgName && (
            <span className="inline-flex items-center gap-1">
              <Building2Icon className="h-3.5 w-3.5" />
              {item.targetOrgName}
            </span>
          )}
          {item.handlerOrgName ? (
            <span>责任部门:{item.handlerOrgName}</span>
          ) : (
            item.claimable && <span className="text-[#0E7490]">全单位待认领</span>
          )}
          {item.dispatchUserName && (
            <span>
              派发人 {item.dispatchUserName}
              {item.dispatchUserPhone && <a href={`tel:${item.dispatchUserPhone}`} className="ml-1 text-[#1A6BC8]">{item.dispatchUserPhone}</a>}
            </span>
          )}
          {item.dueAt && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              截止 {item.dueAt.replace("T", " ").slice(0, 16)}
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
