import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { storageApi } from "@/features/storage";
import { interactiveFileUrl, type GroupingConfig } from "../api";
import { type GameConfigProps, type GameRemoteProps, type GameScreenProps, type GameUi } from "./types";
import { RACE_THEME_LIST, getRaceTheme, type FramePos, type RaceTheme } from "./raceThemes";
import playingWorldcupMp3 from "../assets/sounds/playing-worldcup.mp3";
import { PodiumFrameEditor, DEFAULT_NUM_FRAMES, type NumFrame } from "./raceFrameEditor";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { AutoScrollGrid } from "../components/AutoScrollGrid";
import { type RosterPlayer } from "../useRoom";

const START_PCT = 5;
const FINISH_PCT = 86;
// 大屏个人赛最多显示前 8 名(人多了每条泳道会太小);其余选手在自己手机上看名次
const MAX_LANES = 8;

/** 版式编辑器保存的数值帧 → 渲染用 FramePos */
function framesFromNums(nums: NumFrame[] | undefined): FramePos[] | null {
  if (!nums || nums.length < 3) return null;
  return nums.slice(0, 3).map((f) => ({
    av: { left: `${f.ax}%`, top: `${f.ay}%`, size: `${f.as}%` },
    nm: { left: `${f.nx}%`, top: `${f.ny}%` },
  }));
}
const DEFAULT_FRAMES: FramePos[] = framesFromNums(DEFAULT_NUM_FRAMES)!;

interface LbRow {
  deviceId: string;
  nickname: string;
  score: number;
  rank: number;
  teamId?: string | null;
}
// 队伍对抗榜行(服务端 teamStandings 已按各队成员点击总和算好排名)
interface TeamRow {
  teamId: string;
  name: string;
  score: number;
  rank: number;
  memberCount: number;
  topDeviceId?: string | null; // 队内点击量最高者(领奖台头像用他)
}
interface RaceOverrides {
  backdropFileId?: string;
  trackFileId?: string;
  podiumFileId?: string;
  remoteBgFileId?: string; // 手机端背景图(上传替换;缺省用主题默认)
  spriteFileIds?: string[];
}
interface RaceView {
  status: "ready" | "countdown" | "running" | "ended";
  countdownRemainMs: number;
  durationSec: number;
  remainMs: number;
  playerCount: number;
  hasTeams: boolean;
  leaderboard: LbRow[];
  teams?: TeamRow[]; // 队伍对抗榜(分组对抗时用它排名/展示,不按个人)
  theme?: string;
  overrides?: RaceOverrides;
  accent?: string;
  frames?: NumFrame[]; // 领奖台版式(版式编辑器保存;缺省用主题默认)
  avatarBehind?: boolean; // 图层:头像藏在台图后面(默认 true)
}
interface RaceRemoteView {
  status: "ready" | "countdown" | "running" | "ended";
  countdownRemainMs: number;
  remainMs: number;
  myCount: number;
  myRank: number | null;
  myTeamId: string | null;
  myTeamName: string | null;
  myTeamScore?: number | null;
  myTeamRank?: number | null;
  playerCount: number;
  theme?: string;
  overrides?: RaceOverrides;
}

