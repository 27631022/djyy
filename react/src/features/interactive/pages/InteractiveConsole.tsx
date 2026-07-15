import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  interactiveApi,
  getAuthToken,
  type CreateEventInput,
  type InteractiveEvent,
} from "../api";
import { GAME_UI_LIST, getGameUi } from "../games/registry";
import { type GameUi } from "../games/types";
import { designApi, type GameDesignRow } from "../designer/designApi";
import { parseDesign } from "../designer/designTypes";
import { useRoom } from "../useRoom";
import { HostControls } from "../components/HostControls";
import { EventSettings } from "../components/EventSettings";
import { GamesManager } from "../components/GamesManager";
import { useQrDataUrl } from "../useQrDataUrl";

const EVENTS_KEY = ["interactive", "events"];

function statusLabel(s: string): string {
  return s === "draft" ? "未开始" : s === "live" ? "进行中" : "已结束";
}

interface DraftGame {
  key: string;
  gameType: string;
  title: string;
  config: Record<string, unknown>;
}

function newKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `g_${Math.random().toString(36).slice(2)}`;
}

// ─────────────── 新建活动 ───────────────
function CreateEventCard({ onCreated }: { onCreated: (ev: InteractiveEvent) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [games, setGames] = useState<DraftGame[]>([]);

  const createMut = useMutation({
    mutationFn: (input: CreateEventInput) => interactiveApi.createEvent(input),
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success(`活动已创建 · 房号 ${ev.roomCode}`);
      onCreated(ev);
    },
    onError: () => toast.error("创建失败,请重试"),
  });

  // 自制游戏库(互动游戏编辑器产物):建活动时也可直接把设计加进节目单
  const designsQuery = useQuery({ queryKey: ["interactive", "designs"], queryFn: designApi.list });
  const designs = designsQuery.data ?? [];

  const addGame = (ui: GameUi) =>
    setGames((prev) => [
      ...prev,
      { key: newKey(), gameType: ui.type, title: ui.label, config: { ...ui.defaultConfig } },
    ]);
  const addDesign = (row: GameDesignRow) =>
    setGames((prev) => [
      ...prev,
      {
        key: newKey(),
        gameType: "route_race",
        title: row.name,
        config: { ...(parseDesign(row.configJson) as unknown as Record<string, unknown>), designId: row.id, designName: row.name },
      },
    ]);
  const updateGame = (key: string, patch: Partial<DraftGame>) =>
    setGames((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const removeGame = (key: string) => setGames((prev) => prev.filter((g) => g.key !== key));

  const submit = () => {
    if (!title.trim()) return toast.error("给活动起个名字");
    if (!games.length) return toast.error("至少添加一个游戏");
    createMut.mutate({
      title: title.trim(),
      games: games.map((g) => ({ gameType: g.gameType, title: g.title.trim() || undefined, config: g.config })),
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
      <div className="text-lg font-bold">新建活动</div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">活动名称</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="如:年会现场互动"
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <label className="text-sm text-gray-600">节目单(游戏)</label>
          <div className="flex gap-2 flex-wrap justify-end">
            {GAME_UI_LIST.map((ui) => (
              <button
                key={ui.type}
                type="button"
                onClick={() => addGame(ui)}
                className="text-sm rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50"
              >
                + {ui.label}
              </button>
            ))}
            {designs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => addDesign(d)}
                title="互动游戏编辑器设计的闯关赛(添加时快照当前设计)"
                className="text-sm rounded-md border border-dashed border-[var(--party-primary)] text-[var(--party-primary)] px-3 py-1 hover:bg-party-soft"
              >
                🎮 + {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {games.length === 0 && (
            <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
              点上方按钮添加游戏
            </div>
          )}
          {games.map((g, idx) => {
            const ui = getGameUi(g.gameType);
            return (
              <div key={g.key} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400 w-6">{idx + 1}.</span>
                  <input
                    value={g.title}
                    onChange={(e) => updateGame(g.key, { title: e.target.value })}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-gray-400">{ui?.label ?? g.gameType}</span>
                  <button
                    type="button"
                    onClick={() => removeGame(g.key)}
                    className="text-gray-400 hover:text-red-500 text-sm px-2"
                  >
                    删除
                  </button>
                </div>
                {ui && (
                  <div className="pl-8">
                    <ui.Config value={g.config} onChange={(cfg) => updateGame(g.key, { config: cfg })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={createMut.isPending}
        className="rounded-lg px-6 py-2.5 text-white font-semibold disabled:opacity-50"
        style={{ background: "var(--party-primary)" }}
      >
        {createMut.isPending ? "创建中…" : "创建活动"}
      </button>
    </div>
  );
}

// ─────────────── 内嵌主持台(host socket) ───────────────
function ConsoleHostPanel({ roomCode }: { roomCode: string }) {
  const [token] = useState(getAuthToken);
  const r = useRoom({ roomCode, role: "host", token });
  const controllerUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play/${roomCode}?role=host&t=${encodeURIComponent(token ?? "")}`
      : "";
  const ctrlQr = useQrDataUrl(controllerUrl, 200);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <HostControls
          connected={r.connected}
          games={r.games}
          activeGameId={r.activeGameId}
          screenView={r.screenView}
          grouping={r.gameGrouping}
          control={r.control}
        />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center gap-2">
        <div className="text-sm font-semibold text-gray-500">控制器二维码</div>
        {ctrlQr ? (
          <img src={ctrlQr} alt="控制器二维码" className="w-40 h-40" />
        ) : (
          <div className="w-40 h-40" />
        )}
        <div className="text-xs text-gray-400 text-center leading-relaxed">
          管理员手机扫此码 → 变成遥控器,遥控每局开始/结束
        </div>
        <div className="text-sm text-gray-600 mt-1">
          在场 <b className="text-[var(--party-primary)]">{r.connectedCount}</b> 人
        </div>
      </div>
    </div>
  );
}

// ─────────────── 活动详情(TAB:主持台 / 节目设置 / 首页设置)───────────────
type DetailTab = "host" | "games" | "home";
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "host", label: "主持台" },
  { key: "games", label: "节目设置" },
  { key: "home", label: "首页设置" },
];

function EventDetail({
  event,
  onEnd,
  ending,
  onRename,
  renaming,
  onDelete,
  deleting,
}: {
  event: InteractiveEvent;
  onEnd: () => void;
  ending: boolean;
  onRename: (title: string) => void;
  renaming: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [tab, setTab] = useState<DetailTab>("host");
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(event.title);
  const ended = event.status === "ended";
  const screenUrl = `/screen/${event.roomCode}`;
  const saveRename = () => {
    const t = titleDraft.trim();
    if (!t) return toast.error("活动名称不能为空");
    onRename(t);
    setEditing(false);
  };
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-lg font-bold w-64 max-w-full"
              />
              <button
                type="button"
                onClick={saveRename}
                disabled={renaming}
                className="rounded-md px-3 py-1 text-white text-sm disabled:opacity-50"
                style={{ background: "var(--party-primary)" }}
              >
                {renaming ? "保存中…" : "保存"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-3 py-1 text-sm">
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold truncate">{event.title}</div>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(event.title);
                  setEditing(true);
                }}
                className="shrink-0 text-gray-400 hover:text-[var(--party-primary)] text-sm"
                title="改名"
              >
                ✎ 改名
              </button>
            </div>
          )}
          <div className="text-sm text-gray-500 mt-0.5">
            房号{" "}
            <span className="font-black tracking-[0.2em] text-[var(--party-primary)]">
              {event.roomCode}
            </span>{" "}
            · {statusLabel(event.status)} · {event._count?.players ?? 0} 人参与过
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={screenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-4 py-2 text-white font-semibold"
            style={{ background: "var(--party-primary)" }}
          >
            打开大屏 ↗
          </a>
          {!ended && (
            <button
              type="button"
              onClick={onEnd}
              disabled={ending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              结束活动
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "删除中…" : "删除活动"}
          </button>
        </div>
      </div>

      {ended ? (
        <div className="text-gray-500 text-sm px-1">活动已结束,房间已关闭。</div>
      ) : (
        <>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
            {DETAIL_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-white shadow text-[var(--party-primary)]" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 三个面板常驻挂载、按 tab 显隐:主持台的 host socket 不因切 tab 断连 */}
          <div className={tab === "host" ? "" : "hidden"}>
            <ConsoleHostPanel key={event.roomCode} roomCode={event.roomCode} />
          </div>
          <div className={tab === "games" ? "" : "hidden"}>
            <GamesManager key={`games-${event.id}`} event={event} />
          </div>
          <div className={tab === "home" ? "" : "hidden"}>
            <EventSettings key={`settings-${event.id}`} event={event} />
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────── 页面 ───────────────
export default function InteractiveConsole() {
  const qc = useQueryClient();
  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: interactiveApi.listEvents });
  const events = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  const endMut = useMutation({
    mutationFn: (id: string) => interactiveApi.endEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success("活动已结束");
    },
    onError: () => toast.error("操作失败"),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => interactiveApi.renameEvent(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      toast.success("活动已改名");
    },
    onError: () => toast.error("改名失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => interactiveApi.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      setSelectedId(null);
      toast.success("活动已删除");
    },
    onError: () => toast.error("删除失败"),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">现场互动</h1>
          <p className="text-sm text-gray-500 mt-1">
            大屏 + 手机扫码遥控 —— 建一场活动,选游戏、开大屏、手机扫码即玩
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          className="rounded-lg px-4 py-2 text-white font-semibold"
          style={{ background: "var(--party-primary)" }}
        >
          + 新建活动
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-3 h-fit">
          <div className="text-xs font-semibold text-gray-400 px-2 py-1">我的活动</div>
          {eventsQ.isLoading && <div className="text-sm text-gray-400 px-2 py-4">加载中…</div>}
          {!eventsQ.isLoading && events.length === 0 && (
            <div className="text-sm text-gray-400 px-2 py-4">还没有活动,点右上「新建活动」</div>
          )}
          <div className="flex flex-col gap-1">
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSelectedId(e.id);
                  setCreating(false);
                }}
                className={`text-left rounded-lg px-3 py-2 transition-colors ${
                  selectedId === e.id && !creating ? "bg-party-soft" : "hover:bg-gray-50"
                }`}
              >
                <div className="font-medium truncate">{e.title}</div>
                <div className="text-xs text-gray-400">
                  {e.roomCode} · {statusLabel(e.status)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {creating ? (
            <CreateEventCard
              onCreated={(ev) => {
                setCreating(false);
                setSelectedId(ev.id);
              }}
            />
          ) : selected ? (
            <EventDetail
              key={selected.id}
              event={selected}
              onEnd={() => endMut.mutate(selected.id)}
              ending={endMut.isPending}
              onRename={(title) => renameMut.mutate({ id: selected.id, title })}
              renaming={renameMut.isPending}
              onDelete={() => {
                if (window.confirm(`确定删除活动「${selected.title}」?\n其下所有节目、参与记录将一并删除,不可恢复。`)) {
                  deleteMut.mutate(selected.id);
                }
              }}
              deleting={deleteMut.isPending}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
              选择左侧活动,或点「新建活动」开始
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
