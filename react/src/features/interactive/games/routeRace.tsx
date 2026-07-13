import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { interactiveFileUrl, type GroupingConfig } from "../api";
import { type GameConfigProps, type GameRemoteProps, type GameScreenProps, type GameUi } from "./types";
import { type FramePos } from "./raceThemes";
import { type NumFrame } from "./raceFrameEditor";
import { ImagePodium, CssPodium, TeamRosterBoard, type PodiumEntry } from "./race";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { AutoScrollGrid } from "../components/AutoScrollGrid";
import { type RosterPlayer } from "../useRoom";
import { pointAtT, type RoutePoint } from "../lib/routeMath";
import { getCheckpointUi } from "../checkpoints/registry";
import { type CheckpointChallenge } from "../checkpoints/types";
import { designApi } from "../designer/designApi";
import { parseDesign } from "../designer/designTypes";

/**
 * 自制闯关赛(route_race)—— 互动游戏编辑器产物的运行时:
 * 大屏 = 报名页 / 倒计时 / 背景图+路线上人物行进+关卡记号 / 颁奖(复用 race 领奖台);
 * 手机 = 连点(200ms 合批 + isPrimary,与快乐点点点同管线)+ 撞关切「作答卡」(关卡注册表 Play);
 * 配置 = 轻量(设计快照的时长/总步数直改 + 去编辑器 + 重新同步设计)。
 * 服务端权威:判定/退步/排名全在后端 route-race.game.ts;手机只发意图。
 */

const MAX_LANES = 8; // 个人赛大屏最多同时显示前 8 名(照 race)

interface BoardView {
  backgroundFileId?: string;
  bgSize?: { w: number; h: number };
  route: RoutePoint[];
  sprites: string[];
  spriteSizePct: number;
  checkpoints: { id: string; kind: string; t: number; title?: string }[];
}
interface RacerRow {
  key: string;
  name: string;
  teamId: string | null;
  steps: number;
  finishedAt: number | null;
  rank: number;
  blocked: boolean;
  blockedKind?: string;
  avatarDeviceId: string | null;
  memberCount?: number;
}
interface RRView {
  status: "ready" | "countdown" | "running" | "ended";
  durationSec: number;
  countdownRemainMs: number;
  remainMs: number;
  playerCount: number;
  racerCount: number;
  totalSteps: number;
  teamMode: boolean;
  board: BoardView;
  lobby: { backgroundFileId?: string; title?: string };
  award: { podiumFileId?: string; frames?: NumFrame[]; avatarBehind?: boolean };
  racers: RacerRow[];
}
interface RRRemoteView {
  status: "ready" | "countdown" | "running" | "ended";
  countdownRemainMs: number;
  remainMs: number;
  totalSteps: number;
  mySteps: number;
  myRank: number | null;
  myFinishedAt: number | null;
  myTaps: number;
  myTeamId: string | null;
  myTeamName: string | null;
  playerCount: number;
  racerCount: number;
  challenge: CheckpointChallenge | null;
  lastResult: { nonce: number; correct: boolean; by: string; at: number; penalty?: number } | null;
  remoteBgFileId?: string;
}

