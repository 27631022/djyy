import {
  type GameDef,
  type GameContext,
  type ActionMeta,
  type ControlCmd,
  type ReduceResult,
  type RankRow,
  competitionRank,
} from '../game-def';

/**
 * 连点冲榜(tap_race)—— 第 0 期占位游戏,打通「实时基座 + 双端注册表 + 分组对抗」契约。
 * 玩法:主持开始 → 限时内玩家狂点手机 → 大屏实时排行 → 到点自动结算定榜。
 * 分组对抗:玩家有 teamId 时,大屏额外出「队伍对抗榜」(各队成员次数求和,并列取小名次)。
 * 也是第 2 期「摇一摇」触屏连点冲榜的雏形(同一 reduce 上报管线)。
 */

export interface TapRaceConfig {
  durationSec: number; // 每局时长(秒)
}

interface TapRacePlayerState {
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  count: number;
  // 服务端限速滑动窗(见 MAX_TAPS_PER_SEC):窗口起点 + 窗口内已计数
  rateWinStart: number;
  rateWinCount: number;
}

export interface TapRaceState {
  status: 'ready' | 'countdown' | 'running' | 'ended';
  countdownEndsAt: number | null; // countdown 阶段结束(→ running)时刻
  startedAt: number | null;
  endsAt: number | null;
  players: Record<string, TapRacePlayerState>; // deviceId -> state
}

export type TapRaceAction = { kind: 'tap'; n?: number };

// 单次上报次数封顶:客户端本地聚合后上报增量,服务端 clamp 防伪造刷分(照 view-beacon min-damage)
const MAX_TAPS_PER_ACTION = 25;
// 服务端权威限速:每玩家每秒最多计 15 次(人类单指极限 ~12 次/秒,留少量余量)。
// 超出部分直接丢弃 —— 多指同拍、脚本高频灌消息、伪造大 n 都被这里裁平(40 人实测「点击次数不实」后引入)。
const MAX_TAPS_PER_SEC = 15;
// 开赛前 3-2-1 倒计时(给「倒计时开始音乐」一个落点 + 现场蓄势)
const COUNTDOWN_MS = 3000;

function leaderboard(state: TapRaceState): RankRow[] {
  return competitionRank(
    Object.entries(state.players).map(([deviceId, p]) => ({
      deviceId,
      nickname: p.nickname,
      score: p.count,
      teamId: p.teamId,
    })),
  );
}

interface TeamRow {
  teamId: string;
  name: string;
  score: number;
  rank: number;
  memberCount: number;
  topDeviceId: string | null; // 队内点击量最高的成员(领奖台头像用他的头像)
}

function teamStandings(state: TapRaceState): TeamRow[] {
  const agg = new Map<
    string,
    { name: string; score: number; members: number; topDeviceId: string | null; topCount: number }
  >();
  for (const [deviceId, p] of Object.entries(state.players)) {
    if (!p.teamId) continue;
    const cur = agg.get(p.teamId) ?? { name: p.teamName ?? p.teamId, score: 0, members: 0, topDeviceId: null, topCount: -1 };
    cur.score += p.count;
    cur.members += 1;
    if (p.count > cur.topCount) {
      cur.topCount = p.count;
      cur.topDeviceId = deviceId; // 记该队点击量最高者
    }
    agg.set(p.teamId, cur);
  }
  if (agg.size === 0) return [];
  const ranked = competitionRank(
    [...agg.entries()].map(([teamId, v]) => ({ deviceId: teamId, nickname: v.name, score: v.score })),
  );
  return ranked.map((r) => ({
    teamId: r.deviceId,
    name: r.nickname,
    score: r.score,
    rank: r.rank,
    memberCount: agg.get(r.deviceId)?.members ?? 0,
    topDeviceId: agg.get(r.deviceId)?.topDeviceId ?? null,
  }));
}

