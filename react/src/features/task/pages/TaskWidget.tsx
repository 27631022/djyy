import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Lock,
  Unlock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CheckCircle2,
  Trophy,
  ExternalLink,
  Clock,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { SiteLogo } from "@/features/site-setting";
import {
  currentRanking,
  unitRankSeries,
  resolveUnitName,
  rankBarGradient,
  scoreBarPct,
  type RankedUnit,
} from "@/shared/lib/ranking-demo";
import { cn } from "@/shared/lib/utils";
import { isDesktop, setWidgetLocked, openExternal } from "@/shared/lib/desktop";
import { taskApi, TASK_TARGET_STATUS_LABEL, type TaskInboxItem } from "../api";
import { useDesktopInboxAlerts } from "../useDesktopInboxAlerts";

/* ── 日期小工具(本地时区,不引日期库)── */
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function parseDueKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateKey(d);
}
function dueTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** 数据最近一次成功刷新的时间(react-query dataUpdatedAt,毫秒)。 */
function fmtUpdated(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** Monday-start 月格,返回 7 的倍数个格子(空位为 null)。 */
function buildMonth(year: number, month: number): (number | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
const TABS = [
  ["tasks", "任务"],
  ["ranking", "党建考核排名"],
] as const;
const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  submitted: "bg-indigo-100 text-indigo-700",
  returned: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
};

/** 桌面任务小组件:身份 + 计数 + 月历(待落实气泡)+ 选中日待办。透明卡片,挂件窗口里融入壁纸。 */
export default function TaskWidget() {
  const { me } = useAuth();
  const desktop = isDesktop();
  useDesktopInboxAlerts(!!me);

  const today = new Date();
  const todayKey = dateKey(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [locked, setLocked] = useState(false);
  const [tab, setTab] = useState<"tasks" | "ranking">("tasks");

  const inboxQ = useQuery({
    queryKey: ["task", "inbox"],
    queryFn: () => taskApi.inbox(),
    refetchInterval: 90_000,
  });
  const statsQ = useQuery({
    queryKey: ["task", "my-stats"],
    queryFn: () => taskApi.myStats(),
    refetchInterval: 90_000,
  });

  const byDate = useMemo(() => {
    const m = new Map<string, TaskInboxItem[]>();
    for (const it of inboxQ.data ?? []) {
      const k = parseDueKey(it.dueAt);
      if (!k) continue;
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return m;
  }, [inboxQ.data]);

  const undatedCount = useMemo(
    () => (inboxQ.data ?? []).filter((i) => !parseDueKey(i.dueAt) && i.status !== "done").length,
    [inboxQ.data],
  );

  const stats = statsQ.data;
  const pendingBadge = stats?.pendingCount ?? 0;
  const lastUpdated = Math.max(inboxQ.dataUpdatedAt, statsQ.dataUpdatedAt);
  const position =
    me?.memberships?.admin?.find((m) => m.isPrimary)?.position ??
    me?.memberships?.admin?.[0]?.position ??
    null;
  const personLine =
    [me?.name, me?.username, position].filter(Boolean).join(" · ") || "未登录";
  const myUnit = resolveUnitName(
    (me?.memberships?.admin ?? []).map((m) => m.org?.name ?? "").filter(Boolean),
  );
  const cells = buildMonth(viewYear, viewMonth);
  const selectedTodos = byDate.get(selected) ?? [];

  function shiftMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }
  async function toggleLock() {
    const next = !locked;
    setLocked(next);
    await setWidgetLocked(next);
  }
  function openTask(it: TaskInboxItem) {
    const path = it.isOwner ? `/admin/tasks/fill/${it.targetId}` : `/admin/tasks/inbox`;
    openExternal(`${window.location.origin}${path}`);
  }
  function refresh() {
    void inboxQ.refetch();
    void statsQ.refetch();
  }

  return (
    <div
      data-widget-root
      className="min-h-screen w-full flex justify-center bg-transparent p-3 select-none"
    >
      <div
        className="w-full max-w-[380px] flex flex-col gap-3 rounded-2xl border border-white/60 p-4 shadow-xl backdrop-blur-xl transition-[background]"
        style={{
          background: locked
            ? "linear-gradient(135deg, rgba(255,255,255,0.60), rgba(255,228,230,0.52))"
            : "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,228,230,0.82))",
        }}
      >
        {/* ── 顶栏:身份(左)+ 刷新/锁(右)── */}
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          {me?.avatarUrl ? (
            <img
              src={me.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover shadow-sm"
              draggable={false}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--party-primary)] text-base font-semibold text-white shadow-sm">
              {me?.name?.[0] ?? "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-slate-800">党建益友桌面端</div>
            <div className="truncate text-xs text-slate-500">{personLine}</div>
          </div>
          <button
            onClick={refresh}
            title="刷新"
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (inboxQ.isFetching || statsQ.isFetching) && "animate-spin")} />
          </button>
          <button
            onClick={toggleLock}
            title={desktop ? (locked ? "解锁:从桌面层唤回" : "锁定:沉入桌面融入壁纸") : "锁定(桌面客户端里生效)"}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-lg",
              locked
                ? "bg-[var(--party-primary)] text-white"
                : "text-slate-500 hover:bg-slate-100",
            )}
          >
            {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ── Tab 切换:任务 / 党建考核排名 ── */}
        <div className="flex gap-1 rounded-lg bg-slate-100/70 p-0.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "bg-white text-[var(--party-primary)] shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "tasks" && (
          <>
        {/* ── 计数行 ── */}
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Inbox className="h-4 w-4" />} label="待领取" value={stats?.toClaimCount} tone="amber" />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="已完成" value={stats?.doneThisYear} tone="green" />
          <Stat icon={<Trophy className="h-4 w-4" />} label="累计完成" value={stats?.cumulativeDone} tone="slate" />
        </div>

        {/* ── 月历 ── */}
        <div className="rounded-xl bg-white/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => shiftMonth(-1)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              {viewYear} 年 {viewMonth + 1} 月
              {pendingBadge > 0 && (
                <span
                  title="待落实"
                  className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--party-primary)] px-1.5 text-xs font-semibold text-white"
                >
                  {pendingBadge}
                </span>
              )}
            </div>
            <button onClick={() => shiftMonth(1)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
            {WEEK.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              const key = day ? `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}` : null;
              const count = key ? byDate.get(key)?.length ?? 0 : 0;
              const isToday = key === todayKey;
              const isSel = key === selected;
              return (
                <button
                  key={key ?? `b${i}`}
                  disabled={!day}
                  onClick={() => key && setSelected(key)}
                  className={cn(
                    "relative h-9 rounded-md text-sm",
                    !day && "invisible",
                    isSel
                      ? "bg-[var(--party-primary)] font-semibold text-white"
                      : isToday
                        ? "bg-party-soft font-semibold text-[var(--party-primary)]"
                        : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {day}
                  {count > 0 && (
                    <span
                      className={cn(
                        "absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full",
                        isSel ? "bg-white" : "bg-[var(--party-accent)]",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 选中日待办 ── */}
        <div className="flex flex-col gap-2">
          <div className="px-1 text-xs font-medium text-slate-500">
            {selected === todayKey ? "今日待办" : `${selected} 待办`}
            <span className="ml-1 text-slate-400">({selectedTodos.length})</span>
          </div>
          {inboxQ.isLoading ? (
            <div className="px-1 py-4 text-center text-xs text-slate-400">加载中…</div>
          ) : selectedTodos.length === 0 ? (
            <div className="rounded-lg bg-white/60 px-3 py-5 text-center text-xs text-slate-400">这一天没有待办</div>
          ) : (
            selectedTodos.map((it) => (
              <button
                key={it.targetId}
                onClick={() => openTask(it)}
                className="group flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-left hover:bg-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">{it.title}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_CHIP[it.status] ?? "bg-slate-100 text-slate-600")}>
                      {it.claimable ? "待接收" : TASK_TARGET_STATUS_LABEL[it.status] ?? it.status}
                    </span>
                    {dueTime(it.dueAt) && <span className="text-[11px] text-slate-400">截止 {dueTime(it.dueAt)}</span>}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[var(--party-primary)]" />
              </button>
            ))
          )}
          {undatedCount > 0 && (
            <button
              onClick={() => openExternal(`${window.location.origin}/admin/tasks/inbox`)}
              className="px-1 text-left text-[11px] text-slate-400 hover:text-[var(--party-primary)]"
            >
              另有 {undatedCount} 项无截止日期待办 →
            </button>
          )}
        </div>
          </>
        )}
        {tab === "ranking" && <RankingPanel unitName={myUnit.name} matched={myUnit.matched} />}

        {/* ── 底栏:品牌标志(左)+ 最近更新(右),同一排 ── */}
        <div className="flex items-center justify-between pt-0.5 text-slate-400">
          <div className="flex items-center gap-1.5 opacity-60">
            <SiteLogo className="h-4 w-4" />
            <span className="text-[11px] font-medium tracking-wide">党建益友</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <Clock className="h-2.5 w-2.5" />
            最近更新 {fmtUpdated(lastUpdated)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 折线图:某单位近 4 年考核排名(rank 1 在顶部,数字越小越靠前)。 */
function RankTrendChart({ series, count }: { series: { year: number; rank: number }[]; count: number }) {
  const W = 320;
  const H = 100;
  const padX = 24;
  const padTop = 16;
  const padBottom = 18;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = series.length;
  const x = (i: number) => padX + (n <= 1 ? 0 : (innerW * i) / (n - 1));
  const y = (rank: number) => padTop + (count <= 1 ? 0 : (innerH * (rank - 1)) / (count - 1));
  const pts = series.map((s, i) => `${x(i)},${y(s.rank)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
      <polyline points={pts} fill="none" stroke="var(--party-primary)" strokeWidth={2} strokeLinejoin="round" />
      {series.map((s, i) => (
        <g key={s.year}>
          <circle cx={x(i)} cy={y(s.rank)} r={3.5} fill="var(--party-primary)" />
          <text x={x(i)} y={y(s.rank) - 7} textAnchor="middle" fontSize={10} fontWeight={600} fill="#475569">
            {s.rank}
          </text>
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {s.year}
          </text>
        </g>
      ))}
    </svg>
  );
}

function medalBackground(rank: number): string | null {
  if (rank === 1) return "linear-gradient(135deg,#F5A623,#E8700A)";
  if (rank === 2) return "linear-gradient(135deg,#C0C0C0,#A8A8A8)";
  if (rank === 3) return "linear-gradient(135deg,#CD7F32,#A0522D)";
  return null;
}

/** 排行榜单行(前 3 名金/银/铜;highlight=本单位则框选高亮)。 */
function RankRow({ u, highlight }: { u: RankedUnit; highlight: boolean }) {
  const medal = medalBackground(u.rank);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5",
        highlight ? "bg-party-soft ring-1 ring-[var(--party-primary)]" : "bg-white/70",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-xs font-bold",
          medal ? "text-white shadow-sm" : "bg-slate-100 text-slate-500",
        )}
        style={medal ? { background: medal } : undefined}
      >
        {u.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-slate-700">
          {u.name}
          {highlight && <span className="text-[var(--party-primary)]"> · 我单位</span>}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div
            className="h-full rounded-full"
            style={{ width: `${scoreBarPct(u.score)}%`, background: rankBarGradient(u.rank) }}
          />
        </div>
      </div>
      <span className="flex-shrink-0 text-sm font-bold text-[var(--party-primary)]">{u.score}</span>
    </div>
  );
}

/** 党建考核排名 Tab:近 4 年排名折线图 + 前 5 名 + 本单位上下 2 名(框选本单位 + 升档提示)。 */
function RankingPanel({ unitName, matched }: { unitName: string; matched: boolean }) {
  const ranking = currentRanking();
  const count = ranking.length;
  const mine = ranking.find((u) => u.name === unitName);
  const myRank = mine?.rank ?? count;
  const top5 = ranking.slice(0, 5);
  const windowRows = ranking.filter((u) => u.rank >= myRank - 2 && u.rank <= myRank + 2);
  const higher = ranking.find((u) => u.rank === myRank - 1);
  const gap = higher && mine ? Math.round((higher.score - mine.score) * 10) / 10 : null;
  const series = unitRankSeries(unitName);

  return (
    <div className="flex flex-col gap-2.5">
      {/* 近 4 年排名折线图 */}
      <div className="rounded-xl bg-white/70 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-slate-600">{unitName} · 近4年考核排名</span>
          <span className="flex-shrink-0 text-[10px] text-slate-400">
            {matched ? `当前第 ${myRank} 名` : "演示·非本单位"}
          </span>
        </div>
        <RankTrendChart series={series} count={count} />
      </div>

      {/* 前 5 名 */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-xs font-medium text-slate-500">前 5 名</div>
        {top5.map((u) => (
          <RankRow key={u.rank} u={u} highlight={u.name === unitName} />
        ))}
      </div>

      {/* 本单位上下文 + 升档提示 */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-xs font-medium text-slate-500">我单位排名(第 {myRank} 名)</div>
        {windowRows.map((u) => (
          <RankRow key={u.rank} u={u} highlight={u.name === unitName} />
        ))}
        {gap !== null && gap > 0 ? (
          <div className="px-1 text-[11px] text-[var(--party-primary)]">
            再加 {gap} 分即可超过「{higher?.name}」升至第 {myRank - 1} 名
          </div>
        ) : myRank === 1 ? (
          <div className="px-1 text-[11px] text-amber-600">已位列第 1 名 🎉</div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  tone: "amber" | "green" | "slate";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600"
      : tone === "green"
        ? "text-green-600"
        : "text-slate-600";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-white/70 py-3">
      <span className={cn("flex items-center gap-1 text-xs", toneCls)}>
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}