function secs(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}
function colorOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 46%)`;
}
/** racer 稳定取精灵:key 哈希取模(跨帧不换装;团队按队序) */
function spriteIdxOf(key: string, len: number): number {
  if (len <= 0) return 0;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % len;
}
function framesFromNums(nums: NumFrame[] | undefined): FramePos[] | null {
  if (!nums || nums.length < 3) return null;
  return nums.slice(0, 3).map((f) => ({
    av: { left: `${f.ax}%`, top: `${f.ay}%`, size: `${f.as}%` },
    nm: { left: `${f.nx}%`, top: `${f.ny}%` },
  }));
}
const FALLBACK_FRAMES: FramePos[] = [
  { av: { left: "50%", top: "32%", size: "23%" }, nm: { left: "50%", top: "53%" } },
  { av: { left: "20%", top: "50%", size: "16%" }, nm: { left: "20%", top: "63%" } },
  { av: { left: "80%", top: "52%", size: "18%" }, nm: { left: "80%", top: "66%" } },
];

// ─────────────────────── 大屏 ───────────────────────
function RouteRaceScreen({ view, roster, grouping, roomCode, joinQr }: GameScreenProps) {
  const v = view as RRView | null;
  if (!v) return null;
  const teamColor = (id?: string | null) => (id && grouping?.teams.find((t) => t.id === id)?.color) || null;
  const avatarByDevice = new Map(roster.map((p) => [p.deviceId, p.avatar]));
  const avatarOf = (deviceId: string | null) => (deviceId ? avatarByDevice.get(deviceId) ?? null : null);

  if (v.status === "ready") {
    return <Registration v={v} roster={roster} grouping={grouping} roomCode={roomCode} joinQr={joinQr} />;
  }

  const board = v.board;
  const ratioNum = board.bgSize ? board.bgSize.w / board.bgSize.h : 16 / 9;
  const bgUrl = board.backgroundFileId ? interactiveFileUrl(board.backgroundFileId) : null;
  const route = board.route;
  const points = route.map((p) => `${p.x},${p.y}`).join(" ");

  // 上场的 racer:团队=全部(≤12 队);个人=前 MAX_LANES 名(key 排序稳定,防同 rank 抖动换位)
  const shown = (v.teamMode ? v.racers : v.racers.filter((r) => r.rank <= MAX_LANES).slice(0, MAX_LANES)).slice();
  shown.sort((a, b) => a.key.localeCompare(b.key));
  const podiumRacers = [...v.racers].sort((a, b) => a.rank - b.rank);
  const toEntry = (r: RacerRow): PodiumEntry => ({
    key: r.key,
    name: r.name,
    score: r.steps,
    rank: r.rank,
    avatar: avatarOf(r.avatarDeviceId),
    color: teamColor(r.teamId) ?? colorOf(r.key),
  });
  const podiumEntries = podiumRacers.slice(0, 3).map(toEntry);
  const restEntries = podiumRacers.slice(3, MAX_LANES).map(toEntry);
  const podiumUrl = v.award.podiumFileId ? interactiveFileUrl(v.award.podiumFileId) : null;
  const podiumFrames = framesFromNums(v.award.frames) ?? FALLBACK_FRAMES;

  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center bg-black">
      {/* 游戏画板:与编辑器同一 aspect-ratio 容器(bgSize),路线/关卡 % 坐标跨屏不变形 */}
      <div className="relative" style={{ aspectRatio: `${ratioNum}`, width: `min(100%, calc(100vh * ${ratioNum}))` }}>
        {bgUrl ? (
          <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#241a3a,#0b0b12)" }} />
        )}

        {/* 路线(淡虚线,给观众指路) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {route.length >= 2 && (
            <>
              <polyline points={points} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={points} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} strokeDasharray="10 8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
        </svg>

        {/* 关卡记号 */}
        {route.length >= 2 &&
          board.checkpoints.map((cp) => {
            const pos = pointAtT(route, cp.t);
            const ui = getCheckpointUi(cp.kind);
            return (
              <div
                key={cp.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full ring-2 ring-white/85 shadow-lg"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: "clamp(22px, 2.6vw, 44px)", aspectRatio: "1", background: cp.kind === "quiz" ? "#3B82F6" : "#E23B3B", fontSize: "clamp(12px, 1.4vw, 24px)" }}
                title={cp.title}
              >
                {ui?.icon}
              </div>
            );
          })}

        {/* 终点旗 */}
        {route.length >= 2 && (
          <div className="absolute -translate-x-1/4 -translate-y-full pointer-events-none drop-shadow" style={{ left: `${route[route.length - 1].x}%`, top: `${route[route.length - 1].y}%`, fontSize: "clamp(20px,2.6vw,44px)" }}>
            🏁
          </div>
        )}

        {/* 人物沿路线行进(个人=前8;团队=每队一角色) */}
        {route.length >= 2 &&
          v.status !== "ended" &&
          shown.map((r) => {
            const pos = pointAtT(route, Math.min(1, r.steps / Math.max(1, v.totalSteps)));
            const col = teamColor(r.teamId) ?? colorOf(r.key);
            const spriteUrl = board.sprites.length ? interactiveFileUrl(board.sprites[spriteIdxOf(r.key, board.sprites.length)]) : null;
            return (
              <div
                key={r.key}
                className="absolute flex flex-col items-center pointer-events-none"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${board.spriteSizePct}%`, transform: "translate(-50%, -92%)", transition: "left 0.4s linear, top 0.4s linear" }}
              >
                <div className="mb-0.5 rounded px-1.5 text-white font-bold whitespace-nowrap drop-shadow" style={{ background: `${col}dd`, fontSize: "clamp(10px, 1.1vw, 18px)" }}>
                  {r.blocked ? `${getCheckpointUi(r.blockedKind)?.icon ?? "❓"} ` : ""}
                  {r.name} · {r.steps}
                  {r.finishedAt !== null ? " 🏁" : ""}
                  {v.teamMode && r.memberCount ? ` (${r.memberCount}人)` : ""}
                </div>
                {spriteUrl ? (
                  <img src={spriteUrl} alt="" className="w-full h-auto drop-shadow-xl" draggable={false} style={r.blocked ? { filter: "grayscale(0.4) drop-shadow(0 0 8px #fff)" } : undefined} />
                ) : (
                  <div className="drop-shadow-xl" style={{ fontSize: "clamp(18px, 2.4vw, 44px)" }}>{r.blocked ? "🤔" : "🏃"}</div>
                )}
              </div>
            );
          })}

        {/* 倒计时 */}
        {v.status === "countdown" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35">
            <div className="text-3xl text-white/85 mb-2">准备</div>
            <div className="text-[12rem] leading-none font-black animate-pulse" style={{ color: "var(--party-accent)" }}>
              {Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
            </div>
          </div>
        )}

        {/* 计时 + 实时榜 */}
        {v.status === "running" && (
          <>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 font-black tabular-nums text-white drop-shadow-lg" style={{ fontSize: "clamp(28px,4.5vw,72px)" }}>
              {secs(v.remainMs)}
            </div>
            <div className="absolute top-2 right-2 rounded-lg bg-black/45 backdrop-blur px-2.5 py-1.5 space-y-0.5 max-w-[24%]">
              {podiumRacers.slice(0, 8).map((r) => (
                <div key={r.key} className="flex items-center gap-1.5 text-white whitespace-nowrap" style={{ fontSize: "clamp(10px,1vw,16px)" }}>
                  <span className="font-black w-5 text-right shrink-0" style={{ color: r.rank <= 3 ? "var(--party-accent)" : undefined }}>{r.rank}</span>
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto tabular-nums opacity-85 shrink-0">{r.finishedAt !== null ? "🏁" : r.blocked ? "答题中" : r.steps}</span>
                </div>
              ))}
            </div>
            {!v.teamMode && v.racerCount > MAX_LANES && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1 text-white/90 whitespace-nowrap backdrop-blur" style={{ fontSize: "clamp(10px,1.1vw,16px)" }}>
                画面仅显示前 {MAX_LANES} 名 · 其余 {v.racerCount - MAX_LANES} 位请在手机上看进度
              </div>
            )}
          </>
        )}

        {/* 颁奖(场景③:复用 race 领奖台组件 + 编辑器版式) */}
        {v.status === "ended" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-4">
            <div className="text-white font-black mb-1" style={{ fontSize: "clamp(20px,2.6vw,44px)" }}>
              🏆 {v.teamMode ? "团队总排名" : "最终排名"}
            </div>
            {podiumUrl ? (
              <ImagePodium podiumUrl={podiumUrl} frames={podiumFrames} entries={podiumEntries} avatarBehind={v.award.avatarBehind !== false} />
            ) : (
              <CssPodium entries={podiumEntries} />
            )}
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
    </div>
  );
}

