import { useEffect, useState } from "react";
import {
  type GameConfigProps,
  type GameHostPanelProps,
  type GameRemoteProps,
  type GameScreenProps,
  type GameUi,
} from "./types";
import { CssPodium, TeamRosterBoard, type PodiumEntry } from "./race";
import { AutoScrollGrid } from "../components/AutoScrollGrid";
import { PlayerAvatar } from "../components/PlayerAvatar";

/**
 * 抢答器(buzzer)—— 与后端 buzzer.game.ts 对称的展示侧。
 * 状态词汇表:status(ready/countdown/running/ended,基座音效/锁定契约)+ sub(题内阶段
 * reading 读题抢跳窗口 / open 开抢 / locked 已抢到待判定 / idle 本题完等下一题)。
 * 首个使用 GameUi.HostPanel 契约位的游戏:开抢/判对错/下一题等主持动作在专属面板发 host:control。
 */

interface TeamRow {
  teamId: string;
  name: string;
  score: number;
  rank: number;
  memberCount: number;
  topDeviceId: string | null;
}
interface JudgeResult {
  roundNo: number;
  kind: "correct" | "wrong" | "buzz";
  nickname: string;
  teamName: string | null;
  points: number;
  reactionMs: number | null;
  at: number;
}
/** projectScreen 投影(主持面板也消费它 —— host 端收不到 remote:state) */
interface BuzzerScreenView {
  status: "ready" | "countdown" | "running" | "ended";
  sub: "reading" | "open" | "locked" | "idle";
  roundNo: number;
  scoring: "judge" | "buzz";
  pointsCorrect: number;
  pointsWrong: number;
  wrongReopen: boolean;
  countdownSec: number;
  foulScope: "player" | "team";
  foulLockNextRound: boolean;
  countdownRemainMs: number;
  playerCount: number;
  hasTeams: boolean;
  teams: TeamRow[];
  leaderboard: { deviceId: string; nickname: string; score: number; rank: number; teamId?: string | null }[];
  winner: { deviceId: string; nickname: string; teamId: string | null; teamName: string | null; reactionMs: number } | null;
  lateBuzzes: { nickname: string; teamName: string | null; deltaMs: number }[];
  fouls: { nickname: string; teamName: string | null }[];
  excludedCount: number;
  lastJudge: JudgeResult | null;
}
/** projectRemote 投影 */
interface BuzzerRemoteView {
  status: "ready" | "countdown" | "running" | "ended";
  sub: "reading" | "open" | "locked" | "idle";
  roundNo: number;
  scoring: "judge" | "buzz";
  countdownRemainMs: number;
  openedAt: number | null;
  myScore: number;
  myRank: number | null;
  myWins: number;
  myFouls: number;
  myTeamId: string | null;
  myTeamName: string | null;
  myTeamScore: number | null;
  myTeamRank: number | null;
  iWon: boolean;
  winnerIsMyTeam: boolean;
  winnerName: string | null;
  winnerReactionMs: number | null;
  lockedUntilRound: number | null;
  amExcluded: boolean;
  lastJudge: JudgeResult | null;
  playerCount: number;
}

const PRIMARY = "var(--party-primary)";
const ACCENT = "var(--party-accent)";

function colorOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 46%)`;
}

function fmtReaction(ms: number): string {
  return `${(ms / 1000).toFixed(2)} 秒`;
}

/** 判罚规则一句话(大屏 ready 页/手机规则提示共用) */
function foulRuleText(v: Pick<BuzzerScreenView, "foulScope" | "foulLockNextRound">): string {
  const scope = v.foulScope === "team" ? "整队" : "本人";
  const range = v.foulLockNextRound ? "本题+下一题禁抢" : "本题禁抢";
  return `开抢前按下算抢跳:${scope}${range}`;
}

function judgeText(j: JudgeResult): string {
  const who = j.teamName ? `${j.teamName} · ${j.nickname}` : j.nickname;
  if (j.kind === "correct") return `✅ ${who} 答对 +${j.points}`;
  if (j.kind === "wrong") return j.points < 0 ? `❌ ${who} 答错 ${j.points}` : `❌ ${who} 答错`;
  return `🔔 ${who} 抢到 +${j.points}`;
}

// ─────────────────────── 大屏 ───────────────────────

/** 计分榜(队伍条+个人条,照 tapRace 渐变条;分数可为负 → 条宽按 max(0,score) 算) */
function ScoreBoard({ v, grouping }: { v: BuzzerScreenView; grouping: GameScreenProps["grouping"] }) {
  const teamColor = (id?: string | null) => (id && grouping?.teams.find((t) => t.id === id)?.color) || "#888";
  const teamMode = v.hasTeams && v.teams.length > 0;
  const maxTeam = Math.max(1, ...v.teams.map((t) => t.score));
  const maxScore = Math.max(1, ...v.leaderboard.map((r) => r.score));
  return (
    <div className="w-full flex flex-col gap-4">
      {teamMode && (
        <div className="flex flex-col gap-3">
          {v.teams.map((t) => (
            <div key={t.teamId} className="flex items-center gap-4">
              <div className="w-10 text-right text-2xl font-black text-white/80 tabular-nums">{t.rank}</div>
              <div className="flex-1 h-12 rounded-2xl bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-2xl transition-all duration-200 flex items-center px-4"
                  style={{
                    width: `${Math.max(12, (Math.max(0, t.score) / maxTeam) * 100)}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${teamColor(t.teamId)} 75%, #333), ${teamColor(t.teamId)})`,
                  }}
                >
                  <span className="text-white text-xl font-black truncate drop-shadow">{t.name}</span>
                  <span className="text-white/70 text-xs ml-3">{t.memberCount}人</span>
                </div>
              </div>
              <div className="w-20 text-2xl font-black text-white tabular-nums">{t.score}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {teamMode && <div className="text-white/50 text-sm">个人榜</div>}
        {v.leaderboard.slice(0, teamMode ? 5 : 8).map((r) => (
          <div key={r.deviceId} className="flex items-center gap-4">
            <div className="w-10 text-right text-lg font-bold text-white/80 tabular-nums">{r.rank}</div>
            <div className={`flex-1 rounded-full bg-white/10 overflow-hidden ${teamMode ? "h-7" : "h-9"}`}>
              <div
                className="h-full rounded-full transition-all duration-200 flex items-center px-4"
                style={{
                  width: `${Math.max(8, (Math.max(0, r.score) / maxScore) * 100)}%`,
                  background: r.teamId
                    ? `linear-gradient(90deg, color-mix(in srgb, ${teamColor(r.teamId)} 60%, #222), ${teamColor(r.teamId)})`
                    : `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})`,
                }}
              >
                <span className="text-white font-semibold truncate drop-shadow">{r.nickname}</span>
              </div>
            </div>
            <div className={`text-white font-black tabular-nums ${teamMode ? "w-14 text-base" : "w-16 text-xl"}`}>
              {r.score}
            </div>
          </div>
        ))}
        {v.leaderboard.length === 0 && <div className="text-center text-white/50 text-lg py-4">暂无得分</div>}
      </div>
    </div>
  );
}

