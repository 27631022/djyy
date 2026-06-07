import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  Unlock,
  RefreshCw,
  Inbox,
  ClipboardList,
  CheckCircle2,
  Megaphone,
  ExternalLink,
  Clock,
  LogOut,
  Settings,
  Plus,
  X,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { SiteLogo } from "@/features/site-setting";
import { resolveAvatarUrl } from "@/features/avatar";
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
  hideWindow,
  openServerConfig,
} from "@/shared/lib/desktop";
import {
  taskApi,
  taskApiErrorMessage,
  TASK_STATUS_LABEL,
  dueInfo,
  dueToneStyle,
  type DueTone,
  type TaskInboxItem,
  type TaskListItem,
} from "../api";
import { useDesktopInboxAlerts } from "../useDesktopInboxAlerts";
import { toast } from "sonner";

/* ── 小工具(本地时区,不引日期库)── */
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
/** 数据最近一次成功刷新的时间(react-query dataUpdatedAt,毫秒)。 */
function fmtUpdated(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** 截止日期「6月15日」(无截止则空串)。 */
function dueDateLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}月${d.getDate()}日`;
}
/** 已完成行的「提前 N 天 / 逾期 N 天 / 按期」+ 配色(提报时间对照截止)。 */
function earlyLate(dueAt: string | null, submittedAt: string | null): { text: string; tone: DueTone } | null {
  if (!submittedAt) return null;
  const di = dueInfo(dueAt, submittedAt);
  if (!di) return null;
  const d = di.days; // 正 = 逾期天数,<=0 = 提前/按期
  const text = d > 0 ? `逾期 ${d} 天` : d < 0 ? `提前 ${-d} 天` : "按期";
  return { text, tone: di.tone };
}

const TABS = [
  ["tasks", "任务"],
  ["ranking", "党建考核排名"],
] as const;

/**
 * 任务分类标签 —— 语义色统一(标签图标色 + 任务行左色条 同一套):
 *   棕=待领取 / 蓝=待填报 / 红=被退回 / 绿=已报送(已提交·已通过)。
 * 任务管理=紫(次按钮,仅有 task:manage 权限者可见;里面是我发布的任务)。
 */
const CATS = [
  { key: "claim", label: "待领任务", color: "#b45309", Icon: Inbox },
  { key: "fill", label: "待填报", color: "#2563eb", Icon: ClipboardList },
  { key: "done", label: "已完成", color: "#059669", Icon: CheckCircle2 },
  { key: "manage", label: "任务管理", color: "#7c3aed", Icon: Megaphone },
] as const;
type Cat = (typeof CATS)[number]["key"];

/* ── 语义色(任务行左色条 + 状态)── */
const C_CLAIM = "#b45309"; // 棕:待领取
const C_FILL = "#2563eb"; // 蓝:待填报
const C_RETURNED = "#dc2626"; // 红:被退回
const C_DONE = "#059669"; // 绿:已报送/已完成
const C_MANAGE = "#7c3aed"; // 紫:任务管理(我发布的)

/** 任务行左色条颜色:按是否可领 / 状态判语义色。 */
function rowAccent(it: TaskInboxItem): string {
  if (it.claimable) return C_CLAIM;
  if (it.status === "returned") return C_RETURNED;
  if (it.status === "submitted" || it.status === "done") return C_DONE;
  return C_FILL; // assigned / in_progress = 待填报
}

/** 按截止时间升序(无截止排最后)—— 越快到期越靠前。待办行 / 我发布的任务通用。 */
function byDue(a: { dueAt: string | null }, b: { dueAt: string | null }): number {
  const ta = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}
/** 已完成按最近(createdAt 倒序)。 */
function byRecent(a: TaskInboxItem, b: TaskInboxItem): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * 桌面任务小组件:身份 + 分类标签(待领任务/待填报/已完成/任务管理)+ 任务清单。
 * 全部从 inbox 派生;任务管理=我发布的任务(taskApi.list,仅 task:manage 可见)。
 * 透明卡片融入壁纸;**窗口固定高度,仅列表区内部滚动**(无窗口级滚动条,见 desktop/README.md)。
 */
export default function TaskWidget() {
  const { me, login, logout } = useAuth();
  const desktop = isDesktop();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useDesktopInboxAlerts(!!me);

  const [cat, setCat] = useState<Cat>("fill");
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

  // 有「任务派发」权限(或超管)才看得到「任务管理」标签
  const canManage = !!me && (me.isPlatformAdmin || (me.permissions ?? []).includes("task:manage"));

  const inboxQ = useQuery({
    queryKey: ["task", "inbox"],
    queryFn: () => taskApi.inbox(),
    enabled: !!me,
    refetchInterval: 90_000,
  });
  const manageQ = useQuery({
    queryKey: ["task", "list"],
    queryFn: () => taskApi.list(),
    enabled: !!me && canManage,
    refetchInterval: 90_000,
  });
  const claimMut = useMutation({
    mutationFn: (targetId: string) => taskApi.claim(targetId),
    onSuccess: (_r, targetId) => {
      void qc.invalidateQueries({ queryKey: ["task", "inbox"] });
      goFill(targetId); // 接收成功 → 直接展开填报
    },
    onError: (e) => toast.error(taskApiErrorMessage(e, "接收失败")),
  });

  // 三类清单都从 inbox 派生(计数 = 点开后的清单):
  //   待领取 = 可接收未认领;待填报 = 我负责、待分派/填报中/退回重报;已完成 = 我负责、已提交或已通过。
  const claimList = useMemo(
    () => (inboxQ.data ?? []).filter((i) => i.claimable).sort(byDue),
    [inboxQ.data],
  );
  const fillList = useMemo(
    () =>
      (inboxQ.data ?? [])
        .filter(
          (i) =>
            i.isOwner &&
            (i.status === "assigned" || i.status === "in_progress" || i.status === "returned"),
        )
        .sort(byDue),
    [inboxQ.data],
  );
  const doneList = useMemo(
    () =>
      (inboxQ.data ?? [])
        .filter((i) => i.isOwner && (i.status === "submitted" || i.status === "done"))
        .sort(byRecent),
    [inboxQ.data],
  );
  // 我发布的任务:按截止日期升序(越快到期越靠上)
  const manageList = useMemo(() => [...(manageQ.data ?? [])].sort(byDue), [manageQ.data]);
  const claimCount = claimList.length;
  const fillCount = fillList.length;
  const doneCount = doneList.length;
  const manageCount = manageList.length;

  const lastUpdated = inboxQ.dataUpdatedAt;
  const position =
    me?.memberships?.admin?.find((m) => m.isPrimary)?.position ??
    me?.memberships?.admin?.[0]?.position ??
    null;
  const personLine = [me?.name, me?.username, position].filter(Boolean).join(" · ") || "未登录";
  const myUnit = resolveUnitName(
    (me?.memberships?.admin ?? []).map((m) => m.org?.name ?? "").filter(Boolean),
  );

  const cats = CATS.filter((c) => c.key !== "manage" || canManage);
  const countFor = (key: Cat): number | undefined =>
    key === "claim"
      ? claimCount
      : key === "fill"
        ? fillCount
        : key === "done"
          ? doneCount
          : manageCount;
  // 当前分类对应的待办清单(任务管理单独走 manageQ)
  const activeList = cat === "claim" ? claimList : cat === "done" ? doneList : fillList;
  const emptyText =
    cat === "claim"
      ? "没有待领的任务"
      : cat === "done"
        ? "还没有已提交/已完成的任务"
        : "没有待填报的任务 🎉";

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
  // 任务管理:发布者的管理是全功能整页操作(汇总/审核),走外部浏览器开任务详情。
  function openManage(taskId: string) {
    openExternal(`${window.location.origin}/admin/tasks/${taskId}`);
  }
  // 新建任务:发证向导式多步流程(上传/AI/字段设计/派发对象),整页操作,走外部浏览器。
  function openCreate() {
    openExternal(`${window.location.origin}/admin/tasks/new`);
  }
  function refresh() {
    void inboxQ.refetch();
    if (canManage) void manageQ.refetch();
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
              {resolveAvatarUrl(me?.avatarUrl) ? (
                <img
                  src={resolveAvatarUrl(me?.avatarUrl)}
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
                <RefreshCw className={cn("h-3.5 w-3.5", inboxQ.isFetching && "animate-spin")} />
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
                {/* ── 分类标签(图标 + 语义色 + 计数角标;点即看清单)── */}
                <div
                  className="grid shrink-0 gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${cats.length}, minmax(0, 1fr))` }}
                >
                  {cats.map((c) => {
                    const count = countFor(c.key);
                    const on = cat === c.key;
                    const Icon = c.Icon;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setCat(c.key)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl py-2 transition-colors",
                          on ? "bg-white shadow-sm" : "bg-white/50 hover:bg-white/80",
                        )}
                        style={on ? { boxShadow: `inset 0 0 0 1.5px ${c.color}` } : undefined}
                      >
                        <div className="relative">
                          <Icon className="h-[19px] w-[19px]" style={{ color: c.color }} />
                          {count != null && count > 0 && (
                            <span
                              className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] leading-none font-bold text-white"
                              style={{ background: c.color }}
                            >
                              {count}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-[11px] font-medium whitespace-nowrap",
                            on ? "text-slate-800" : "text-slate-500",
                          )}
                        >
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ── 任务管理:新建任务(整页向导走外部浏览器,常驻列表上方)── */}
                {cat === "manage" && canManage && (
                  <button
                    onClick={openCreate}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                    style={{ background: C_MANAGE }}
                  >
                    <Plus className="h-4 w-4" />
                    新建任务
                  </button>
                )}

                {/* ── 清单(唯一滚动区:显示当前分类的全部内容)── */}
                <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                  {cat === "manage" ? (
                    manageQ.isLoading ? (
                      <Loading />
                    ) : manageList.length === 0 ? (
                      <Empty text="你还没有发布任务" />
                    ) : (
                      manageList.map((it) => (
                        <ManageRow key={it.id} it={it} onOpen={() => openManage(it.id)} />
                      ))
                    )
                  ) : inboxQ.isLoading ? (
                    <Loading />
                  ) : activeList.length === 0 ? (
                    <Empty text={emptyText} />
                  ) : (
                    activeList.map((it) => <TaskRow key={it.targetId} it={it} onOpen={() => onRowOpen(it)} />)
                  )}
                </div>
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

