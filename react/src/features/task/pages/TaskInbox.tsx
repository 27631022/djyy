/**
 * 我的待办(接收侧)—— 我负责的 + 我所在责任部门「待接收」的任务。
 * 待接收 → 点「接收」认领,成为该任务责任人(status→填报中)→ 进入填报页;我负责的 → 点「填报」继续。
 */
import { useState } from "react";
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
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
  EyeIcon,
} from "lucide-react";
import {
  taskApi,
  taskApiErrorMessage,
  TASK_TARGET_STATUS_LABEL,
  taskStatusChip,
  type TaskInboxItem,
  type TaskConfirmQueueItem,
} from "../api";
import { ConfirmDrawer } from "../components/ConfirmDrawer";
import { AssignPicker } from "../components/AssignPicker";

const PARTY = "var(--party-primary)";
const PAGE_BG = "linear-gradient(120deg, rgba(200,0,30,0.05), transparent 30%), #eef2f7";

export default function TaskInboxPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["task-inbox"], queryFn: () => taskApi.inbox() });
  const items = q.data ?? [];

  // 平级确认队列(部门负责人侧):跨机关部门互派的待确认对象
  const confirmQ = useQuery({
    queryKey: ["task-confirm-queue"],
    queryFn: () => taskApi.confirmQueue(),
  });
  const confirmItems = confirmQ.data ?? [];
  // 「查看任务内容」抽屉:当前正在查看/确认的队列项
  const [peekItem, setPeekItem] = useState<TaskConfirmQueueItem | null>(null);

  const claim = useMutation({
    mutationFn: (targetId: string) => taskApi.claim(targetId),
    onSuccess: (_r, targetId) => {
      qc.invalidateQueries({ queryKey: ["task-inbox"] });
      toast.success("已接收,开始填报");
      navigate(`/admin/tasks/fill/${targetId}`);
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "接收失败"), { duration: 8000 }),
  });

  // 指派(部门负责人把待接收任务指定给本部门成员)
  const assign = useMutation({
    mutationFn: (v: { targetId: string; userId: string }) => taskApi.assign(v.targetId, v.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-inbox"] });
      toast.success("已指派,任务进入承办人待办");
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "指派失败"), { duration: 8000 }),
  });

  const confirm = useMutation({
    mutationFn: (v: { targetId: string; decision: "approve" | "reject"; note?: string }) =>
      taskApi.confirmTarget(v.targetId, v.decision, v.note),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["task-confirm-queue"] });
      qc.invalidateQueries({ queryKey: ["task-inbox"] });
      setPeekItem(null);
      toast.success(
        r.confirmStatus === "approved"
          ? "双方已通过,任务下发"
          : r.confirmStatus === "rejected"
            ? "已驳回该派发"
            : "已同意,待对方部门负责人确认",
      );
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "确认失败"), { duration: 8000 }),
  });

  const pending = items.filter((i) => i.claimable);
  const mine = items.filter((i) => !i.claimable);
  const hasAny = items.length > 0 || confirmItems.length > 0;

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
          {(q.isFetching || confirmQ.isFetching) && (
            <Loader2Icon className="w-4 h-4 animate-spin text-[#9CA3AF]" />
          )}
        </header>

        {q.isLoading ? (
          <div className="text-center py-16 text-[#9CA3AF] text-sm">加载待办…</div>
        ) : !hasAny ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-[#dce4ef] bg-white/70 text-[#9CA3AF]">
            <InboxIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <div className="text-sm">暂无待办任务</div>
            <div className="text-xs mt-1">上级派发到你所在单位 / 部门的任务会出现在这里</div>
          </div>
        ) : (
          <>
            {confirmItems.length > 0 && (
              <section>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-[14px] font-bold text-[#B45309] inline-flex items-center gap-1.5">
                    <ShieldCheckIcon className="w-4 h-4" />待我确认({confirmItems.length})
                  </h2>
                  <span className="text-[12px] text-[#9CA3AF]">
                    跨部门(机关↔机关)互派,需双方部门负责人确认后才下发
                  </span>
                </div>
                <div className="space-y-2">
                  {confirmItems.map((it) => (
                    <ConfirmRow
                      key={it.targetId}
                      item={it}
                      busy={confirm.isPending}
                      onView={() => setPeekItem(it)}
                      onApprove={() =>
                        confirm.mutate({ targetId: it.targetId, decision: "approve" })
                      }
                      onReject={() => {
                        const note = window.prompt("驳回原因(派发人会看到):");
                        if (note && note.trim())
                          confirm.mutate({
                            targetId: it.targetId,
                            decision: "reject",
                            note: note.trim(),
                          });
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
            {pending.length > 0 && (
              <Section
                title={`待接收(${pending.length})`}
                hint="「接收」=自己填报;「指派」=有指派权限者把任务交给本部门成员承办"
              >
                {pending.map((it) => (
                  <InboxRow
                    key={it.targetId}
                    item={it}
                    action={
                      <div className="flex items-center gap-2">
                        {it.canAssign && it.assignOrgId && (
                          <AssignPicker
                            orgId={it.assignOrgId}
                            orgName={it.assignOrgName}
                            busy={assign.isPending}
                            onPick={(userId) =>
                              assign.mutate({ targetId: it.targetId, userId })
                            }
                          />
                        )}
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
                      </div>
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
      {peekItem && (
        <ConfirmDrawer
          item={peekItem}
          busy={confirm.isPending}
          onClose={() => setPeekItem(null)}
          onConfirm={(decision, note) =>
            confirm.mutate({ targetId: peekItem.targetId, decision, note })
          }
        />
      )}
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

function ConfirmRow({
  item,
  busy,
  onView,
  onApprove,
  onReject,
}: {
  item: TaskConfirmQueueItem;
  busy: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  // 对方那一方是否已同意(我是收方 → 看发方;我是发方 → 看收方)
  const otherApproved = item.asReceiver
    ? item.senderConfirm === "approved"
    : item.receiverConfirm === "approved";
  return (
    <div className="rounded-xl border border-[#FED7AA] bg-[#FFFBF5] px-4 py-3 shadow-[0_6px_18px_rgba(28,42,68,0.04)]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onView}
          title="查看任务内容"
          className="text-[15px] font-bold text-[#172033] truncate text-left hover:text-[var(--party-primary)] hover:underline"
        >
          {item.title}
        </button>
        <span
          className="text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: "#FEF3C7", color: "#B45309" }}
        >
          {item.side === "receiver" ? "派给本部门" : "本部门派出"}
        </span>
      </div>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px] text-[#667085]">
        <span className="inline-flex items-center gap-1">
          <Building2Icon className="w-3.5 h-3.5" />
          {item.dispatchOrgName ?? "—"} → {item.targetOrgName ?? "—"}
        </span>
        {item.dispatchUserName && <span>派发人 {item.dispatchUserName}</span>}
        {item.dueAt && (
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="w-3.5 h-3.5" />截止 {item.dueAt.replace("T", " ").slice(0, 16)}
          </span>
        )}
        <span>{item.fieldCount} 个填报项</span>
        {otherApproved && <span className="text-[#047857] font-medium">对方已同意</span>}
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <button
          type="button"
          onClick={onView}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold border border-[#dce4ef] text-[#475467] bg-white hover:border-[var(--party-primary)] disabled:opacity-50"
        >
          <EyeIcon className="w-4 h-4" />查看任务
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "#059669" }}
        >
          <CheckIcon className="w-4 h-4" />同意下发
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold border border-[#FCA5A5] text-[#DC2626] bg-white disabled:opacity-50"
        >
          <XIcon className="w-4 h-4" />驳回
        </button>
      </div>
    </div>
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
          {item.handlerOrgName ? (
            <span>责任部门:{item.handlerOrgName}</span>
          ) : (
            item.claimable && <span className="text-[#0E7490]">全单位待认领</span>
          )}
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
