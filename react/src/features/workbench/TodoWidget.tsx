import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { InboxIcon, ChevronRightIcon, ClockIcon, AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { taskApi, type TaskInboxItem } from "@/features/task";
import type { WbCardSize } from "./wbLayout";

const PARTY = "var(--party-primary)";

/* dueAt → 紧迫度文案 */
function dueText(dueAt: string | null): { text: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const d = new Date(dueAt).getTime();
  if (!Number.isFinite(d)) return null;
  const days = Math.ceil((d - Date.now()) / 86_400_000);
  if (days < 0) return { text: `逾期 ${-days} 天`, overdue: true };
  if (days === 0) return { text: "今天截止", overdue: true };
  if (days === 1) return { text: "明天截止", overdue: false };
  return { text: `剩 ${days} 天`, overdue: false };
}

function DueChip({ dueAt }: { dueAt: string | null }) {
  const d = dueText(dueAt);
  if (!d) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
        d.overdue ? "bg-red-50 text-red-600" : "bg-[#eef2f9] text-[#667085]"
      }`}
    >
      <ClockIcon className="w-2.5 h-2.5" />
      {d.text}
    </span>
  );
}

/* 一条待办行 */
function TodoRow({ item, onClick }: { item: TaskInboxItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-[8px_1fr_auto] items-center gap-2.5 py-1.5 px-1 -mx-1 rounded-lg hover:bg-white/70 text-left transition-colors"
    >
      <span className="w-2 h-7 rounded-full" style={{ background: item.claimable ? PARTY : "#246BFE" }} />
      <span className="min-w-0">
        <span className="block text-[13px] text-[#172033] font-semibold truncate">{item.title}</span>
        <span className="block text-[11px] text-[#667085] truncate">
          {item.dispatchOrgName ?? "—"}
          {item.claimable ? " · 待接收" : " · 待落实"}
        </span>
      </span>
      <DueChip dueAt={item.dueAt} />
    </button>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-[#9CA3AF] gap-1.5">
      <CheckCircle2Icon className={compact ? "w-7 h-7" : "w-10 h-10"} style={{ color: "#22c55e", opacity: 0.7 }} />
      <span className="text-[12px]">暂无待办,都处理完啦</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2 pt-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 rounded-lg bg-[#eef2f9] animate-pulse" />
      ))}
    </div>
  );
}

/**
 * 「待办」服务卡片 —— 首个真数据多尺寸卡。数据=任务接收待办(taskApi.inbox)。
 * 三套固定尺寸各自独立排版:小(2x2 概览)/ 中(4x2 概览+前3条)/ 大(4x4 完整清单)。
 */
export function TodoWidget({ size }: { size: WbCardSize }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["workbench", "inbox"],
    queryFn: () => taskApi.inbox(),
    staleTime: 60_000,
  });
  const items = data ?? [];
  const count = items.length;
  const toClaim = items.filter((i) => i.claimable).length;
  const toDo = count - toClaim;
  const overdue = items.filter((i) => {
    const d = dueText(i.dueAt);
    return d?.overdue;
  }).length;
  const goInbox = () => navigate("/admin/tasks/inbox");

  /* ── 小 2x2:概览(大数字 + 一行要点)── */
  if (size === "2x2") {
    return (
      <button onClick={goInbox} className="h-full w-full flex flex-col text-left">
        {isLoading ? (
          <div className="flex-1 grid place-items-center">
            <div className="w-16 h-9 rounded-lg bg-[#eef2f9] animate-pulse" />
          </div>
        ) : count === 0 ? (
          <EmptyState compact />
        ) : (
          <>
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex items-end gap-1.5">
                <span className="text-[40px] leading-none font-black" style={{ color: PARTY }}>
                  {count}
                </span>
                <span className="text-[13px] text-[#667085] mb-1">项待办</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toClaim > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-party-soft" style={{ color: PARTY }}>
                    {toClaim} 待接收
                  </span>
                )}
                {overdue > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600">
                    {overdue} 逾期
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 text-[11px] text-[#9CA3AF] mt-1">
              查看全部 <ChevronRightIcon className="w-3 h-3" />
            </div>
          </>
        )}
      </button>
    );
  }

  /* ── 大 4x4:完整清单 ── */
  if (size === "4x4") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-[#eef2f9]">
          <span className="text-[28px] leading-none font-black" style={{ color: PARTY }}>
            {count}
          </span>
          <span className="text-[13px] text-[#667085]">项待我处理</span>
          <div className="flex-1" />
          {toClaim > 0 && <Stat label="待接收" n={toClaim} color={PARTY} />}
          {toDo > 0 && <Stat label="待落实" n={toDo} color="#246BFE" />}
          {overdue > 0 && <Stat label="逾期" n={overdue} color="#dc2626" />}
        </div>
        {isLoading ? (
          <LoadingState />
        ) : count === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto -mx-1 px-1">
            {items.map((it) => (
              <TodoRow key={it.targetId} item={it} onClick={goInbox} />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── 中 4x2(默认):左概览 + 右前 3 条 ── */
  return (
    <div className="h-full grid grid-cols-[132px_1fr] gap-3">
      <button onClick={goInbox} className="flex flex-col justify-center text-left pr-3 border-r border-[#eef2f9]">
        <div className="flex items-end gap-1">
          <span className="text-[36px] leading-none font-black" style={{ color: PARTY }}>
            {count}
          </span>
          <span className="text-[12px] text-[#667085] mb-1">待办</span>
        </div>
        <div className="mt-2 space-y-1">
          {toClaim > 0 && <MiniStat label="待接收" n={toClaim} color={PARTY} />}
          {overdue > 0 && <MiniStat label="逾期" n={overdue} color="#dc2626" />}
          {toClaim === 0 && overdue === 0 && count > 0 && <span className="text-[11px] text-[#9CA3AF]">均在处理中</span>}
        </div>
      </button>
      <div className="min-w-0 flex flex-col justify-center">
        {isLoading ? (
          <LoadingState />
        ) : count === 0 ? (
          <EmptyState compact />
        ) : (
          items.slice(0, 3).map((it) => <TodoRow key={it.targetId} item={it} onClick={goInbox} />)
        )}
      </div>
    </div>
  );
}

function Stat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#667085]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
      <strong className="font-extrabold" style={{ color }}>
        {n}
      </strong>
    </span>
  );
}
function MiniStat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#667085]">
      {label === "逾期" ? (
        <AlertCircleIcon className="w-3 h-3" style={{ color }} />
      ) : (
        <InboxIcon className="w-3 h-3" style={{ color }} />
      )}
      <strong className="font-extrabold" style={{ color }}>
        {n}
      </strong>
      {label}
    </span>
  );
}