function BuzzerScreen({ view, roster, grouping, roomCode, joinQr, lastEvent }: GameScreenProps) {
  const v = view as BuzzerScreenView | null;
  // 抢到/抢跳瞬间 splash:事件即时到达(状态合批 ≤400ms 后跟上),1.6s 后自动收起;
  // 可见性渲染期派生(dismissedSeq 对比),effect 只做延时收起(照 routeRace ResultBanner)
  const ev =
    lastEvent && (lastEvent.kind === "buzz:won" || lastEvent.kind === "buzz:foul") ? lastEvent : null;
  const evSeq = ev ? ev.seq : null;
  const [dismissedSeq, setDismissedSeq] = useState<number | null>(null);
  useEffect(() => {
    if (evSeq === null) return;
    const t = setTimeout(() => setDismissedSeq(evSeq), 1600);
    return () => clearTimeout(t);
  }, [evSeq]);
  const flash = ev && dismissedSeq !== ev.seq ? ev : null;

  if (!v) return <div className="text-white/70 text-3xl">准备中…</div>;

  const teamMode = v.hasTeams || (grouping?.mode === "teams" && grouping.teams.length > 0);
  const teamColorOf = (id?: string | null) => (id && grouping?.teams.find((t) => t.id === id)?.color) || null;
  const avatarByDevice = new Map(roster.map((p) => [p.deviceId, p.avatar]));
  const avatarOf = (deviceId: string | null) => (deviceId ? avatarByDevice.get(deviceId) ?? null : null);
  const players = roster.filter((p) => p.connected);
  const flashPayload = flash ? (flash.payload as { nickname?: string; teamName?: string | null } | undefined) : undefined;

  // ready:标题 + 入场二维码 + 花名册 + 规则
  if (v.status === "ready") {
    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="text-6xl font-black text-white mb-3">🔔 抢答器</div>
          <div className="text-xl text-white/70">
            {v.scoring === "judge" ? `答对 +${v.pointsCorrect}${v.pointsWrong > 0 ? ` · 答错 −${v.pointsWrong}` : ""}` : "抢到即得分"}
            {" · "}
            {foulRuleText(v)}
          </div>
        </div>
        <div className="flex items-start gap-10 flex-wrap justify-center">
          <div className="flex flex-col items-center rounded-2xl bg-white/95 p-4 shadow-2xl">
            {joinQr ? <img src={joinQr} alt="入场二维码" className="w-44 h-44" /> : <div className="w-44 h-44" />}
            <div className="text-gray-600 mt-2 text-sm">扫码上场</div>
            <div className="text-3xl font-black tracking-[0.25em]" style={{ color: PRIMARY }}>
              {roomCode}
            </div>
          </div>
          <div>
            <div className="text-white text-2xl mb-3 drop-shadow">
              已就位 <span className="font-black" style={{ color: ACCENT }}>{players.length}</span> 人 · 等待主持人开始
            </div>
            {teamMode && grouping ? (
              <AutoScrollGrid className="max-w-[56vw] max-h-[48vh]">
                <TeamRosterBoard grouping={grouping} players={players} />
              </AutoScrollGrid>
            ) : (
              <AutoScrollGrid className="max-w-[44vw] max-h-[44vh]">
                <div className="flex flex-wrap gap-3 content-start">
                  {players.map((p) => (
                    <div key={p.deviceId} className="flex flex-col items-center w-16">
                      <PlayerAvatar
                        avatar={p.avatar}
                        name={p.nickname}
                        color={teamColorOf(p.teamId) ?? colorOf(p.deviceId)}
                        className="ring-2 ring-white/70"
                        style={{ width: "3rem", height: "3rem", fontSize: "1.2rem" }}
                      />
                      <div className="text-white text-xs mt-1 truncate w-full text-center drop-shadow">{p.nickname}</div>
                    </div>
                  ))}
                  {players.length === 0 && <div className="text-white/70 text-xl">等待扫码入场…</div>}
                </div>
              </AutoScrollGrid>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ended:总榜领奖台
  if (v.status === "ended") {
    const toEntry = (r: { deviceId: string; nickname: string; score: number; rank: number; teamId?: string | null }): PodiumEntry => ({
      key: r.deviceId,
      name: r.nickname,
      score: r.score,
      rank: r.rank,
      avatar: avatarOf(r.deviceId),
      color: teamColorOf(r.teamId) ?? colorOf(r.deviceId),
    });
    const entries: PodiumEntry[] = teamMode && v.teams.length > 0
      ? v.teams.slice(0, 3).map((t) => ({
          key: t.teamId,
          name: t.name,
          score: t.score,
          rank: t.rank,
          avatar: avatarOf(t.topDeviceId),
          color: teamColorOf(t.teamId) ?? colorOf(t.teamId),
        }))
      : v.leaderboard.slice(0, 3).map(toEntry);
    const rest = teamMode && v.teams.length > 0 ? [] : v.leaderboard.slice(3, 10).map(toEntry);
    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center gap-6">
        <div className="text-4xl font-black text-white">
          🏆 最终排名 <span className="text-white/50 text-2xl">· 共 {v.roundNo} 题</span>
        </div>
        <CssPodium entries={entries} />
        {rest.length > 0 && (
          <div className="flex flex-wrap gap-4 justify-center">
            {rest.map((e) => (
              <div key={e.key} className="flex items-center gap-2 rounded-full bg-white/10 pl-1 pr-4 py-1">
                <PlayerAvatar avatar={e.avatar} name={e.name} color={e.color} style={{ width: "2rem", height: "2rem", fontSize: "0.9rem" }} />
                <span className="text-white/80 font-bold tabular-nums">{e.rank}.</span>
                <span className="text-white">{e.name}</span>
                <span className="text-white/70 tabular-nums">{e.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 比赛中(countdown / reading / open / locked / idle)
  const w = v.winner;
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-7 relative">
      {/* 抢到/抢跳即时 splash(事件驱动,先于合批状态 ~400ms 到达) */}
      {flash && (
        <div
          className={`absolute -top-4 left-1/2 -translate-x-1/2 z-20 rounded-full px-8 py-3 text-2xl font-black text-white shadow-2xl animate-pulse whitespace-nowrap ${
            flash.kind === "buzz:won" ? "" : "bg-red-600"
          }`}
          style={flash.kind === "buzz:won" ? { background: ACCENT, color: "#3b2a00" } : undefined}
        >
          {flash.kind === "buzz:won" ? "🔔" : "⚡"} {flashPayload?.teamName ? `${flashPayload.teamName} · ` : ""}
          {flashPayload?.nickname ?? ""} {flash.kind === "buzz:won" ? "抢到了!" : "抢跳!"}
        </div>
      )}

      <div className="text-3xl font-black text-white/85">
        第 <span style={{ color: ACCENT }}>{v.roundNo}</span> 题
        <span className="text-white/45 text-xl ml-4">{v.playerCount} 人在场</span>
      </div>

      {v.status === "countdown" && (
        <div className="text-center">
          <div className="text-3xl text-white/70 mb-1">准备抢答 · 现在按算抢跳!</div>
          <div className="text-[11rem] leading-none font-black animate-pulse" style={{ color: ACCENT }}>
            {Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
          </div>
        </div>
      )}

      {v.status === "running" && v.sub === "reading" && (
        <div className="text-center">
          <div className="text-7xl font-black text-white mb-3">请听题…</div>
          <div className="text-xl text-white/60">主持人宣布开抢后再按 —— {foulRuleText(v)}</div>
        </div>
      )}

      {v.status === "running" && v.sub === "open" && (
        <div className="text-center">
          <div className="text-[9rem] leading-none font-black animate-pulse" style={{ color: ACCENT }}>
            抢!
          </div>
          {v.excludedCount > 0 && <div className="text-white/60 text-xl mt-2">已排除 {v.excludedCount} 个答错{teamMode ? "队" : "人"},其余继续抢</div>}
        </div>
      )}

      {v.status === "running" && v.sub === "locked" && w && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-5 mb-2">
            <PlayerAvatar
              avatar={avatarOf(w.deviceId)}
              name={w.nickname}
              color={teamColorOf(w.teamId) ?? colorOf(w.deviceId)}
              className="ring-4 ring-white/80"
              style={{ width: "6rem", height: "6rem", fontSize: "2.6rem" }}
            />
            <div className="text-left">
              <div className="text-6xl font-black" style={{ color: ACCENT }}>
                {w.nickname}
              </div>
              {w.teamName && (
                <div className="text-2xl font-bold mt-1" style={{ color: teamColorOf(w.teamId) ?? "#fff" }}>
                  {w.teamName}
                </div>
              )}
            </div>
          </div>
          <div className="text-2xl text-white/85">
            🔔 抢到答题权 · 反应 <span className="font-black" style={{ color: ACCENT }}>{fmtReaction(w.reactionMs)}</span>
          </div>
          <div className="text-white/55 text-lg mt-2">等待主持人判定…</div>
          {v.lateBuzzes.length > 0 && (
            <div className="text-white/45 text-base mt-3">
              {v.lateBuzzes.map((l, i) => (
                <span key={i} className="mx-2">
                  {l.teamName ? `${l.teamName}·` : ""}
                  {l.nickname} 慢了 {(l.deltaMs / 1000).toFixed(2)}s
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {v.status === "running" && v.sub === "idle" && (
        <div className="text-center">
          {v.lastJudge && v.lastJudge.roundNo === v.roundNo ? (
            <div className="text-5xl font-black text-white mb-2">{judgeText(v.lastJudge)}</div>
          ) : (
            <div className="text-4xl font-black text-white/70 mb-2">本题结束</div>
          )}
          <div className="text-white/55 text-lg">等待主持人进入下一题</div>
        </div>
      )}

      {/* 本题抢跳名单(读题/倒计时期展示,警示) */}
      {(v.status === "countdown" || (v.status === "running" && v.sub === "reading")) && v.fouls.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {v.fouls.map((f, i) => (
            <span key={i} className="rounded-full bg-red-600/85 text-white px-4 py-1 text-lg font-bold">
              ⚡ {f.teamName ? `${f.teamName}·` : ""}
              {f.nickname} 抢跳
            </span>
          ))}
        </div>
      )}
      {/* 读题期附带显示上一题结果 */}
      {v.status === "running" && v.sub === "reading" && v.lastJudge && v.lastJudge.roundNo < v.roundNo && (
        <div className="text-white/50 text-lg">上一题:{judgeText(v.lastJudge)}</div>
      )}

      <ScoreBoard v={v} grouping={grouping} />
    </div>
  );
}

// ─────────────────────── 手机 ───────────────────────
function BuzzerRemote({ view, connected, sendAction, grouping }: GameRemoteProps) {
  const v = view as BuzzerRemoteView | null;
  // 本地按下锁:一次性按下(不合批),同一阶段只发一次;2s 未见服务端推进自动解禁
  // (服务端幂等:重复 buzz 被丢弃/已锁者忽略,重发无害 —— 照 routeRace submittedKey 教训)
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!pressedKey) return;
    const t = setTimeout(() => setPressedKey(null), 2000);
    return () => clearTimeout(t);
  }, [pressedKey]);
  // 判定结果横幅:roundNo:at 复合键去重(跨题/跨局不误吞),3.5s 自动收起
  const j = v?.lastJudge ?? null;
  const jKey = j ? `${j.roundNo}:${j.at}` : null;
  const [dismissedJudge, setDismissedJudge] = useState<string | null>(null);
  useEffect(() => {
    if (jKey === null) return;
    const t = setTimeout(() => setDismissedJudge(jKey), 3500);
    return () => clearTimeout(t);
  }, [jKey]);

  if (!v) return <div className="text-center text-white/70 text-xl">准备中…</div>;

  const myTeamColor = v.myTeamId ? grouping?.teams.find((t) => t.id === v.myTeamId)?.color ?? "#888" : null;
  const inCountdown = v.status === "countdown";
  const reading = v.status === "running" && v.sub === "reading";
  const open = v.status === "running" && v.sub === "open";
  const lockedPhase = v.status === "running" && v.sub === "locked";
  const idle = v.status === "running" && v.sub === "idle";
  const lockedOut = v.lockedUntilRound !== null; // 抢跳判罚生效中
  const phaseKey = `${v.roundNo}:${v.status}:${v.sub}:${v.openedAt ?? 0}`;
  const pressed = pressedKey === phaseKey;
  const canPress = connected && !lockedOut && !v.amExcluded && !pressed && (open || reading || inCountdown);
  const judgeBanner = j && dismissedJudge !== jKey ? j : null;

  const onPress = (e: React.PointerEvent) => {
    if (!e.isPrimary) return; // 只认主触点(多指同拍只算一次)
    if (!canPress) return;
    setPressedKey(phaseKey);
    sendAction({ kind: "buzz" }); // 一次性立即上报,不合批(抢的就是毫秒)
  };

  return (
    <div className="w-full flex flex-col items-center gap-5">
      {v.myTeamId && myTeamColor && (
        <div className="flex items-center gap-3 rounded-full px-5 py-2 text-white" style={{ background: myTeamColor }}>
          <span className="font-bold text-lg">{v.myTeamName}</span>
          <span className="text-white/85 text-sm">
            队 {v.myTeamScore ?? 0} 分 · 第 {v.myTeamRank ?? "-"} 名
          </span>
        </div>
      )}

      <div className="flex items-center gap-6 text-white">
        <div className="text-center">
          <div className="text-sm text-white/60">我的得分</div>
          <div className="text-4xl font-black tabular-nums" style={{ color: ACCENT }}>
            {v.myScore}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-white/60">名次</div>
          <div className="text-4xl font-black tabular-nums">{v.myRank ?? "-"}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-white/60">抢到</div>
          <div className="text-4xl font-black tabular-nums">{v.myWins}</div>
        </div>
      </div>

      {v.status !== "ready" && v.status !== "ended" && (
        <div className="text-white/70 text-lg">
          第 <span className="font-black text-white">{v.roundNo}</span> 题
        </div>
      )}

      {/* 判定结果横幅 */}
      {judgeBanner && (
        <div
          className={`rounded-xl px-5 py-2 font-bold text-white ${
            judgeBanner.kind === "wrong" ? "bg-red-600/90" : "bg-emerald-600/90"
          }`}
        >
          {judgeText(judgeBanner)}
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPress}
        disabled={!canPress}
        className="select-none touch-manipulation w-64 h-64 rounded-full text-white text-4xl font-black shadow-2xl active:scale-95 transition-transform disabled:opacity-40"
        style={{
          background: open
            ? `radial-gradient(circle at 50% 32%, ${ACCENT}, ${PRIMARY})`
            : reading || inCountdown
              ? `radial-gradient(circle at 50% 32%, color-mix(in srgb, ${PRIMARY} 55%, #7a5200), color-mix(in srgb, ${PRIMARY} 70%, #222))`
              : `radial-gradient(circle at 50% 32%, color-mix(in srgb, ${PRIMARY} 60%, white) 0%, ${PRIMARY} 62%)`,
        }}
      >
        {v.status === "ready" && "等待开始"}
        {inCountdown && Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
        {reading && "听题中"}
        {open && "抢!"}
        {lockedPhase && (v.iWon ? "🎉 抢到了" : "手慢了")}
        {idle && "本题结束"}
        {v.status === "ended" && "比赛结束"}
      </button>

      {/* 状态提示区 */}
      <div className="text-center min-h-[3.5rem]">
        {lockedOut && (reading || inCountdown || open || lockedPhase) && (
          <div className="text-red-300 font-bold text-lg">
            🚫 抢跳判罚:{v.lockedUntilRound === v.roundNo ? "本题禁抢" : `禁抢到第 ${v.lockedUntilRound} 题`}
          </div>
        )}
        {!lockedOut && v.amExcluded && (reading || inCountdown || open || lockedPhase) && (
          <div className="text-orange-300 font-bold text-lg">⛔ 本题已答错,等下一题</div>
        )}
        {!lockedOut && !v.amExcluded && (reading || inCountdown) && (
          <div className="text-amber-300 text-base">⚠ 等主持人宣布开抢再按 —— 现在按算抢跳!</div>
        )}
        {!lockedOut && !v.amExcluded && open && pressed && (
          <div className="text-white/80 text-base">已按下,等待判定…</div>
        )}
        {lockedPhase && v.iWon && (
          <div className="text-lg font-bold" style={{ color: ACCENT }}>
            🎉 你抢到了,请作答!
            {v.winnerReactionMs !== null && <span className="text-white/70 font-normal"> 反应 {fmtReaction(v.winnerReactionMs)}</span>}
          </div>
        )}
        {lockedPhase && !v.iWon && v.winnerName && (
          <div className="text-white/85 text-lg">
            {v.winnerIsMyTeam ? `本队 ${v.winnerName} 已抢到` : `${v.winnerName} 抢到了`}
          </div>
        )}
        {v.status === "ended" && (
          <div className="text-white text-xl">
            你第 <span className="font-black" style={{ color: ACCENT }}>{v.myRank ?? "-"}</span> 名 · {v.myScore} 分
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 主持面板(HostPanel 契约位首个使用者) ───────────────────────
function BuzzerHostPanel({ view, control, connected, compact }: GameHostPanelProps) {
  const v = view as BuzzerScreenView | null;
  const btnBase =
    "rounded-lg px-5 py-3 font-semibold transition-colors disabled:opacity-40 " + (compact ? "text-lg " : "");
  const primaryBtn = { background: PRIMARY };
  if (!v) return <div className="text-sm text-gray-400">等待大屏状态…</div>;

  const reading = v.status === "running" && v.sub === "reading";
  const open = v.status === "running" && v.sub === "open";
  const locked = v.status === "running" && v.sub === "locked";
  const idle = v.status === "running" && v.sub === "idle";
  const w = v.winner;

  return (
    <div className="flex flex-col gap-3">
      {/* 状态行:第几题 + 当前阶段 */}
      {v.status !== "ready" && v.status !== "ended" && (
        <div className={`text-gray-500 ${compact ? "text-base" : "text-sm"}`}>
          第 <span className="font-black text-gray-800">{v.roundNo}</span> 题 ·{" "}
          {v.status === "countdown" && `开抢倒计时 ${Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}…`}
          {reading && "读题中(观众现在按算抢跳)"}
          {open && "抢答开放,等第一个按下…"}
          {locked && "已有人抢到,请判定"}
          {idle && "本题已结束"}
          {v.fouls.length > 0 && <span className="text-red-500 ml-2">本题抢跳 {v.fouls.length} 人</span>}
          {v.excludedCount > 0 && <span className="text-orange-500 ml-2">已排除 {v.excludedCount}</span>}
        </div>
      )}
      {locked && w && (
        <div className={`font-bold text-gray-800 ${compact ? "text-xl" : "text-lg"}`}>
          🔔 {w.teamName ? `${w.teamName} · ` : ""}
          {w.nickname} 抢到(反应 {fmtReaction(w.reactionMs)})
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {v.status === "ready" && (
          <button type="button" disabled={!connected} onClick={() => control({ kind: "start" })} className={`${btnBase} text-white`} style={primaryBtn}>
            ▶ 开始比赛
          </button>
        )}
        {reading && (
          <button type="button" disabled={!connected} onClick={() => control({ kind: "arm" })} className={`${btnBase} text-white`} style={primaryBtn}>
            🔔 开抢!
          </button>
        )}
        {(reading || open) && (
          <button
            type="button"
            disabled={!connected}
            onClick={() => control({ kind: "next" })}
            className={`${btnBase} border border-gray-300 text-gray-700 hover:bg-gray-50`}
          >
            {open ? "无人抢答 · 下一题" : "跳过本题"}
          </button>
        )}
        {locked && v.scoring === "judge" && (
          <>
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "judge", ok: true })}
              className={`${btnBase} text-white bg-emerald-600 hover:bg-emerald-700`}
            >
              ✅ 答对 +{v.pointsCorrect}
            </button>
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "judge", ok: false })}
              className={`${btnBase} text-white bg-red-600 hover:bg-red-700`}
            >
              ❌ 答错{v.pointsWrong > 0 ? ` −${v.pointsWrong}` : ""}
              {v.wrongReopen ? " · 重新开抢" : ""}
            </button>
            <button
              type="button"
              disabled={!connected}
              onClick={() => control({ kind: "next" })}
              className={`${btnBase} border border-gray-300 text-gray-700 hover:bg-gray-50`}
            >
              跳过不计分
            </button>
          </>
        )}
        {idle && (
          <button
            type="button"
            disabled={!connected}
            onClick={() => {
              control({ kind: "next" });
              // 抢到即得分模式:主持人无需判定,一键连发 下一题+开抢(同连接顺序保证,服务端串行处理)
              if (v.scoring === "buzz") control({ kind: "arm" });
            }}
            className={`${btnBase} text-white`}
            style={primaryBtn}
          >
            ▶ {v.scoring === "buzz" ? "下一题并开抢" : "下一题"}
          </button>
        )}
        {(reading || idle) && (
          <button
            type="button"
            disabled={!connected}
            onClick={() => control({ kind: "end" })}
            className={`${btnBase} border border-gray-300 text-gray-700 hover:bg-gray-50`}
          >
            🏁 结束比赛 · 出总榜
          </button>
        )}
        {v.status === "ended" && (
          <button type="button" disabled={!connected} onClick={() => control({ kind: "reset" })} className={`${btnBase} text-white`} style={primaryBtn}>
            ↻ 再来一局
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 配置 ───────────────────────
function BuzzerConfig({ value, onChange }: GameConfigProps) {
  const scoring = value.scoring === "buzz" ? "buzz" : "judge";
  const pointsCorrect = Number(value.pointsCorrect ?? 10);
  const pointsWrong = Number(value.pointsWrong ?? 0);
  const wrongReopen = value.wrongReopen !== false;
  const countdownSec = Number(value.countdownSec ?? 3);
  const foulScope = value.foulScope === "team" ? "team" : "player";
  const foulLockNextRound = value.foulLockNextRound === true;
  const row = "flex items-center gap-3 text-sm";
  const input = "rounded-md border border-gray-300 px-2 py-1";
  return (
    <div className="flex flex-col gap-3">
      <div className={row}>
        <label className="text-gray-600 w-28 shrink-0">计分方式</label>
        <select value={scoring} onChange={(e) => onChange({ ...value, scoring: e.target.value })} className={input}>
          <option value="judge">主持人判定(答对加分)</option>
          <option value="buzz">抢到即得分(+1)</option>
        </select>
      </div>
      {scoring === "judge" && (
        <>
          <div className={row}>
            <label className="text-gray-600 w-28 shrink-0">答对加分</label>
            <input type="number" min={1} max={1000} value={pointsCorrect} onChange={(e) => onChange({ ...value, pointsCorrect: Number(e.target.value) || 10 })} className={`${input} w-24`} />
            <label className="text-gray-600 ml-3">答错扣分</label>
            <input type="number" min={0} max={1000} value={pointsWrong} onChange={(e) => onChange({ ...value, pointsWrong: Number(e.target.value) || 0 })} className={`${input} w-24`} />
            <span className="text-gray-400 text-xs">0 = 不扣</span>
          </div>
          <div className={row}>
            <label className="flex items-center gap-2 text-gray-600">
              <input type="checkbox" checked={wrongReopen} onChange={(e) => onChange({ ...value, wrongReopen: e.target.checked })} />
              答错后重新开放抢答(已答错者本题不能再抢)
            </label>
          </div>
        </>
      )}
      <div className={row}>
        <label className="text-gray-600 w-28 shrink-0">开抢倒计时(秒)</label>
        <input type="number" min={0} max={10} value={countdownSec} onChange={(e) => onChange({ ...value, countdownSec: Math.max(0, Number(e.target.value) || 0) })} className={`${input} w-24`} />
        <span className="text-gray-400 text-xs">0 = 点「开抢」立即开;倒计时内按下也算抢跳</span>
      </div>
      <div className={row}>
        <label className="text-gray-600 w-28 shrink-0">抢跳判罚对象</label>
        <select value={foulScope} onChange={(e) => onChange({ ...value, foulScope: e.target.value })} className={input}>
          <option value="player">仅犯规本人</option>
          <option value="team">整个队伍(团队模式)</option>
        </select>
      </div>
      <div className={row}>
        <label className="text-gray-600 w-28 shrink-0">抢跳判罚范围</label>
        <select
          value={foulLockNextRound ? "next" : "round"}
          onChange={(e) => onChange({ ...value, foulLockNextRound: e.target.value === "next" })}
          className={input}
        >
          <option value="round">仅本题禁抢</option>
          <option value="next">下一题也禁抢(罚 1 轮)</option>
        </select>
      </div>
    </div>
  );
}

export const buzzerUi: GameUi = {
  type: "buzzer",
  label: "抢答器",
  icon: "BellRing",
  hint: "主持人宣布开抢后拼手速 —— 服务端权威判定第一个按下,抢跳有判罚",
  rules:
    "🙋 个人赛:主持人宣布开抢后,第一个按下按钮的人获得答题权;开抢前按下算抢跳,会被禁抢(本题或加罚一题)。\n👥 团体赛:任一队员按下即为本队抢到,由按下的人作答;抢跳判罚按设置可能连累全队。",
  defaultConfig: {
    scoring: "judge",
    pointsCorrect: 10,
    pointsWrong: 0,
    wrongReopen: true,
    countdownSec: 3,
    foulScope: "player",
    foulLockNextRound: false,
  },
  Screen: BuzzerScreen,
  Remote: BuzzerRemote,
  Config: BuzzerConfig,
  HostPanel: BuzzerHostPanel,
};