export const tapRaceGame: GameDef<TapRaceConfig, TapRaceState, TapRaceAction> = {
  type: 'tap_race',
  label: '连点冲榜',
  icon: 'Zap',

  defaultConfig: { durationSec: 30 },

  validateConfig(input) {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    let d = Number(o.durationSec);
    if (!Number.isFinite(d)) d = 30;
    d = Math.min(300, Math.max(5, Math.round(d)));
    return { durationSec: d };
  },

  makeInitialState(_cfg, ctx: GameContext) {
    const players: Record<string, TapRacePlayerState> = {};
    for (const p of ctx.players) {
      players[p.deviceId] = {
        nickname: p.nickname,
        teamId: p.teamId ?? null,
        teamName: p.teamName ?? null,
        count: 0,
        rateWinStart: 0,
        rateWinCount: 0,
      };
    }
    return { status: 'ready', countdownEndsAt: null, startedAt: null, endsAt: null, players };
  },

  reduce(state, action, meta: ActionMeta): ReduceResult<TapRaceState> {
    if (state.status !== 'running' || action.kind !== 'tap') return { state };
    const raw = Math.round(Number(action.n) || 1);
    const n = Math.min(MAX_TAPS_PER_ACTION, Math.max(1, raw));
    const cur = state.players[meta.deviceId] ?? {
      nickname: meta.nickname,
      teamId: meta.teamId ?? null,
      teamName: meta.teamName ?? null,
      count: 0,
      rateWinStart: 0,
      rateWinCount: 0,
    };
    // 滑动 1s 窗口限速:窗口内累计超过 MAX_TAPS_PER_SEC 的增量直接丢弃(服务端权威,防多指/脚本刷分)
    let winStart = cur.rateWinStart ?? 0;
    let winCount = cur.rateWinCount ?? 0;
    if (meta.at - winStart >= 1000) {
      winStart = meta.at;
      winCount = 0;
    }
    const grant = Math.max(0, Math.min(n, MAX_TAPS_PER_SEC - winCount));
    winCount += grant;
    const players = {
      ...state.players,
      [meta.deviceId]: {
        nickname: cur.nickname || meta.nickname,
        // meta 优先:队伍归属以服务端运行态为准(报名阶段选/换队后,首次动作即生效)
        teamId: meta.teamId ?? cur.teamId ?? null,
        teamName: meta.teamName ?? cur.teamName ?? null,
        count: cur.count + grant,
        rateWinStart: winStart,
        rateWinCount: winCount,
      },
    };
    return { state: { ...state, players } };
  },

  control(state, cmd: ControlCmd, meta: ActionMeta): ReduceResult<TapRaceState> {
    if (cmd.kind === 'start') {
      // 从 ready 起进入 3-2-1 倒计时(倒计时结束由 tick 转 running)
      if (state.status !== 'ready') return { state };
      return {
        state: { ...state, status: 'countdown', countdownEndsAt: meta.at + COUNTDOWN_MS },
        events: [{ kind: 'countdown:start' }],
      };
    }
    if (cmd.kind === 'end') {
      if (state.status === 'ended') return { state };
      return { state: { ...state, status: 'ended' }, ended: true };
    }
    if (cmd.kind === 'reset') {
      // 保留玩家名单+队伍,清零重来(「再来一局」);限速窗口一并清零
      const players: Record<string, TapRacePlayerState> = {};
      for (const [k, v] of Object.entries(state.players)) {
        players[k] = { nickname: v.nickname, teamId: v.teamId, teamName: v.teamName, count: 0, rateWinStart: 0, rateWinCount: 0 };
      }
      return { state: { status: 'ready', countdownEndsAt: null, startedAt: null, endsAt: null, players } };
    }
    return { state };
  },

  tick(state, now, cfg): ReduceResult<TapRaceState> | null {
    // 倒计时结束 → 正式开始(发「开始音乐」事件)
    if (state.status === 'countdown') {
      if (state.countdownEndsAt !== null && now >= state.countdownEndsAt) {
        return {
          state: { ...state, status: 'running', countdownEndsAt: null, startedAt: now, endsAt: now + cfg.durationSec * 1000 },
          events: [{ kind: 'game:started' }],
        };
      }
      return { state }; // 倒计时进行中:定频广播刷新 3-2-1
    }
    if (state.status === 'running') {
      if (state.endsAt !== null && now >= state.endsAt) {
        return { state: { ...state, status: 'ended' }, ended: true, events: [{ kind: 'game:timeup' }] };
      }
      return { state }; // 未到点:定频广播刷新倒计时
    }
    return null;
  },

  settle(state) {
    const teams = teamStandings(state);
    return { ranking: leaderboard(state), extra: teams.length ? { teams } : undefined };
  },

  projectScreen(state, cfg) {
    const teams = teamStandings(state);
    return {
      status: state.status,
      durationSec: cfg.durationSec,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      remainMs: state.endsAt !== null ? Math.max(0, state.endsAt - Date.now()) : cfg.durationSec * 1000,
      playerCount: Object.keys(state.players).length,
      hasTeams: teams.length > 0,
      teams,
      leaderboard: leaderboard(state).slice(0, 20),
    };
  },

  projectRemote(state, cfg, deviceId) {
    const board = leaderboard(state);
    const mine = board.find((r) => r.deviceId === deviceId);
    const me = state.players[deviceId];
    const teams = teamStandings(state);
    const myTeam = me?.teamId ? teams.find((t) => t.teamId === me.teamId) : null;
    return {
      status: state.status,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      remainMs: state.endsAt !== null ? Math.max(0, state.endsAt - Date.now()) : cfg.durationSec * 1000,
      myCount: mine?.score ?? 0,
      myRank: mine?.rank ?? null,
      myTeamId: me?.teamId ?? null,
      myTeamName: me?.teamName ?? null,
      myTeamScore: myTeam?.score ?? null,
      myTeamRank: myTeam?.rank ?? null,
      playerCount: Object.keys(state.players).length,
    };
  },
};
