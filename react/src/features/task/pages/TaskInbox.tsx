/**
 * 我的待办(接收侧)—— 我负责的 + 我所在责任部门「待接收」的任务。
 * 待接收 → 点「接收」认领,成为该任务责任人(status→填报中)→ 进入填报页;我负责的 → 点「填报」继续。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  InboxIcon,
  Building2Icon,
  ClockIcon,
  HandIcon,
  PencilLineIcon,
  Loader2Icon,
} from "lucide-react";
import {
  taskApi,
  taskApiErrorMessage,
  TASK_TARGET_STATUS_LABEL,
  taskStatusChip,
  type TaskInboxItem,
} from "../api";

const PARTY = "var(--party-primary)";
const PAGE_BG = "linear-gradient(120deg, rgba(200,0,30,0.05), transparent 30%), #eef2f7";

export default function TaskInboxPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["task-inbox"], queryFn: () => taskApi.inbox() });
  const items = q.data ?? [];

  const claim = useMutation({
    mutationFn: (targetId: string) => taskApi.claim(targetId),
    onSuccess: (_r, targetId) => {
      qc.invalidateQueries({ queryKey: ["task-inbox"] });
      toast.success("已接收,开始填报");
      navigate(`/admin/tasks/fill/${targetId}`);
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "接收失败"), { duration: 8000 }),
  });

  const pending = items.filter((i) => i.claimable);
  const mine = items.filter((i) => !i.claimable);

  return (
    <div className="h-full overflow-auto" style={{ background: PAGE_BG }}>
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <header className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl grid place-items-center bg-party-soft">
            <InboxIcon className="w-5 h-5" style={{ color: PARTY }} />
          </span>
          <div>
            <h1 className="text-[20px] font-bold text-[#172033]">我的待办</h1>
            <p className="text-[13px] text-[#667085]">我负责的 + 我所在责任部门待接收的任务</p>
          </div>
          <div className="flex-1" />
          {q.isFetching && <Loader2Icon className="w-4 h-4 animate-spin text-[#9CA3AF]" />}
        </header>

        {q.isLoading ? (
          <div className="text-center py-16 text-[#9CA3AF] text-sm">加载待办…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-[#dce4ef] bg-white/70 text-[#9CA3AF]">
            <InboxIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <div className="text-sm">暂无待办任务</div>
            <div className="text-xs mt-1">机关部门派发、且对口到你所在部门的任务会出现在这里</div>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <Section title={`待接收(${pending.length})`} hint="本部门对口,接收后由你负责">
                {pending.map((it) => (
                  <InboxRow
                    key={it.targetId}
                    item={it}
                    action={
                      <button
                        type="button"
                        onClick={() => claim.mutate(it.targetId)}
                        disabled={claim.isPending}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
                        style={{ backgroundColor: PARTY }}
                      >
                        <HandIcon className="w-4 h-4" />
                        接收
                      </button>
                    }
                  />
                ))}
              </Section>
            )}
            {mine.length > 0 && (
              <Section title={`我负责的(${mine.length})`} hint="已接收 / 直派给我">
                {mine.map((it) => (
                  <InboxRow
                    key={it.targetId}
                    item={it}
                    action={
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/tasks/fill/${it.targetId}`)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold text-white"
                        style={{ backgroundColor: PARTY }}
                      >
                        <PencilLineIcon className="w-4 h-4" />
                        {it.status === "submitted" ? "查看填报" : "填报"}
                      </button>
                    }
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[14px] font-bold text-[#344054]">{title}</h2>
        {hint && <span className="text-[12px] text-[#9CA3AF]">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function InboxRow({ item, action }: { item: TaskInboxItem; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#dce4ef] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(28,42,68,0.04)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-bold text-[#172033] truncate">{item.title}</span>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={taskStatusChip(item.status)}
          >
            {TASK_TARGET_STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px] text-[#667085]">
          {item.dispatchOrgName && (
            <span className="inline-flex items-center gap-1">
              <Building2Icon className="w-3.5 h-3.5" />来自 {item.dispatchOrgName}
            </span>
          )}
          {item.handlerOrgName && <span>责任部门:{item.handlerOrgName}</span>}
          {item.dueAt && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />截止 {item.dueAt.replace("T", " ").slice(0, 16)}
            </span>
          )}
          <span>{item.fieldCount} 个填报项</span>
        </div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}