function secs(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}
function colorOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 46%)`;
}

// 领奖台一个名次的展示数据 —— 个人赛=选手,分组对抗=队伍(队头像取该队「第一个加入的人」)。
// 两种模式共用同一套领奖台组件,规则一致。(export 供 routeRace 等同类游戏复用,零逻辑改动)
export interface PodiumEntry {
  key: string;
  name: string;
  score: number;
  rank: number;
  avatar: string | null;
  color: string;
}

// 稳定泳道分配:MAX_LANES 个固定车道,选手一旦占道就保持不动(不因点击量上下重排)。
// 掉出前 N 名者让出车道;新进前 N 名者补入最靠前的空道(= 顶替刚掉出者留下的道)。
function reconcileLanes(prev: (string | null)[], desired: string[]): (string | null)[] {
  const want = new Set(desired);
  const next = prev.slice();
  for (let i = 0; i < next.length; i++) if (next[i] && !want.has(next[i]!)) next[i] = null; // 让出掉榜者的道
  const placed = new Set(next.filter(Boolean) as string[]);
  const incoming = desired.filter((id) => !placed.has(id)); // 新进前 N 名(保持 rank 顺序)
  let k = 0;
  for (let i = 0; i < next.length && k < incoming.length; i++) if (next[i] === null) next[i] = incoming[k++];
  return next;
}

// 图片领奖台:头像层(默认**藏在台图后面**,从相框透明洞露出、被相框裁边)→ 台图 → 名字层(恒在台前名牌上)
export function ImagePodium({
  podiumUrl,
  frames,
  entries,
  avatarBehind,
}: {
  podiumUrl: string;
  frames: FramePos[];
  entries: PodiumEntry[];
  avatarBehind: boolean;
}) {
  return (
    <div className="relative" style={{ width: "min(76vw, 900px)", aspectRatio: "823 / 452" }}>
      {/* 头像层:avatarBehind=true(默认)时 z-0 垫在台图下 */}
      {entries.map((e, i) => (
        <PlayerAvatar
          key={`av-${e.key}`}
          avatar={e.avatar}
          name={e.name}
          color={e.color}
          className={`absolute -translate-x-1/2 -translate-y-1/2 ${avatarBehind ? "z-0" : "z-20 ring-2 ring-white/70"}`}
          style={{ left: frames[i].av.left, top: frames[i].av.top, width: frames[i].av.size, aspectRatio: "1", fontSize: "clamp(14px, 2.4vw, 46px)" }}
        />
      ))}
      <img src={podiumUrl} alt="" className="relative z-10 w-full h-full object-contain pointer-events-none" />
      {/* 名字层:恒在台前(名牌上) */}
      {entries.map((e, i) => (
        <div
          key={`nm-${e.key}`}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 text-white font-black whitespace-nowrap text-center"
          style={{ left: frames[i].nm.left, top: frames[i].nm.top, fontSize: "clamp(11px, 1.5vw, 30px)", textShadow: "0 1px 4px rgba(0,0,0,.7)" }}
        >
          {e.name}
          <span className="opacity-85"> · {e.score}</span>
        </div>
      ))}
    </div>
  );
}

// CSS 领奖台(无图片主题兜底):金银铜台阶。个人赛/分组对抗共用。
export function CssPodium({ entries }: { entries: PodiumEntry[] }) {
  const medal = ["#F5B417", "#C0C0C0", "#CD7F32"];
  const order = [entries[1], entries[0], entries[2]]; // 2 · 1 · 3
  const heights = ["46%", "66%", "38%"];
  const ranks = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-3" style={{ width: "min(70vw,720px)", height: "40vh" }}>
      {order.map((e, idx) =>
        e ? (
          <div key={e.key} className="flex flex-col items-center justify-end" style={{ width: "28%", height: heights[idx] }}>
            <PlayerAvatar avatar={e.avatar} name={e.name} color={e.color} className="ring-4 ring-white/80" style={{ width: "clamp(46px,6vw,110px)", aspectRatio: "1", fontSize: "clamp(18px,2.6vw,48px)" }} />
            <div className="text-white font-black my-1 text-center" style={{ fontSize: "clamp(12px,1.4vw,26px)" }}>
              {e.name} · {e.score}
            </div>
            <div className="w-full rounded-t-lg flex items-center justify-center flex-1" style={{ background: `linear-gradient(180deg, ${medal[ranks[idx] - 1]}, color-mix(in srgb, ${medal[ranks[idx] - 1]} 60%, #333))` }}>
              <span className="text-white font-black drop-shadow" style={{ fontSize: "clamp(24px,4vw,72px)" }}>{ranks[idx]}</span>
            </div>
          </div>
        ) : (
          <div key={`empty-${idx}`} style={{ width: "28%" }} />
        ),
      )}
    </div>
  );
}

