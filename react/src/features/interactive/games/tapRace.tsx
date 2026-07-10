import { useEffect, useRef, useState } from "react";
import { type GameConfigProps, type GameRemoteProps, type GameScreenProps, type GameUi } from "./types";

interface TeamRow {
  teamId: string;
  name: string;
  score: number;
  rank: number;
  memberCount: number;
}
/** projectScreen 投影 */
interface TapScreenView {
  status: "ready" | "countdown" | "running" | "ended";
  durationSec: number;
  countdownRemainMs: number;
  remainMs: number;
  playerCount: number;
  hasTeams: boolean;
  teams: TeamRow[];
  leaderboard: { deviceId: string; nickname: string; score: number; rank: number; teamId?: string | null }[];
}
/** projectRemote 投影 */
interface TapRemoteView {
  status: "ready" | "countdown" | "running" | "ended";
  countdownRemainMs: number;
  remainMs: number;
  myCount: number;
  myRank: number | null;
  myTeamId: string | null;
  myTeamName: string | null;
  myTeamScore: number | null;
  myTeamRank: number | null;
  playerCount: number;
}

const PRIMARY = "var(--party-primary)";

function secs(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

// ─────────────────────── 大屏 ───────────────────────
function TapRaceScreen({ view, grouping }: GameScreenProps) {
  const v = view as TapScreenView | null;
  if (!v) {
    return <div className="text-white/70 text-3xl">准备中…</div>;
  }
  const teamColor = (id: string) => grouping?.teams.find((t) => t.id === id)?.color ?? "#888";
  const teamMode = v.hasTeams && v.teams.length > 0;
  const maxTeam = Math.max(1, ...v.teams.map((t) => t.score));
  const maxScore = Math.max(1, ...v.leaderboard.map((r) => r.score));
  const champTeam = v.status === "ended" && teamMode ? v.teams[0] : null;
  const champion = v.status === "ended" && !teamMode ? v.leaderboard[0] : null;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8">
      {v.status === "ready" && (
        <div className="text-center">
          <div className="text-6xl font-black text-white mb-4">连点冲榜</div>
          <div className="text-2xl text-white/80">已就位 {v.playerCount} 人 · 等待主持人开始</div>
        </div>
      )}

      {v.status === "countdown" && (
        <div className="text-center">
          <div className="text-4xl text-white/70 mb-2">准备</div>
          <div className="text-[12rem] leading-none font-black animate-pulse" style={{ color: "var(--party-accent)" }}>
            {Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
          </div>
        </div>
      )}

      {v.status === "running" && (
        <div className="text-[9rem] leading-none font-black tabular-nums" style={{ color: "var(--party-accent)" }}>
          {secs(v.remainMs)}
        </div>
      )}

      {champTeam && (
        <div className="text-center">
          <div className="text-3xl text-white/70 mb-2">🏆 冠军队</div>
          <div className="text-7xl font-black" style={{ color: teamColor(champTeam.teamId) }}>
            {champTeam.name}
          </div>
          <div className="text-3xl text-white/80 mt-2">{champTeam.score} 次</div>
        </div>
      )}
      {champion && (
        <div className="text-center">
          <div className="text-3xl text-white/70 mb-2">🏆 冠军</div>
          <div className="text-7xl font-black" style={{ color: "var(--party-accent)" }}>
            {champion.nickname}
          </div>
          <div className="text-3xl text-white/80 mt-2">{champion.score} 次</div>
        </div>
      )}

      {/* 分组对抗榜(队伍模式)*/}
      {teamMode && (
        <div className="w-full flex flex-col gap-4">
          {v.teams.map((t) => (
            <div key={t.teamId} className="flex items-center gap-4">
              <div className="w-10 text-right text-3xl font-black text-white/80 tabular-nums">{t.rank}</div>
              <div className="flex-1 h-16 rounded-2xl bg-white/10 overflow-hidden relative">
                <div
                  className="h-full rounded-2xl transition-all duration-200 flex items-center px-5"
                  style={{
                    width: `${Math.max(12, (t.score / maxTeam) * 100)}%`,
                    background: `linear-gradient(90deg, ${t.rank === 1 ? teamColor(t.teamId) : "color-mix(in srgb, " + teamColor(t.teamId) + " 75%, #333)"}, ${teamColor(t.teamId)})`,
                  }}
                >
                  <span className="text-white text-2xl font-black truncate drop-shadow">{t.name}</span>
                  <span className="text-white/70 text-sm ml-3">{t.memberCount}人</span>
                </div>
              </div>
              <div className="w-24 text-3xl font-black text-white tabular-nums">{t.score}</div>
            </div>
          ))}
        </div>
      )}

      {/* 个人榜(队伍模式下缩为副榜)*/}
      <div className="w-full flex flex-col gap-2">
        {teamMode && <div className="text-white/50 text-sm">个人榜</div>}
        {v.leaderboard.slice(0, teamMode ? 5 : 10).map((r) => (
          <div key={r.deviceId} className="flex items-center gap-4">
            <div className="w-10 text-right text-xl font-bold text-white/80 tabular-nums">{r.rank}</div>
            <div className={`flex-1 rounded-full bg-white/10 overflow-hidden relative ${teamMode ? "h-8" : "h-11"}`}>
              <div
                className="h-full rounded-full transition-all duration-200 flex items-center px-4"
                style={{
                  width: `${Math.max(8, (r.score / maxScore) * 100)}%`,
                  background: r.teamId
                    ? `linear-gradient(90deg, color-mix(in srgb, ${teamColor(r.teamId)} 60%, #222), ${teamColor(r.teamId)})`
                    : `linear-gradient(90deg, ${PRIMARY}, var(--party-accent))`,
                }}
              >
                <span className="text-white font-semibold truncate drop-shadow">{r.nickname}</span>
              </div>
            </div>
            <div className={`text-white font-black tabular-nums ${teamMode ? "w-16 text-lg" : "w-20 text-2xl"}`}>
              {r.score}
            </div>
          </div>
        ))}
        {v.leaderboard.length === 0 && (
          <div className="text-center text-white/50 text-xl py-8">开始后这里显示实时排行</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── 手机 ───────────────────────
function TapRaceRemote({ view, connected, sendAction, grouping }: GameRemoteProps) {
  const v = view as TapRemoteView | null;
  const pendingRef = useRef(0);
  const [bump, setBump] = useState(0);
  const myTeamColor = v?.myTeamId ? grouping?.teams.find((t) => t.id === v.myTeamId)?.color ?? "#888" : null;

  // 本地聚合上报:狂点先在本地累加,每 120ms 把增量作为一次 tap 动作发出(不逐次发 WS)
  useEffect(() => {
    const t = setInterval(() => {
      if (pendingRef.current > 0) {
        sendAction({ kind: "tap", n: pendingRef.current });
        pendingRef.current = 0;
      }
    }, 120);
    return () => clearInterval(t);
  }, [sendAction]);

  const running = v?.status === "running";
  const onTap = () => {
    if (!running) return;
    pendingRef.current += 1;
    setBump((b) => (b + 1) % 1000);
  };

  if (!v) {
    return <div className="text-center text-white/70 text-xl">准备中…</div>;
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {v.myTeamId && myTeamColor && (
        <div
          className="flex items-center gap-3 rounded-full px-5 py-2 text-white"
          style={{ background: myTeamColor }}
        >
          <span className="font-bold text-lg">{v.myTeamName}</span>
          <span className="text-white/85 text-sm">
            队 {v.myTeamScore ?? 0} 次 · 第 {v.myTeamRank ?? "-"} 名
          </span>
        </div>
      )}
      <div className="flex items-center gap-6 text-white">
        <div className="text-center">
          <div className="text-sm text-white/60">我的次数</div>
          <div className="text-4xl font-black tabular-nums" style={{ color: "var(--party-accent)" }}>
            {v.myCount}
          </div>
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
        onPointerDown={onTap}
        disabled={!running || !connected}
        className="select-none touch-manipulation w-64 h-64 rounded-full text-white text-3xl font-black shadow-2xl active:scale-95 transition-transform disabled:opacity-40"
        style={{
          background: `radial-gradient(circle at 50% 35%, var(--party-accent), ${PRIMARY})`,
          transform: `scale(${1 + (bump % 2) * 0.02})`,
        }}
      >
        {v.status === "ready" && "等待开始"}
        {v.status === "countdown" && Math.max(1, Math.ceil(v.countdownRemainMs / 1000))}
        {v.status === "running" && "狂点!"}
        {v.status === "ended" && "本局结束"}
      </button>

      {v.status === "ended" && (
        <div className="text-center text-white text-xl">
          你第 <span className="font-black" style={{ color: "var(--party-accent)" }}>{v.myRank ?? "-"}</span> 名 ·{" "}
          {v.myCount} 次
        </div>
      )}
    </div>
  );
}

// ─────────────────────── 配置 ───────────────────────
function TapRaceConfig({ value, onChange }: GameConfigProps) {
  const durationSec = Number(value.durationSec ?? 30);
  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="text-gray-600">每局时长(秒)</label>
      <input
        type="number"
        min={5}
        max={300}
        value={durationSec}
        onChange={(e) => onChange({ ...value, durationSec: Number(e.target.value) || 30 })}
        className="w-24 rounded-md border border-gray-300 px-2 py-1"
      />
    </div>
  );
}

export const tapRaceUi: GameUi = {
  type: "tap_race",
  label: "连点冲榜",
  icon: "Zap",
  hint: "限时狂点手机,大屏实时排行 —— 也是「摇一摇」的触屏版",
  rules:
    "🏃 个人赛:倒计时结束后疯狂点击屏幕,大屏实时排行榜,点得最多的登顶夺冠。\n👥 团体赛:先加入一个队伍,比全队所有人的点击总和,哪个队总分最高哪队赢。",
  defaultConfig: { durationSec: 30 },
  Screen: TapRaceScreen,
  Remote: TapRaceRemote,
  Config: TapRaceConfig,
};