/** 场景①报名页(编辑器 lobby 段驱动):背景 + 标题 + 二维码 + 头像墙/分组看板 */
function Registration({
  v,
  roster,
  grouping,
  roomCode,
  joinQr,
}: {
  v: RRView;
  roster: RosterPlayer[];
  grouping: GroupingConfig | null;
  roomCode: string;
  joinQr: string | null;
}) {
  const players = roster.filter((p) => p.connected);
  const teamMode = grouping?.mode === "teams" && grouping.teams.length > 0;
  const lobbyBg = v.lobby.backgroundFileId ? interactiveFileUrl(v.lobby.backgroundFileId) : null;
  const boardBg = v.board.backgroundFileId ? interactiveFileUrl(v.board.backgroundFileId) : null;
  const teamColor = (p: { deviceId: string; teamId?: string | null }) =>
    (p.teamId && grouping?.teams.find((t) => t.id === p.teamId)?.color) || colorOf(p.deviceId);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {lobbyBg ? (
        <img src={lobbyBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : boardBg ? (
        <img src={boardBg} alt="" className="absolute inset-0 w-full h-full object-cover blur-md scale-110" />
      ) : (
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#241a3a,#0b0b12)" }} />
      )}
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-6 rounded-3xl border-4 pointer-events-none" style={{ borderColor: "var(--party-accent)", boxShadow: "inset 0 0 40px rgba(245,166,35,0.3)" }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[6%]">
        <div className="text-4xl font-black mb-5 drop-shadow-lg" style={{ color: "var(--party-accent)" }}>
          🚩 {v.lobby.title || "扫码报名参赛"}
          {teamMode ? " · 分组对抗" : ""}
        </div>
        <div className="flex items-center gap-10 flex-wrap justify-center">
          <div className="flex flex-col items-center rounded-2xl bg-white/95 p-4 shadow-2xl">
            {joinQr ? <img src={joinQr} alt="报名二维码" className="w-48 h-48" /> : <div className="w-48 h-48" />}
            <div className="text-gray-600 mt-2 text-sm">扫码上场</div>
            <div className="text-3xl font-black tracking-[0.25em]" style={{ color: "var(--party-primary)" }}>{roomCode}</div>
            {teamMode && (
              <div className="text-gray-500 mt-1 text-xs text-center">{grouping!.assign === "auto" ? "系统自动分队" : "手机上选择队伍"}</div>
            )}
          </div>
          <div>
            <div className="text-white text-2xl mb-3 drop-shadow">
              已报名 <span className="font-black" style={{ color: "var(--party-accent)" }}>{players.length}</span> 人
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
                      <PlayerAvatar avatar={p.avatar} name={p.nickname} color={teamColor(p)} className="ring-2 ring-white/70" style={{ width: "3rem", height: "3rem", fontSize: "1.2rem" }} />
                      <div className="text-white text-xs mt-1 truncate w-full text-center drop-shadow">{p.nickname}</div>
                    </div>
                  ))}
                  {players.length === 0 && <div className="text-white/70 text-xl">等待扫码报名…</div>}
                </div>
              </AutoScrollGrid>
            )}
          </div>
        </div>
        <div className="text-white/70 mt-6 text-lg drop-shadow">连点前进,撞关答题;答对通过,答错退步 —— 先冲终点者胜 🏁</div>
      </div>
    </div>
  );
}

