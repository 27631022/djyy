import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  Unlock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Inbox,
  ClipboardList,
  CheckCircle2,
  ExternalLink,
  Clock,
  LogOut,
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
import {
  isDesktop,
  getAppVersion,
  setWidgetLocked,
  setClientMode,
  startWidgetDrag,
  openExternal,
  saveWidgetPos,
  restoreWidgetPos,
} from "@/shared/lib/desktop";
import {
  taskApi,
  taskApiErrorMessage,
  TASK_TARGET_STATUS_LABEL,
  type TaskInboxItem,
  type TaskCompletedItem,
} from "../api";
import { useDesktopInboxAlerts } from "../useDesktopInboxAlerts";
import { toast } from "sonner";

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
/** 取某天所在周的周一(Monday-start)。 */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
/** "6月8日 周一" */
function dayHeading(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[(d.getDay() + 6) % 7]}`;
}

const TABS = [
  ["tasks", "任务"],
  ["ranking", "党建考核排名"],
] as const;
/** 日历视图档位:周(默认,最矮、给任务流最大空间)/ 半月 / 整月 */
const CAL_MODES = [
  ["week", "周"],
  ["half", "半月"],
  ["month", "月"],
] as const;
type CalMode = (typeof CAL_MODES)[number][0];
/** 计数详情视图:null=日历 / claim=待领任务 / fill=待填报 / done=本年已完成 */
type StatView = null | "claim" | "fill" | "done";

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  submitted: "bg-indigo-100 text-indigo-700",
  returned: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
};

/** 待办按截止时间升序(无截止排最后)。 */
function byDue(a: TaskInboxItem, b: TaskInboxItem): number {
  const ta = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}

/**
 * 桌面任务小组件:身份 + 计数(待完成/已完成/累计)+ 日历(周/半月/月)+ 任务流。
 * 透明卡片融入壁纸;**窗口固定高度,仅列表区内部滚动**(无窗口级滚动条,见 desktop/README.md)。
 */
export default function TaskWidget() {
  const { me, login, logout } = useAuth();
  const desktop = isDesktop();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDesktopInboxAlerts(!!me);

  const today = new Date();
  const todayKey = dateKey(today);
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [calMode, setCalMode] = useState<CalMode>("week");
  const [selected, setSelected] = useState(todayKey);
  const [statView, setStatView] = useState<StatView>(null);
  const [locked, setLocked] = useState(false);
  const [tab, setTab] = useState<"tasks" | "ranking">("tasks");
  const [appVersion, setAppVersion] = useState<string | null>(null);

  // 桌面挂件:让 html/body 透明,露出壁纸(配合无边框 + 锁定沉入桌面)。浏览器里不动。
  useEffect(() => {
    if (!desktop) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = "transparent";
    body.style.background = "transparent";
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, [desktop]);

  // 客户端版本号(底栏显示,便于确认当前版本 / 更新后变化)
  useEffect(() => {
    if (desktop) void getAppVersion().then(setAppVersion);
  }, [desktop]);

  // 记住挂件位置(存 localStorage,跨更新/重启不丢):挂载时复位 + 每 4s 保存当前位置。
  useEffect(() => {
    if (!desktop) return;
    void restoreWidgetPos();
    const id = setInterval(() => void saveWidgetPos(), 4000);
    return () => clearInterval(id);
  }, [desktop]);

  const inboxQ = useQuery({
    queryKey: ["task", "inbox"],
    queryFn: () => taskApi.inbox(),
    enabled: !!me,
    refetchInterval: 90_000,
  });
  const statsQ = useQuery({
    queryKey: ["task", "my-stats"],
    queryFn: () => taskApi.myStats(),
    enabled: !!me,
    refetchInterval: 90_000,
  });
  const completedQ = useQuery({
    queryKey: ["task", "my-completed", "year"],
    queryFn: () => taskApi.myCompleted("year"),
    enabled: !!me && statView === "done",
  });
  const claimMut = useMutation({
    mutationFn: (targetId: string) => taskApi.claim(targetId),
    onSuccess: (_r, targetId) => {
      void qc.invalidateQueries({ queryKey: ["task", "inbox"] });
      void qc.invalidateQueries({ queryKey: ["task", "my-stats"] });
      goFill(targetId); // 接收成功 → 直接展开填报
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "接收失败")),
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

  // 三个计数都从 inbox 派生,保证「计数 = 点开后的清单」一致:
  //   待领任务 = 可接收未认领(claimable);待填报 = 我负责、未提交未完成(需我填报)。已完成走 my-stats / my-completed。
  const claimList = useMemo(
    () => (inboxQ.data ?? []).filter((i) => i.claimable).sort(byDue),
    [inboxQ.data],
  );
  const fillList = useMemo(
    () =>
      (inboxQ.data ?? [])
        .filter((i) => i.isOwner && i.status !== "submitted" && i.status !== "done")
        .sort(byDue),
    [inboxQ.data],
  );
  const claimCount = claimList.length;
  const fillCount = fillList.length;
  const actionableCount = claimCount + fillCount;
  const undatedCount = useMemo(
    () => (inboxQ.data ?? []).filter((i) => !parseDueKey(i.dueAt) && i.status !== "done").length,
    [inboxQ.data],
  );

  const stats = statsQ.data;
  const lastUpdated = Math.max(inboxQ.dataUpdatedAt, statsQ.dataUpdatedAt);
  const position =
    me?.memberships?.admin?.find((m) => m.isPrimary)?.position ??
    me?.memberships?.admin?.[0]?.position ??
    null;
  const personLine = [me?.name, me?.username, position].filter(Boolean).join(" · ") || "未登录";
  const myUnit = resolveUnitName(
    (me?.memberships?.admin ?? []).map((m) => m.org?.name ?? "").filter(Boolean),
  );

  // 日历格子:周/半月 = 从周一起的连续日期;整月 = 月格(含前置空位)。
  const weekStart = startOfWeek(anchor);
  const span = calMode === "half" ? 14 : 7;
  const weekDates = Array.from({ length: span }, (_, i) => addDays(weekStart, i));
  const monthCells = buildMonth(anchor.getFullYear(), anchor.getMonth());
  const weekEnd = addDays(weekStart, span - 1);
  const rangeLabel =
    calMode === "month"
      ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
      : `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;

  // 周视图:一次性铺开本周(7 天)按天分组的任务流;半月/整月:点选某天看当天。
  const weekFlow = weekDates.map((d) => ({ date: d, items: byDate.get(dateKey(d)) ?? [] }));
  const weekHasAny = weekFlow.some((g) => g.items.length > 0);
  const selectedTodos = byDate.get(selected) ?? [];

  function shiftRange(dir: number) {
    setAnchor((a) => (calMode === "month" ? addMonths(a, dir) : addDays(a, dir * span)));
  }
  async function toggleLock() {
    const next = !locked;
    setLocked(next);
    try {
      await setWidgetLocked(next);
    } catch (e) {
      setLocked(!next); // 失败回退视觉
      toast.error("锁定失败:" + (e instanceof Error ? e.message : String(e)));
    }
  }
  // 点任务:桌面端「展开成工作台」内领/填(不开浏览器);浏览器里走外开后台页兜底。
  function goFill(targetId: string) {
    if (desktop) {
      void setClientMode("workbench");
      navigate(`/w/fill/${targetId}`);
    } else {
      openExternal(`${window.location.origin}/admin/tasks/fill/${targetId}`);
    }
  }
  function onRowOpen(it: TaskInboxItem) {
    if (it.isOwner) goFill(it.targetId);
    else if (it.claimable) claimMut.mutate(it.targetId); // 待领 → 接收后自动展开填报
    else openExternal(`${window.location.origin}/admin/tasks/inbox`);
  }
  function toggleStat(v: Exclude<StatView, null>) {
    setStatView((cur) => (cur === v ? null : v));
  }
  function refresh() {
    void inboxQ.refetch();
    void statsQ.refetch();
    if (statView === "done") void completedQ.refetch();
  }

  return (
    <div
      data-widget-root
      className="flex h-screen w-full justify-center overflow-hidden bg-transparent p-3 select-none"
    >
      <div
        className="flex w-full max-w-[380px] flex-col gap-3 overflow-hidden rounded-2xl border border-white/60 p-4 shadow-xl backdrop-blur-xl transition-[background]"
        style={{
          background: locked
            ? "linear-gradient(135deg, rgba(255,255,255,0.60), rgba(255,228,230,0.52))"
            : "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,228,230,0.82))",
        }}
      >
        {me === undefined ? (
          <div
            onMouseDown={(e) => {
              if (e.button === 0) void startWidgetDrag();
            }}
            className="flex flex-1 items-center justify-center py-12 text-sm text-slate-500"
          >
            加载中…
          </div>
        ) : !me ? (
          <WidgetLogin login={login} />
        ) : (
          <>
            {/* ── 顶栏:身份(左)+ 刷新/锁(右);解锁态按住拖动整窗 ── */}
            <div
              onMouseDown={(e) => {
                if (!locked && e.button === 0 && !(e.target as HTMLElement).closest("button")) {
                  void startWidgetDrag();
                }
              }}
              className="flex shrink-0 items-center gap-2.5"
            >
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
                title={
                  desktop
                    ? locked
                      ? "已固定到桌面(点击解锁,可拖动)"
                      : "可拖动浮窗(点击固定到桌面)"
                    : "固定到桌面(桌面客户端里生效)"
                }
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-lg",
                  locked
                    ? "bg-slate-200 text-slate-500 hover:bg-slate-300" // 锁死=灰
                    : "bg-green-100 text-green-600 hover:bg-green-200", // 打开=绿(可移动)
                )}
              >
                {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* ── Tab 切换:任务 / 党建考核排名 ── */}
            <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100/70 p-0.5">
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
                {/* ── 计数行(可点,点开即看相应清单,无需打开网页)── */}
                <div className="grid shrink-0 grid-cols-3 gap-2">
                  <Stat
                    icon={<Inbox className="h-4 w-4" />}
                    label="待领任务"
                    value={claimCount}
                    tone="amber"
                    active={statView === "claim"}
                    onClick={() => toggleStat("claim")}
                  />
                  <Stat
                    icon={<ClipboardList className="h-4 w-4" />}
                    label="待填报"
                    value={fillCount}
                    tone="blue"
                    active={statView === "fill"}
                    onClick={() => toggleStat("fill")}
                  />
                  <Stat
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="已完成"
                    value={stats?.doneThisYear}
                    tone="green"
                    active={statView === "done"}
                    onClick={() => toggleStat("done")}
                  />
                </div>

                {statView === null ? (
                  <>
                    {/* ── 日历(固定高度;周/半月/月切换)── */}
                    <div className="shrink-0 rounded-xl bg-white/70 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <button
                          onClick={() => shiftRange(-1)}
                          className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          {rangeLabel}
                          {actionableCount > 0 && (
                            <span
                              title="待处理(待领 + 待填报)"
                              className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--party-primary)] px-1.5 text-xs font-semibold text-white"
                            >
                              {actionableCount}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => shiftRange(1)}
                          className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      {/* 档位切换 */}
                      <div className="mb-2 flex gap-1 rounded-lg bg-slate-100/70 p-0.5">
                        {CAL_MODES.map(([m, label]) => (
                          <button
                            key={m}
                            onClick={() => setCalMode(m)}
                            className={cn(
                              "flex-1 rounded-md py-1 text-[11px] transition-colors",
                              calMode === m
                                ? "bg-white font-semibold text-[var(--party-primary)] shadow-sm"
                                : "text-slate-500 hover:text-slate-700",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
                        {WEEK.map((w) => (
                          <div key={w} className="py-1">{w}</div>
                        ))}
                      </div>
                      {calMode === "month" ? (
                        <div className="grid grid-cols-7 gap-1">
                          {monthCells.map((day, i) => {
                            const key = day
                              ? `${anchor.getFullYear()}-${pad2(anchor.getMonth() + 1)}-${pad2(day)}`
                              : null;
                            const count = key ? byDate.get(key)?.length ?? 0 : 0;
                            return (
                              <CalCell
                                key={key ?? `b${i}`}
                                label={day}
                                count={count}
                                isToday={key === todayKey}
                                isSel={key === selected}
                                onClick={() => key && setSelected(key)}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid grid-cols-7 gap-1">
                          {weekDates.map((d) => {
                            const key = dateKey(d);
                            return (
                              <CalCell
                                key={key}
                                label={d.getDate()}
                                count={byDate.get(key)?.length ?? 0}
                                isToday={key === todayKey}
                                isSel={key === selected}
                                onClick={() => setSelected(key)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ── 任务流(唯一滚动区:周视图铺开整周 / 半月·整月看选中日)── */}
                    <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                      {calMode === "week" ? (
                        inboxQ.isLoading ? (
                          <Loading />
                        ) : !weekHasAny ? (
                          <Empty text="本周没有带日期的待办" />
                        ) : (
                          weekFlow
                            .filter((g) => g.items.length > 0)
                            .map((g) => (
                              <div key={dateKey(g.date)} className="flex flex-col gap-1.5">
                                <div className="px-1 text-xs font-medium text-slate-500">
                                  {dayHeading(g.date)}
                                  <span className="ml-1 text-slate-400">({g.items.length})</span>
                                </div>
                                {g.items.map((it) => (
                                  <TaskRow key={it.targetId} it={it} onOpen={() => onRowOpen(it)} />
                                ))}
                              </div>
                            ))
                        )
                      ) : (
                        <>
                          <div className="px-1 text-xs font-medium text-slate-500">
                            {selected === todayKey ? "今日待办" : `${selected} 待办`}
                            <span className="ml-1 text-slate-400">({selectedTodos.length})</span>
                          </div>
                          {inboxQ.isLoading ? (
                            <Loading />
                          ) : selectedTodos.length === 0 ? (
                            <Empty text="这一天没有待办" />
                          ) : (
                            selectedTodos.map((it) => (
                              <TaskRow key={it.targetId} it={it} onOpen={() => onRowOpen(it)} />
                            ))
                          )}
                        </>
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
                ) : (
                  <>
                    {/* ── 计数详情(挂件内直显,点 ← 返回日历)── */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => setStatView(null)}
                        title="返回日历"
                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div className="text-sm font-medium text-slate-700">
                        {statView === "claim" ? "待领任务" : statView === "fill" ? "待填报" : "本年已完成"}
                      </div>
                      <span className="text-xs text-slate-400">
                        ({statView === "claim" ? claimCount : statView === "fill" ? fillCount : completedQ.data?.length ?? 0})
                      </span>
                    </div>
                    <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                      {statView === "claim" ? (
                        claimList.length === 0 ? (
                          <Empty text="没有待领的任务" />
                        ) : (
                          claimList.map((it) => (
                            <TaskRow key={it.targetId} it={it} onOpen={() => onRowOpen(it)} />
                          ))
                        )
                      ) : statView === "fill" ? (
                        fillList.length === 0 ? (
                          <Empty text="没有待填报的任务 🎉" />
                        ) : (
                          fillList.map((it) => (
                            <TaskRow key={it.targetId} it={it} onOpen={() => onRowOpen(it)} />
                          ))
                        )
                      ) : completedQ.isLoading ? (
                        <Loading />
                      ) : (completedQ.data ?? []).length === 0 ? (
                        <Empty text="本年还没有已完成任务" />
                      ) : (
                        (completedQ.data ?? []).map((it) => (
                          <CompletedRow
                            key={it.targetId}
                            it={it}
                            onOpen={() => goFill(it.targetId)}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "ranking" && (
              <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
                <RankingPanel unitName={myUnit.name} matched={myUnit.matched} />
              </div>
            )}

            {/* ── 底栏:品牌标志(左)+ 更新时间 + 退出登录(右)── */}
            <div className="flex shrink-0 items-center justify-between pt-0.5 text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5 opacity-60">
                <SiteLogo className="h-4 w-4" />
                <span className="text-[11px] font-medium tracking-wide">
                  党建益友{appVersion ? ` v${appVersion}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1" title="最近更新">
                  <Clock className="h-2.5 w-2.5" />
                  {fmtUpdated(lastUpdated)}
                </span>
                <button
                  onClick={logout}
                  title="退出登录"
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-slate-100 hover:text-[var(--party-primary)]"
                >
                  <LogOut className="h-3 w-3" />
                  退出登录
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 月历 / 周历单格(日期 + 当天任务圆点)。 */
function CalCell({
  label,
  count,
  isToday,
  isSel,
  onClick,
}: {
  label: number | null;
  count: number;
  isToday: boolean;
  isSel: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={label == null}
      onClick={onClick}
      className={cn(
        "relative h-9 rounded-md text-sm",
        label == null && "invisible",
        isSel
          ? "bg-[var(--party-primary)] font-semibold text-white"
          : isToday
            ? "bg-party-soft font-semibold text-[var(--party-primary)]"
            : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {label}
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
}

/** 待办行(任务流 / 待完成清单复用):标题 + 状态 + 截止时间,点开完整版。 */
function TaskRow({ it, onOpen }: { it: TaskInboxItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
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
      {it.claimable ? (
        <span className="shrink-0 rounded-md bg-[var(--party-primary)] px-2 py-1 text-[11px] font-medium text-white">
          接收
        </span>
      ) : (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[var(--party-primary)]" />
      )}
    </button>
  );
}

/** 已完成行(已完成 / 累计完成清单):标题 + 完成时间,点开查看回执。 */
function CompletedRow({ it, onOpen }: { it: TaskCompletedItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-left hover:bg-white"
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-800">{it.title}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {it.completedAt ? `完成于 ${fmtUpdated(new Date(it.completedAt).getTime())}` : "已完成"}
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[var(--party-primary)]" />
    </button>
  );
}

function Loading() {
  return <div className="px-1 py-4 text-center text-xs text-slate-400">加载中…</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-lg bg-white/60 px-3 py-5 text-center text-xs text-slate-400">{text}</div>;
}

/** 紧凑登录(挂件未登录时):透明圆角壳内的员工编号登录。Casdoor 上线后替换。 */
function WidgetLogin({ login }: { login: (username: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const u = username.trim();
    if (!u) {
      setErr("请输入员工编号");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await login(u);
    } catch {
      setErr("登录失败,请检查员工编号");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
      <div
        onMouseDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest("button,input")) void startWidgetDrag();
        }}
        className="flex flex-col items-center gap-2"
      >
        <SiteLogo className="h-14 w-14" />
        <div className="text-center">
          <div className="text-base font-semibold text-slate-800">党建益友桌面端</div>
          <div className="text-xs text-slate-500">登录查看你的任务与考核</div>
        </div>
      </div>
      <input
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setErr(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="员工编号(如 admin)"
        className="h-10 w-full rounded-lg border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-[var(--party-primary)]"
      />
      {err && <div className="-mt-2 self-start text-xs text-[var(--party-primary)]">{err}</div>}
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="h-10 w-full rounded-lg bg-[var(--party-primary)] text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {busy ? "登录中…" : "登 录"}
      </button>
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
  const top3 = ranking.slice(0, 3);
  const windowRows = ranking.filter((u) => u.rank >= myRank - 1 && u.rank <= myRank + 1);
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

      {/* 前 3 名 */}
      <div className="flex flex-col gap-1.5">
        <div className="px-1 text-xs font-medium text-slate-500">前 3 名</div>
        {top3.map((u) => (
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
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  tone: "amber" | "green" | "slate" | "blue";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600"
      : tone === "green"
        ? "text-green-600"
        : tone === "blue"
          ? "text-blue-600"
          : "text-slate-600";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl py-3 transition-colors",
        active ? "bg-white ring-1 ring-[var(--party-primary)]" : "bg-white/70 hover:bg-white",
      )}
    >
      <span className={cn("flex items-center gap-1 text-xs", toneCls)}>
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold text-slate-800">{value ?? "—"}</span>
    </button>
  );
}