// 分组对抗报名看板:按队伍分栏,每队按报名设置预留 maxPerTeam 个位子(已加入=头像,空位=虚线占位),
// 「谁进了哪队、还差几人」一目了然;pick 模式尚未选队的人单列「未选队」。
export function TeamRosterBoard({ grouping, players }: { grouping: GroupingConfig; players: RosterPlayer[] }) {
  const max = grouping.maxPerTeam; // 0 = 不限
  const byTeam = new Map<string, RosterPlayer[]>();
  for (const t of grouping.teams) byTeam.set(t.id, []);
  const unassigned: RosterPlayer[] = [];
  for (const p of players) {
    const arr = p.teamId ? byTeam.get(p.teamId) : undefined;
    if (arr) arr.push(p);
    else unassigned.push(p);
  }
  const slot = (p: RosterPlayer, color: string) => (
    <div key={p.deviceId} className="flex items-center gap-2">
      <PlayerAvatar avatar={p.avatar} name={p.nickname} color={color} className="ring-2 ring-white/60 shrink-0" style={{ width: "2rem", height: "2rem", fontSize: "0.9rem" }} />
      <span className="text-white text-sm truncate">{p.nickname}</span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-3 justify-center items-start">
      {grouping.teams.map((t) => {
        const members = byTeam.get(t.id) ?? [];
        const empty = max > 0 ? Math.max(0, max - members.length) : 0;
        const full = max > 0 && members.length >= max;
        return (
          <div key={t.id} className="rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm" style={{ width: 172, border: `2px solid ${t.color}` }}>
            <div className="px-3 py-2 flex items-center justify-between text-white font-bold" style={{ background: t.color }}>
              <span className="truncate">{t.name}</span>
              <span className="text-sm shrink-0">
                {members.length}
                {max > 0 ? `/${max}` : " 人"}
                {full ? " 满" : ""}
              </span>
            </div>
            <div className="p-2 flex flex-col gap-1.5 min-h-[3rem]">
              {members.map((p) => slot(p, t.color))}
              {Array.from({ length: empty }).map((_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/40 shrink-0" />
                  <span className="text-white/40 text-sm">空位</span>
                </div>
              ))}
              {members.length === 0 && empty === 0 && <div className="text-white/40 text-sm py-1">虚位以待</div>}
            </div>
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div className="rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm" style={{ width: 172, border: "2px dashed rgba(255,255,255,0.35)" }}>
          <div className="px-3 py-2 flex items-center justify-between text-white/90 font-bold bg-white/10">
            <span>未选队</span>
            <span className="text-sm shrink-0">{unassigned.length} 人</span>
          </div>
          <div className="p-2 flex flex-col gap-1.5">{unassigned.map((p) => slot(p, "#888"))}</div>
        </div>
      )}
    </div>
  );
}

// 开赛前报名页:静止虚化背景 + 装饰框 + 二维码 + 报名头像(分组对抗时按队分栏预留位子)
function RegistrationView({
  theme,
  backdropUrl,
  accent,
  roomCode,
  joinQr,
  roster,
  avatarColor,
  grouping,
}: {
  theme: RaceTheme;
  backdropUrl?: string;
  accent: string;
  roomCode: string;
  joinQr: string | null;
  roster: RosterPlayer[];
  avatarColor: (p: { deviceId: string; teamId?: string | null }) => string;
  grouping: GroupingConfig | null;
}) {
  const players = roster.filter((p) => p.connected);
  const teamMode = grouping?.mode === "teams" && grouping.teams.length > 0;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 静止虚化背景(不滚动)*/}
      {backdropUrl ? (
        <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-md scale-110" />
      ) : (
        <div className="absolute inset-0 blur-sm" style={{ background: theme.backdropStyle, backgroundSize: "cover" }} />
      )}
      <div className="absolute inset-0 bg-black/40" />
      {/* 装饰框(透明中心);无图主题用 CSS 边框兜底 */}
      {theme.frameOverlay ? (
        <img src={theme.frameOverlay} alt="" className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
      ) : (
        <div className="absolute inset-6 rounded-3xl border-4 pointer-events-none" style={{ borderColor: accent, boxShadow: `inset 0 0 40px ${accent}55` }} />
      )}
      {/* 中央报名内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[6%]">
        <div className="text-4xl font-black mb-5 drop-shadow-lg" style={{ color: accent }}>
          ⚽ 扫码报名参赛{teamMode ? " · 分组对抗" : ""}
        </div>
        <div className="flex items-center gap-10 flex-wrap justify-center">
          <div className="flex flex-col items-center rounded-2xl bg-white/95 p-4 shadow-2xl">
            {joinQr ? <img src={joinQr} alt="报名二维码" className="w-48 h-48" /> : <div className="w-48 h-48" />}
            <div className="text-gray-600 mt-2 text-sm">扫码上场</div>
            <div className="text-3xl font-black tracking-[0.25em]" style={{ color: accent }}>{roomCode}</div>
            {teamMode && (
              <div className="text-gray-500 mt-1 text-xs text-center">
                {grouping!.assign === "auto" ? "系统自动分队" : "手机上选择队伍"}
              </div>
            )}
          </div>
          <div>
            <div className="text-white text-2xl mb-3 drop-shadow">
              已报名 <span className="font-black" style={{ color: accent }}>{players.length}</span> 人
            </div>
            {teamMode ? (
              <AutoScrollGrid className="max-w-[56vw] max-h-[52vh]">
                <TeamRosterBoard grouping={grouping!} players={players} />
              </AutoScrollGrid>
            ) : (
              <AutoScrollGrid className="max-w-[42vw] max-h-[46vh]">
                <div className="flex flex-wrap gap-3 content-start">
                  {players.map((p) => (
                    <div key={p.deviceId} className="flex flex-col items-center w-16">
                      <PlayerAvatar avatar={p.avatar} name={p.nickname} color={avatarColor(p)} className="ring-2 ring-white/70" style={{ width: "3rem", height: "3rem", fontSize: "1.2rem" }} />
                      <div className="text-white text-xs mt-1 truncate w-full text-center drop-shadow">{p.nickname}</div>
                    </div>
                  ))}
                  {players.length === 0 && <div className="text-white/70 text-xl">等待扫码报名…</div>}
                </div>
              </AutoScrollGrid>
            )}
          </div>
        </div>
        <div className="text-white/70 mt-6 text-lg drop-shadow">人齐后,主持人点「开始」即开赛 🏁</div>
      </div>
    </div>
  );
}

// ─────────────────────── 大屏 ───────────────────────
function RaceScreen({ view, grouping, roster, roomCode, joinQr }: GameScreenProps) {
  const v = view as RaceView | null;
  // 稳定泳道占位:哪个 deviceId 占哪条车道,跨帧保持(渲染期按前 N 名对账,不因点击量重排车道)
  const [laneSlots, setLaneSlots] = useState<(string | null)[]>(() => Array(MAX_LANES).fill(null));
  if (!v) return null;

  const theme = getRaceTheme(v.theme);
  const ov = v.overrides ?? {};
  const accent = v.accent || theme.accent;
  const backdropUrl = ov.backdropFileId ? interactiveFileUrl(ov.backdropFileId) : theme.backdrop;
  const trackUrl = ov.trackFileId ? interactiveFileUrl(ov.trackFileId) : theme.track;
  const podiumUrl = ov.podiumFileId ? interactiveFileUrl(ov.podiumFileId) : theme.podium;
  const sprites = (ov.spriteFileIds?.length ? ov.spriteFileIds.map((f) => interactiveFileUrl(f)) : theme.sprites) ?? [];

  // 队色查节目级分组(分组属节目玩法)
  const teamColor = (id?: string | null) => (id && grouping?.teams.find((t) => t.id === id)?.color) || null;
  const avatarColor = (p: { deviceId: string; teamId?: string | null }) => teamColor(p.teamId) ?? colorOf(p.deviceId);

  // 开赛前:报名页(静止虚化背景 + 装饰框 + 二维码 + 报名头像),背景不滚动
  if (v.status === "ready") {
    return (
      <RegistrationView
        theme={theme}
        backdropUrl={backdropUrl}
        accent={accent}
        roomCode={roomCode}
        joinQr={joinQr}
        roster={roster}
        avatarColor={avatarColor}
        grouping={grouping}
      />
    );
  }

  const lb = v.leaderboard;
  const byId = new Map(lb.map((p) => [p.deviceId, p]));
  // 稳定泳道:前 MAX_LANES 名占固定车道,一旦占道就不再随点击量上下重排;
  // 第 9 名挤进前 8 → 顶替掉出者的那条道(名字换成新人,继续横向跑)。
  const desiredIds = lb.slice(0, MAX_LANES).map((p) => p.deviceId);
  const reconciled = reconcileLanes(laneSlots, desiredIds);
  if (reconciled.some((id, i) => id !== laneSlots[i])) setLaneSlots(reconciled); // 渲染期对账(收敛,不循环)
  const laneList = reconciled.map((id) => (id ? byId.get(id) : undefined)).filter((p): p is LbRow => !!p);
  const N = Math.max(1, laneList.length);
  const top3 = lb.slice(0, 3);
  const rest = lb.slice(3, MAX_LANES); // 结算也只展示前 MAX_LANES 名,与跑动画面一致

  // 跑动 = 时间驱动:起跑全在最左;第一名按 已用时间/总时长 匀速右移,时间到刚好到终点;
  // 其他人按 自己分数/第一名分数 跟在后面(比例落后)。
  const durMs = Math.max(1, v.durationSec * 1000);
  const timeFrac =
    v.status === "running" ? Math.min(1, Math.max(0, (durMs - v.remainMs) / durMs)) : v.status === "ended" ? 1 : 0;
  const leaderX = START_PCT + timeFrac * (FINISH_PCT - START_PCT);
  const maxScore = Math.max(...lb.map((p) => p.score), 0);
  const xOf = (score: number) => (maxScore > 0 ? START_PCT + (score / maxScore) * (leaderX - START_PCT) : START_PCT);

  // 领奖台版式:节目配置(版式编辑器)> 主题默认;头像图层默认藏台后
  const podiumFrames = framesFromNums(v.frames) ?? theme.frames ?? DEFAULT_FRAMES;
  const avatarBehind = v.avatarBehind !== false;
  const avatarByDevice = new Map(roster.map((p) => [p.deviceId, p.avatar]));
  const avatarOf = (deviceId: string) => avatarByDevice.get(deviceId) ?? null;

  // 分组对抗:改按「队伍」跑动/排名(各队成员点击总和,服务端 teamStandings 已算好),不按个人。
  const teamMode = !!v.hasTeams && grouping?.mode === "teams";
  const teamRows = [...(v.teams ?? [])].sort((a, b) => a.rank - b.rank);
  const teamById = new Map(teamRows.map((t) => [t.teamId, t]));
  // 队伍泳道按 grouping.teams 固定顺序排(不因点击量重排车道),只含已有成员的队
  const teamLanes = (grouping?.teams ?? [])
    .map((t) => teamById.get(t.id))
    .filter((t): t is TeamRow => !!t)
    .slice(0, MAX_LANES);
  const Nt = Math.max(1, teamLanes.length);
  const maxTeamScore = Math.max(...teamRows.map((t) => t.score), 0);
  const teamColorSafe = (id: string) => teamColor(id) ?? colorOf(id);
  // 队伍位置也时间驱动:领先队(分最高)时间到刚好到终点,其余队按 队分/最高队分 落后
  const xOfTeam = (score: number) => (maxTeamScore > 0 ? START_PCT + (score / maxTeamScore) * (leaderX - START_PCT) : START_PCT);

  // 领奖台条目(个人=选手 / 分组=队伍;队头像取该队「点击量最高者」的头像),两模式共用同一领奖台
  const toEntry = (p: LbRow): PodiumEntry => ({ key: p.deviceId, name: p.nickname, score: p.score, rank: p.rank, avatar: avatarOf(p.deviceId), color: avatarColor(p) });
  const toTeamEntry = (t: TeamRow): PodiumEntry => ({ key: t.teamId, name: t.name, score: t.score, rank: t.rank, avatar: t.topDeviceId ? avatarOf(t.topDeviceId) : null, color: teamColorSafe(t.teamId) });
  const podiumEntries = teamMode ? teamRows.slice(0, 3).map(toTeamEntry) : top3.map(toEntry);
  const restEntries = teamMode ? teamRows.slice(3).map(toTeamEntry) : rest.map(toEntry);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes race-marquee { to { transform: translateX(-50%); } }
        @keyframes race-css-scroll { to { background-position-x: -600px; } }
        .race-marquee { animation: race-marquee 40s linear infinite; will-change: transform; }
        .race-css-scroll { animation: race-css-scroll 24s linear infinite; }
      `}</style>

      {/* 幕布上半:循环向左滚动(动画时长按主题 scrollSec 内联覆盖) */}
      <div className="absolute top-0 inset-x-0 h-1/2 overflow-hidden">
        {backdropUrl ? (
          <div className="race-marquee flex h-full" style={{ width: "200%", animationDuration: `${theme.scrollSec}s` }}>
            <img src={backdropUrl} alt="" className="w-1/2 h-full object-cover" />
            <img src={backdropUrl} alt="" className="w-1/2 h-full object-cover" />
          </div>
        ) : (
          <div className="race-css-scroll absolute inset-0" style={{ background: theme.backdropStyle, backgroundSize: "auto 100%", animationDuration: `${theme.scrollSec}s` }} />
        )}
      </div>

      {/* 幕布下半:静止赛道 + 从左往右跑(结算时隐藏终点线,只留领奖台) */}
      <div className="absolute bottom-0 inset-x-0 h-1/2" style={trackUrl ? undefined : { background: theme.trackStyle }}>
        {trackUrl && <img src={trackUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {v.status !== "ended" && (
          <div className="absolute top-[4%] bottom-[4%] w-2 opacity-80" style={{ left: `${FINISH_PCT}%`, background: "repeating-linear-gradient(180deg,#fff 0 12px,#111 12px 24px)" }} />
        )}
        {/* 个人赛:每人一条泳道(最多前 MAX_LANES 名) */}
        {v.status !== "ended" &&
          !teamMode &&
          laneList.map((p, i) => {
            const x = xOf(p.score);
            const laneTop = (i + 0.5) * (100 / N);
            return (
              <div
                key={p.deviceId}
                className="absolute flex flex-col items-center"
                style={{ left: `${x}%`, top: `${laneTop}%`, transform: "translate(-50%, -58%)", transition: "left 0.2s linear, top 0.4s ease" }}
              >
                <div className="mb-0.5 rounded bg-black/45 px-1.5 text-white text-sm font-bold whitespace-nowrap drop-shadow">
                  {p.nickname} · {p.score}
                </div>
                {sprites.length ? (
                  <img src={sprites[i % sprites.length]} alt="" className="object-contain drop-shadow-xl" style={{ height: `calc((50vh / ${N}) * 0.8)` }} />
                ) : (
                  <div className="leading-none drop-shadow-xl" style={{ fontSize: `calc((50vh / ${N}) * 0.6)` }}>
                    {theme.runnerEmoji ?? "🏃"}
                  </div>
                )}
              </div>
            );
          })}

        {/* 分组对抗:每队一条泳道(按队伍点击总和跑动),而非个人 */}
        {v.status !== "ended" &&
          teamMode &&
          teamLanes.map((t, i) => {
            const x = xOfTeam(t.score);
            const laneTop = (i + 0.5) * (100 / Nt);
            const col = teamColorSafe(t.teamId);
            return (
              <div
                key={t.teamId}
                className="absolute flex flex-col items-center"
                style={{ left: `${x}%`, top: `${laneTop}%`, transform: "translate(-50%, -58%)", transition: "left 0.2s linear, top 0.4s ease" }}
              >
                <div className="mb-0.5 rounded px-2 text-white text-base font-bold whitespace-nowrap drop-shadow" style={{ background: col }}>
                  {t.name} · {t.score}
                  <span className="opacity-85 text-sm"> ({t.memberCount}人)</span>
                </div>
                {sprites.length ? (
                  <img
                    src={sprites[i % sprites.length]}
                    alt=""
                    className="object-contain"
                    style={{ height: `calc((50vh / ${Nt}) * 0.82)`, filter: `drop-shadow(0 0 10px ${col}) drop-shadow(0 3px 4px rgba(0,0,0,.5))` }}
                  />
                ) : (
                  <div
                    className="rounded-full flex items-center justify-center text-white font-black ring-4 ring-white/70 drop-shadow-xl"
                    style={{ background: col, width: `calc((50vh / ${Nt}) * 0.62)`, height: `calc((50vh / ${Nt}) * 0.62)`, fontSize: `calc((50vh / ${Nt}) * 0.26)` }}
                  >
                    {t.name.slice(0, 1)}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* 个人赛人多时:提示只显前 N 名,其余看手机(用真实总人数 playerCount,leaderboard 已被后端截断到 20) */}
      {v.status === "running" && !teamMode && v.playerCount > MAX_LANES && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-white/90 text-sm whitespace-nowrap backdrop-blur">
          仅显示前 {MAX_LANES} 名 · 其余 {v.playerCount - MAX_LANES} 位选手请在自己手机上看名次
        </div>
      )}

      {/* 倒计时 / 计时 */}
      {v.status === "countdown" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
          <div className="text-4xl text-white/80 mb-2">准备</div>
          <div className="text-[13rem] leading-none font-black animate-pulse" style={{ color: accent }}>
            {Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
          </div>
        </div>
      )}
      {v.status === "running" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-6xl font-black tabular-nums text-white drop-shadow-lg">{secs(v.remainMs)}</div>
      )}

      {/* 结算:领奖台(个人赛 / 分组对抗 共用同一套规则;分组头像=各队第一个加入的人) */}
      {v.status === "ended" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 px-4">
          <div className="text-white text-3xl font-black mb-1">🏆 {teamMode ? "团队总排名" : "最终排名"}</div>
          {podiumUrl ? (
            <ImagePodium podiumUrl={podiumUrl} frames={podiumFrames} entries={podiumEntries} avatarBehind={avatarBehind} />
          ) : (
            <CssPodium entries={podiumEntries} />
          )}
          {/* 第 4 名起一行小头像(个人=选手 / 分组=队伍,均带名次角标) */}
          {restEntries.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {restEntries.map((e) => (
                <div key={e.key} className="flex flex-col items-center">
                  <div className="relative">
                    <PlayerAvatar avatar={e.avatar} name={e.name} color={e.color} className="ring-2 ring-white/60" style={{ width: "clamp(42px, 4vw, 84px)", aspectRatio: "1", fontSize: "clamp(16px, 1.5vw, 32px)" }} />
                    <div className="absolute -top-1 -left-1 bg-black/75 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{e.rank}</div>
                  </div>
                  <div className="text-white text-sm mt-1 max-w-[7rem] truncate text-center">
                    {e.name} · {e.score}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 摇一摇:相邻 accelerationIncludingGravity 读数的向量差(m/s²)超阈值算一次摇动;冷却防一次挥动多计。
// ⚠ devicemotion 需安全上下文(HTTPS / localhost),纯局域网 HTTP 下不派发 → 保留点击兜底。
const SHAKE_THRESHOLD = 14;
const SHAKE_COOLDOWN_MS = 110;

// ─────────────────────── 手机 ───────────────────────
// mode="tap"(快乐点点点=点击)/ "shake"(足球摇一摇=体感;不支持体感的设备点圆圈兜底)。两模式共用同一界面。
export function RaceRemote({
  view,
  connected,
  sendAction,
  grouping,
  mode = "tap",
}: GameRemoteProps & { mode?: "tap" | "shake" }) {
  const v = view as RaceRemoteView | null;
  const pendingRef = useRef(0);
  const [bump, setBump] = useState(0);
  const [shakeActive, setShakeActive] = useState(false); // 收到过真实体感读数 → 显示「摇一摇已就绪」
  const shakeActiveRef = useRef(false);
  const myTeamColor = v?.myTeamId ? grouping?.teams.find((t) => t.id === v.myTeamId)?.color ?? null : null;
  // 手机背景:上传覆盖 > 主题默认(soccer=竖版球场手机图);负 z 层垫在壳背景之上、内容之下
  const remoteTheme = getRaceTheme(v?.theme);
  const remoteBgUrl = v?.overrides?.remoteBgFileId
    ? interactiveFileUrl(v.overrides.remoteBgFileId)
    : remoteTheme.remoteBg;

  const running = v?.status === "running";

  useEffect(() => {
    // 200ms 合批上报(点击在本地累计,一次发增量):40 人也只有 ~200 msg/s 入站;
    // 服务端另有 400ms 广播节流,双侧解耦
    const t = setInterval(() => {
      if (pendingRef.current > 0) {
        sendAction({ kind: "tap", n: pendingRef.current });
        pendingRef.current = 0;
      }
    }, 200);
    return () => clearInterval(t);
  }, [sendAction]);

  // 摇一摇模式:比赛中监听 devicemotion,超阈值 = 一次「摇动」(与点击同样累进 pendingRef,后端零差异)
  useEffect(() => {
    if (mode !== "shake" || !running || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    let lx = 0,
      ly = 0,
      lz = 0,
      primed = false,
      lastShake = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      if (!shakeActiveRef.current) {
        shakeActiveRef.current = true;
        setShakeActive(true);
      }
      const x = a.x,
        y = a.y ?? 0,
        z = a.z ?? 0,
        now = Date.now();
      if (primed) {
        const d = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2 + (z - lz) ** 2);
        if (d > SHAKE_THRESHOLD && now - lastShake > SHAKE_COOLDOWN_MS) {
          lastShake = now;
          pendingRef.current += 1;
          setBump((b) => (b + 1) % 1000);
        }
      }
      lx = x;
      ly = y;
      lz = z;
      primed = true;
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [mode, running]);

  const onInput = (e: React.PointerEvent) => {
    if (!running) return;
    // 只认主触点:多指同拍每根手指都会触发一次 pointerdown(4 指齐点=4 次,刷分不实),
    // isPrimary 只放行第一个触点 —— 单指快点不受影响,同时多指只算 1 次
    if (!e.isPrimary) return;
    pendingRef.current += 1; // 点击(点击模式=主输入 / 摇一摇模式=兜底)
    setBump((b) => (b + 1) % 1000);
  };

  if (!v) return <div className="text-center text-white/70 text-xl">准备中…</div>;
  const isShake = mode === "shake";

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* 全屏背景图(手机图)+ 轻暗罩保文字可读;-z 层不挡交互 */}
      {remoteBgUrl && (
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <img src={remoteBgUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}
      {v.myTeamId && myTeamColor && (
        <div className="rounded-full px-5 py-2 text-white font-bold text-lg text-center" style={{ background: myTeamColor }}>
          {v.myTeamName}
          {typeof v.myTeamRank === "number" && (
            <span className="ml-2 opacity-90 text-base">
              第 {v.myTeamRank} 名 · {v.myTeamScore ?? 0} 分
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-6 text-white">
        <div className="text-center">
          <div className="text-sm text-white/60">我的次数</div>
          <div className="text-4xl font-black tabular-nums" style={{ color: "var(--party-accent)" }}>{v.myCount}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-white/60">名次</div>
          <div className="text-4xl font-black tabular-nums">{v.myRank ?? "-"}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-white/60">剩余</div>
          <div className="text-4xl font-black tabular-nums">{secs(v.remainMs)}</div>
        </div>
      </div>

      <button
        type="button"
        onPointerDown={onInput}
        disabled={!running || !connected}
        className="select-none touch-manipulation w-64 h-64 rounded-full text-white text-3xl font-black shadow-2xl active:scale-95 transition-transform disabled:opacity-40"
        style={{ background: "radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--party-primary) 60%, white) 0%, var(--party-primary) 62%)", transform: `scale(${1 + (bump % 2) * 0.02})` }}
      >
        {v.status === "ready" && "等待开始"}
        {v.status === "countdown" && Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
        {v.status === "running" && (isShake ? "🤳 用力摇!" : "⚡ 用力冲!")}
        {v.status === "ended" && "本局结束"}
      </button>

      {/* 摇一摇模式:玩法提示 + 体感不可用时的点击兜底说明 */}
      {isShake && v.status === "running" && (
        <div className="text-center text-white/70 text-sm max-w-[16rem]">
          {shakeActive ? "🤳 摇得越猛,跑得越远!" : "用力摇动手机计数;若没反应,点上面圆圈也能冲"}
        </div>
      )}

      {v.status === "ended" && (
        <div className="text-center text-white text-xl">
          你第 <span className="font-black" style={{ color: "var(--party-accent)" }}>{v.myRank ?? "-"}</span> 名 · {v.myCount} 次
        </div>
      )}
    </div>
  );
}

// ─────────────────────── 配置(选主题 / 点缀色 / 上传替换素材)───────────────────────
type OvKey = "backdropFileId" | "trackFileId" | "podiumFileId" | "remoteBgFileId";
const OV_ROWS: { key: OvKey; label: string }[] = [
  { key: "backdropFileId", label: "看台背景" },
  { key: "trackFileId", label: "赛道" },
  { key: "podiumFileId", label: "领奖台" },
  { key: "remoteBgFileId", label: "手机背景" },
];

function RaceConfig({ value, onChange }: GameConfigProps) {
  const durationSec = Number(value.durationSec ?? 30);
  const theme = String(value.theme ?? "soccer");
  const accent = String(value.accent ?? "");
  const overrides = (value.overrides ?? {}) as RaceOverrides;
  const frames = value.frames as NumFrame[] | undefined;
  const [uploading, setUploading] = useState<string | null>(null);
  const [frameEditorOpen, setFrameEditorOpen] = useState(false);
  // 版式编辑器要在哪张领奖台图上对位:自定义上传 > 主题图(CSS 领奖台主题无图,不需要对位)
  const podiumUrl = overrides.podiumFileId ? interactiveFileUrl(overrides.podiumFileId) : getRaceTheme(theme).podium;

  const setOv = (patch: Partial<RaceOverrides>) => onChange({ ...value, overrides: { ...overrides, ...patch } });

  const upload = async (file: File, target: OvKey | "sprites") => {
    setUploading(target);
    try {
      const meta = await storageApi.upload(file, { ownerModule: "interactive", folder: "race-assets" });
      if (target === "sprites") setOv({ spriteFileIds: [...(overrides.spriteFileIds ?? []), meta.id].slice(0, 6) });
      else setOv({ [target]: meta.id });
      toast.success("已替换,记得点「保存」/创建");
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-gray-600">
          时长(秒)
          <input type="number" min={5} max={300} value={durationSec} onChange={(e) => onChange({ ...value, durationSec: Number(e.target.value) || 30 })} className="w-20 rounded-md border border-gray-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          主题
          <select value={theme} onChange={(e) => onChange({ ...value, theme: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1">
            {RACE_THEME_LIST.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          <input type="checkbox" checked={!!accent} onChange={(e) => onChange({ ...value, accent: e.target.checked ? "#22B573" : "" })} />
          自定义点缀色
        </label>
        {accent && <input type="color" value={accent} onChange={(e) => onChange({ ...value, accent: e.target.value })} />}
        {podiumUrl && (
          <button
            type="button"
            onClick={() => setFrameEditorOpen(true)}
            className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            领奖台版式编辑{frames ? "(已自定义)" : ""}
          </button>
        )}
      </div>

      {frameEditorOpen && podiumUrl && (
        <PodiumFrameEditor
          podiumUrl={podiumUrl}
          value={frames}
          avatarBehind={value.avatarBehind !== false}
          onConfirm={(f, behind) => {
            onChange({ ...value, frames: f, avatarBehind: behind });
            setFrameEditorOpen(false);
          }}
          onCancel={() => setFrameEditorOpen(false)}
        />
      )}

      <details className="rounded-md border border-gray-200 p-2">
        <summary className="cursor-pointer text-gray-600">自定义素材(上传替换,选填)</summary>
        <div className="mt-2 space-y-1.5">
          {OV_ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-2 flex-wrap">
              <span className="w-16 text-gray-500 text-xs">{r.label}</span>
              <label className="rounded-md border border-gray-300 px-2 py-0.5 text-xs cursor-pointer hover:bg-gray-50">
                {uploading === r.key ? "上传中…" : overrides[r.key] ? "更换" : "上传替换"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, r.key); e.target.value = ""; }} />
              </label>
              {overrides[r.key] ? (
                <button type="button" onClick={() => setOv({ [r.key]: undefined })} className="text-xs text-gray-400 hover:text-red-500">用默认</button>
              ) : (
                <span className="text-xs text-gray-300">主题默认</span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-16 text-gray-500 text-xs">跑者精灵</span>
            <label className="rounded-md border border-gray-300 px-2 py-0.5 text-xs cursor-pointer hover:bg-gray-50">
              {uploading === "sprites" ? "上传中…" : "追加上传"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "sprites"); e.target.value = ""; }} />
            </label>
            <span className="text-xs text-gray-400">
              {overrides.spriteFileIds?.length ? `已自定义 ${overrides.spriteFileIds.length} 个` : "主题默认"}
            </span>
            {overrides.spriteFileIds?.length ? (
              <button type="button" onClick={() => setOv({ spriteFileIds: [] })} className="text-xs text-gray-400 hover:text-red-500">清空</button>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

export const raceUi: GameUi = {
  type: "race", // 类型键不改(旧活动配置兼容),仅改显示名
  label: "快乐点点点",
  icon: "Trophy",
  hint: "限时狂点,跑者从左往右跑、点得多跑得远;可换主题(足球/霓虹…)、自定义素材;前3领奖台",
  rules:
    "🏃 个人赛:倒计时结束后疯狂点击屏幕 —— 点得越多,你的跑者在大屏赛道上冲得越靠前,前 8 名实时 PK,第一个撞线夺冠。\n👥 团体赛:先加入一个队伍,比的是全队所有人的点击总和,哪个队总分最高哪队夺冠(靠大家一起点)。",
  defaultConfig: { durationSec: 30, theme: "soccer", overrides: {}, accent: "" },
  // 本游戏默认「进行中」= 世界杯主题曲(其他槽位仍用全局内置默认)
  defaultSounds: { playing: playingWorldcupMp3 },
  Screen: RaceScreen,
  Remote: RaceRemote,
  Config: RaceConfig,
};