/**
 * 待办行:左语义色条(棕/蓝/红/绿代表状态,不再写「待接收/填报中」等状态词)+ 标题 + 单行信息。
 *   待领/待填报:「发布部门 · 派发人(姓名悬浮显电话) · 截止日期」凑一行
 *   已完成:「截止日期 · 提报日期 · 提前/逾期 N 天」凑一行
 */
function TaskRow({ it, onOpen }: { it: TaskInboxItem; onOpen: () => void }) {
  const accent = rowAccent(it);
  const isDone = it.status === "submitted" || it.status === "done";
  const el = isDone ? earlyLate(it.dueAt, it.submittedAt) : null;
  const hasDispatch = !!(it.dispatchOrgName || it.dispatchUserName);
  return (
    <button
      onClick={onOpen}
      className="group relative flex items-center gap-2 overflow-hidden rounded-lg bg-white/70 py-2 pr-3 pl-3.5 text-left hover:bg-white"
    >
      <span className="absolute top-0 left-0 h-full w-1" style={{ background: accent }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-800">{it.title}</div>
        <div className="mt-0.5 flex items-center gap-1 overflow-hidden text-[11px] text-slate-400">
          {isDone ? (
            <>
              {it.dueAt && <span className="shrink-0">截止 {dueDateLabel(it.dueAt)}</span>}
              {it.dueAt && it.submittedAt && <span className="shrink-0">·</span>}
              {it.submittedAt && <span className="shrink-0">提报 {dueDateLabel(it.submittedAt)}</span>}
              {el && (
                <span
                  className="ml-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                  style={dueToneStyle(el.tone)}
                >
                  {el.text}
                </span>
              )}
            </>
          ) : (
            <>
              {it.dispatchOrgName && <span className="min-w-0 truncate">{it.dispatchOrgName}</span>}
              {it.dispatchOrgName && it.dispatchUserName && <span className="shrink-0">·</span>}
              {it.dispatchUserName &&
                (it.dispatchUserPhone ? (
                  <span
                    title={`电话:${it.dispatchUserPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 cursor-help text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-[var(--party-primary)]"
                  >
                    {it.dispatchUserName}
                  </span>
                ) : (
                  <span className="shrink-0 text-slate-500">{it.dispatchUserName}</span>
                ))}
              {hasDispatch && it.dueAt && <span className="shrink-0">·</span>}
              {it.dueAt && <span className="shrink-0">截止 {dueDateLabel(it.dueAt)}</span>}
            </>
          )}
        </div>
      </div>
      {it.claimable ? (
        <span
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-white"
          style={{ background: accent }}
        >
          接收
        </span>
      ) : (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[var(--party-primary)]" />
      )}
    </button>
  );
}

/** 我发布的任务行(任务管理):左紫色条 + 标题 + 截止日期(近期橙/逾期红)+ 完成进度,点开整页管理。 */
function ManageRow({ it, onOpen }: { it: TaskListItem; onOpen: () => void }) {
  const done = it.statusCounts?.done ?? 0;
  const due = dueInfo(it.dueAt);
  return (
    <button
      onClick={onOpen}
      className="group relative flex items-center gap-2 overflow-hidden rounded-lg bg-white/70 py-2 pr-3 pl-3.5 text-left hover:bg-white"
    >
      <span className="absolute top-0 left-0 h-full w-1" style={{ background: C_MANAGE }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-800">{it.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={due ? dueToneStyle(due.tone) : { backgroundColor: "#F3F4F6", color: "#9CA3AF" }}
          >
            {it.dueAt ? `截止 ${dueDateLabel(it.dueAt)} · ${due?.text ?? ""}` : "无截止日期"}
          </span>
          <span className="truncate text-slate-400">
            {TASK_STATUS_LABEL[it.status] ?? it.status} · 完成 {done}/{it.targetCount}
          </span>
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

/** 紧凑登录(挂件未登录时):透明圆角壳内的员工编号登录。右上角 设置服务器地址 + 关闭。Casdoor 上线后替换。 */
function WidgetLogin({ login }: { login: (username: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = isDesktop();
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
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 py-6">
      {/* 右上角:设置服务器地址 + 关闭(隐藏到托盘)。仅桌面客户端显示。 */}
      {desktop && (
        <div className="absolute top-0 right-0 flex items-center gap-1">
          <button
            onClick={openServerConfig}
            title="设置服务器地址"
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => void hideWindow()}
            title="关闭(隐藏到托盘,可从托盘重新打开)"
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
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