// ─────────────────────── 手机 ───────────────────────
function RouteRaceRemote({ view, connected, sendAction, grouping }: GameRemoteProps) {
  const v = view as RRRemoteView | null;
  const pendingRef = useRef(0);
  const [bump, setBump] = useState(0);
  // 已提交的题目身份(cpId:nonce)。3s 未有服务端推进自动解禁允许重交 —— 服务端答案处理幂等
  // (重复正确答案被闸1丢弃/旧 nonce 被闸3丢弃),重交无害;不设超时的话,答案消息在弱网丢失
  // 或「再来一局」后同 cpId+nonce 重现时,按钮会永久锁死在「等待判定」(对抗审查抓到)。
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const myTeamColor = v?.myTeamId ? grouping?.teams.find((t) => t.id === v.myTeamId)?.color ?? null : null;
  const remoteBgUrl = v?.remoteBgFileId ? interactiveFileUrl(v.remoteBgFileId) : null;
  const running = v?.status === "running";
  const challenge = running ? v?.challenge ?? null : null;

  // 连点 200ms 合批上报(与快乐点点点同管线;服务端另有 400ms 广播节流 + 15次/秒权威限速)
  useEffect(() => {
    const t = setInterval(() => {
      if (pendingRef.current > 0) {
        sendAction({ kind: "tap", n: pendingRef.current });
        pendingRef.current = 0;
      }
    }, 200);
    return () => clearInterval(t);
  }, [sendAction]);

  const onTap = (e: React.PointerEvent) => {
    if (!running) return;
    if (!e.isPrimary) return; // 只认主触点(多指同拍只算 1 次)
    pendingRef.current += 1;
    setBump((b) => (b + 1) % 1000);
  };

  // 提交超时解禁(effect 只做延时清除,可见性由渲染期 challengeKey 对比派生)
  useEffect(() => {
    if (!submittedKey) return;
    const t = setTimeout(() => setSubmittedKey(null), 3000);
    return () => clearTimeout(t);
  }, [submittedKey]);

  if (!v) return <div className="text-center text-white/70 text-xl">准备中…</div>;
  const finished = v.myFinishedAt !== null;
  const progressPct = Math.min(100, Math.round((v.mySteps / Math.max(1, v.totalSteps)) * 100));
  // 答案发出后禁点,直到服务端推进(换题/解锁)或 3s 超时;答案**立即上报不合批**
  const challengeKey = challenge ? `${challenge.cpId}:${challenge.nonce}` : null;
  const answerDisabled = challengeKey !== null && submittedKey === challengeKey;

  return (
    <div className="w-full flex flex-col items-center gap-5">
      {remoteBgUrl && (
        <div className="fixed inset-0 -z-10 pointer-events-none">
          <img src={remoteBgUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {v.myTeamId && myTeamColor && (
        <div className="rounded-full px-5 py-1.5 text-white font-bold text-base" style={{ background: myTeamColor }}>
          {v.myTeamName} · 全队一起冲
        </div>
      )}

      {/* 进度条 + 数据行 */}
      <div className="w-full max-w-[20rem]">
        <div className="flex items-center justify-between text-white/80 text-sm mb-1">
          <span>
            进度 <b className="tabular-nums" style={{ color: "var(--party-accent)" }}>{v.mySteps}</b>/{v.totalSteps}
          </span>
          <span>名次 <b className="tabular-nums">{v.myRank ?? "-"}</b></span>
          <span>剩余 <b className="tabular-nums">{secs(v.remainMs)}s</b></span>
        </div>
        <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: "var(--party-accent)" }} />
        </div>
      </div>

      <ResultBanner lastResult={v.lastResult} teamMode={!!v.myTeamId} />

      {/* 撞关:切作答卡(关卡注册表 Play;答案立即上报) */}
      {challenge ? (
        <div className="w-full max-w-[20rem] rounded-2xl bg-black/35 backdrop-blur p-4 space-y-2">
          <div className="flex items-center justify-between text-white/85 text-sm">
            <span className="font-bold">
              {getCheckpointUi(challenge.kind)?.icon} {challenge.title || getCheckpointUi(challenge.kind)?.label} —— 过关才能继续!
            </span>
            <span className="text-white/60 shrink-0">{challenge.penaltySteps > 0 ? `答错退${challenge.penaltySteps}步` : "答错原地重答"}</span>
          </div>
          {(() => {
            const ui = getCheckpointUi(challenge.kind);
            if (!ui) return null;
            const Play = ui.Play;
            return (
              <Play
                key={`${challenge.cpId}-${challenge.nonce}`}
                challenge={challenge}
                disabled={answerDisabled || !connected}
                submit={(payload) => {
                  setSubmittedKey(`${challenge.cpId}:${challenge.nonce}`);
                  sendAction({ kind: "answer", cpId: challenge.cpId, nonce: challenge.nonce, ...payload });
                }}
              />
            );
          })()}
          {answerDisabled && <div className="text-center text-white/60 text-xs">已提交,等待判定…</div>}
        </div>
      ) : finished ? (
        <div className="text-center text-white space-y-2 py-6">
          <div className="text-5xl">🏁</div>
          <div className="text-2xl font-black">已冲线!</div>
          <div className="text-lg">
            当前第 <span className="font-black" style={{ color: "var(--party-accent)" }}>{v.myRank ?? "-"}</span> 名
          </div>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={onTap}
          disabled={!running || !connected}
          className="select-none touch-manipulation w-60 h-60 rounded-full text-white text-3xl font-black shadow-2xl active:scale-95 transition-transform disabled:opacity-40"
          style={{
            background: "radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--party-primary) 60%, white) 0%, var(--party-primary) 62%)",
            transform: `scale(${1 + (bump % 2) * 0.02})`,
          }}
        >
          {v.status === "ready" && "等待开始"}
          {v.status === "countdown" && Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
          {v.status === "running" && "⚡ 连点前进!"}
          {v.status === "ended" && "本局结束"}
        </button>
      )}

      {v.status === "ended" && (
        <div className="text-center text-white text-xl">
          你{finished ? "冲线" : "走了 " + v.mySteps + " 步"} · 第{" "}
          <span className="font-black" style={{ color: "var(--party-accent)" }}>{v.myRank ?? "-"}</span> 名
        </div>
      )}
    </div>
  );
}

/** 答题结果反馈条:可见性渲染期派生(新结果即显),effect 只负责 3.5s 后收起。
 *  去重键用 nonce:at 复合 —— 「再来一局」后 nonce 从头计,单用 nonce 会把新局首次反馈误吞。 */
function ResultBanner({
  lastResult,
  teamMode,
}: {
  lastResult: RRRemoteView["lastResult"];
  teamMode: boolean;
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const key = lastResult ? `${lastResult.nonce}:${lastResult.at}` : null;
  useEffect(() => {
    if (key === null) return;
    const t = setTimeout(() => setDismissedKey(key), 3500);
    return () => clearTimeout(t);
  }, [key]);
  if (!lastResult || dismissedKey === key) return null;
  return lastResult.correct ? (
    <div className="rounded-full bg-green-600/90 px-4 py-1.5 text-white text-sm font-bold">
      ✅ {teamMode ? `「${lastResult.by}」答对,全队通过!` : "答对了,继续冲!"}
    </div>
  ) : (
    <div className="rounded-full bg-red-600/90 px-4 py-1.5 text-white text-sm font-bold">
      ❌ {teamMode ? `「${lastResult.by}」` : ""}答错了
      {lastResult.penalty ? `,退回 ${lastResult.penalty} 步` : ""},重新挑战!
    </div>
  );
}

// ─────────────────────── 配置(节目级,轻量;完整编辑去编辑器) ───────────────────────
function RouteRaceConfig({ value, onChange }: GameConfigProps) {
  const designId = typeof value.designId === "string" ? value.designId : "";
  const designName = typeof value.designName === "string" ? value.designName : "";
  const board = (value.board ?? {}) as { route?: unknown[]; checkpoints?: { t?: number }[]; totalSteps?: number };
  const durationSec = Number(value.durationSec ?? 120);
  const totalSteps = Number(board.totalSteps ?? 100);
  const [syncing, setSyncing] = useState(false);
  // 与后端 computeGates 同口径:总步数调小会把挤出终点的关卡**永久剔除出快照**,提前算出来亮警告
  const droppedCps = (() => {
    const ts = (Array.isArray(board.checkpoints) ? board.checkpoints : [])
      .map((c) => Number(c?.t) || 0)
      .sort((a, b) => a - b);
    let last = 0;
    let dropped = 0;
    for (const t of ts) {
      let gate = Math.min(totalSteps, Math.max(1, Math.round(t * totalSteps)));
      if (gate <= last) gate = last + 1;
      if (gate > totalSteps) dropped++;
      last = gate;
    }
    return dropped;
  })();

  const resync = async () => {
    if (!designId) return;
    setSyncing(true);
    try {
      const row = await designApi.get(designId);
      const design = parseDesign(row.configJson) as unknown as Record<string, unknown>;
      // 保留 design.sound:草稿流(建活动/添加节目)里 config 是音效的唯一载体;
      // 已存节目的 GameEditor 保存时 {...cfg, sound} 会用外层音效覆盖,带着无害
      onChange({ ...design, designId, designName: row.name });
      toast.success("已同步最新设计;记得保存(已存节目的音效以节目设置为准)");
    } catch {
      toast.error("同步失败(设计可能已被删除)");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded bg-party-soft px-2 py-0.5 text-xs text-[var(--party-primary)] font-semibold">
          🎮 {designName || "自制游戏"}
        </span>
        <span className="text-xs text-gray-400">
          路线 {Array.isArray(board.route) ? board.route.length : 0} 点 · 关卡 {Array.isArray(board.checkpoints) ? board.checkpoints.length : 0} 个
        </span>
        {designId && (
          <>
            <Link to={`/admin/interactive/designer/${designId}`} className="text-xs text-[var(--party-primary)] hover:underline">
              去编辑器修改设计 →
            </Link>
            <button type="button" onClick={() => void resync()} disabled={syncing} className="text-xs text-gray-500 hover:text-[var(--party-primary)] disabled:opacity-50">
              {syncing ? "同步中…" : "重新同步设计"}
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-gray-600">
          时长(秒)
          <input
            type="number"
            min={5}
            max={1800}
            value={durationSec}
            onChange={(e) => onChange({ ...value, durationSec: Number(e.target.value) || 120 })}
            className="w-20 rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          总步数
          <input
            type="number"
            min={10}
            max={2000}
            value={totalSteps}
            onChange={(e) => onChange({ ...value, board: { ...(value.board as object), totalSteps: Number(e.target.value) || 100 } })}
            className="w-24 rounded-md border border-gray-300 px-2 py-1"
          />
        </label>
      </div>
      {droppedCps > 0 && (
        <div className="text-xs text-red-500 font-semibold">
          ⚠ 当前总步数下有 {droppedCps} 个关卡挤不进路线,保存后将被永久剔除 —— 请增大总步数或去编辑器调整关卡位置
        </div>
      )}
      <div className="text-[11px] text-gray-400">
        本节目是设计的快照:编辑器里改设计不影响已添加节目,需要时点「重新同步设计」;路线/关卡/背景请在编辑器改
      </div>
    </div>
  );
}

export const routeRaceUi: GameUi = {
  type: "route_race",
  label: "自制闯关赛",
  icon: "Map",
  hint: "编辑器自制:连点沿路线前进,撞关手机答题/找错,答对过关答错退步,时限内冲终点",
  rules:
    "🏃 个人赛:疯狂点击推进你的角色沿路线前进,撞到关卡会被拦下 —— 在手机上答题/找错,答对通过、答错退步重新挑战,先冲过终点者胜(时间到按进度排名)。\n👥 团体赛:全队点击共同推进一个角色,撞关后全队手机同题,谁先答对全队通过 —— 齐心协力最快冲线!",
  hidden: true, // 不进「添加节目」游戏类型裸列 —— 从「自制游戏库」带设计添加(防空配置节目)
  defaultConfig: {},
  Screen: RouteRaceScreen,
  Remote: RouteRaceRemote,
  Config: RouteRaceConfig,
};
