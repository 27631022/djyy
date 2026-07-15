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
 * 抢答器(buzzer)—— 第 3 期:服务端到达序权威判定「第一个按下」+ 抢跑(抢跳)判罚。
 *
 * 一次激活 = 一个 InteractiveRound = 整场比赛(多题);每题是内部轮次 roundNo,
 * 只有主持人「结束比赛」才 ended:true → settle 落库(每题结束只改 sub,不触发结算)。
 *
 * status 恒用基座四词汇表(ready/countdown/running/ended):
 * - 音效 phaseOf 与 activeGameLocked 只认这四个词 —— 比赛中整体 status='running'
 *   (配置/换队冻结、大屏「回首页」不出现),题内阶段放独立 sub 字段;
 * - 每题的 3-2-1 开抢倒计时借 status='countdown'(倒计时音自动落点)。
 * sub 流转:reading(读题,抢跳窗口)→ open(开抢)→ locked(已抢到待判定)→ idle(本题完,等下一题)。
 *
 * 权威判定:reduce 在 playerAction 内同步串行执行、meta.at=服务端接收时刻 ——
 * 第一个有效 buzz 直接锁定 winner,后到者进 lateBuzzes(「慢了 xx 毫秒」展示),无并发窗口。
 *
 * 抢跳判罚(用户定案,两配置自由组合):判罚对象 foulScope(仅本人/整队)×
 * 判罚范围 foulLockNextRound(仅本轮/下一轮也禁抢)。锁表 lockedRound[key]=禁到第几轮(含)。
 *
 * 键命名空间(照 route-race racerKeyOf):团队键 `t:<teamId>`、个人键裸 deviceId ——
 * 队伍 id 随投影广播、deviceId 由客户端自报,不隔离可伪造队键蹭队/坑队;
 * 另加守卫:无队却自称 `t:` 前缀 deviceId 的动作直接丢弃(判罚/排除按键生效,比闯关赛更敏感)。
 */

export interface BuzzerConfig {
  scoring: 'judge' | 'buzz'; // judge=主持人判答对答错 / buzz=抢到即+1直接进下一题
  pointsCorrect: number; // 答对加分(judge 模式)
  pointsWrong: number; // 答错扣分(judge 模式,0=不扣;允许总分为负,排名语义诚实)
  wrongReopen: boolean; // 答错后重新开放继续抢(排除已答错者,同题内持续排除)
  countdownSec: number; // 开抢倒计时秒(0=主持点开抢立即开;倒计时内按下也算抢跳)
  foulScope: 'player' | 'team'; // 抢跳判罚对象:仅犯规本人 / 整个队伍(无队者退化为本人)
  foulLockNextRound: boolean; // false=仅本轮禁抢 / true=下一轮也禁抢(「罚1轮」)
}

interface BuzzerPlayerState {
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  score: number;
  wins: number; // 抢到次数
  fouls: number; // 抢跳次数
}

interface BuzzerWinner {
  key: string; // buzzKeyOf:团队 t:<teamId> / 个人 deviceId
  deviceId: string; // 实际按下的人(团队模式=该队答题人,得/扣分记其个人)
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  at: number;
  reactionMs: number; // meta.at - openedAt
}

interface LateBuzz {
  key: string; // 去重用(同人/同队只记最先一条)
  nickname: string;
  teamName: string | null;
  deltaMs: number; // 比 winner 慢多少毫秒
}

interface FoulRecord {
  key: string;
  nickname: string;
  teamName: string | null;
}

/** 本题结果横幅(idle/reading 期大屏与手机展示;at 供手机横幅去重) */
interface JudgeResult {
  roundNo: number;
  kind: 'correct' | 'wrong' | 'buzz'; // buzz=抢到即得分模式的抢到
  nickname: string;
  teamName: string | null;
  points: number; // 本次得(正)/扣(负)分
  reactionMs: number | null;
  at: number;
}

export interface BuzzerState {
  status: 'ready' | 'countdown' | 'running' | 'ended';
  sub: 'reading' | 'open' | 'locked' | 'idle'; // status='running' 时的题内阶段(countdown 期无意义)
  roundNo: number; // 当前第几题(start 置 1;0=未开始)
  readingSince: number | null; // 进入 reading 时刻(800ms 宽限基准,防上一题惯性连按误伤)
  countdownEndsAt: number | null;
  openedAt: number | null; // 开抢时刻(反应时间基准;答错重开时重置)
  winner: BuzzerWinner | null; // 不变量:winner!==null ⟺ sub==='locked'
  lateBuzzes: LateBuzz[];
  foulsThisRound: FoulRecord[]; // 本题抢跳名单(next 清)
  excluded: Record<string, true>; // 本题已答错被排除的键(next 清;arm 重开同题不清)
  lockedRound: Record<string, number>; // 抢跳锁表:键 → 禁到第几轮(含);next 时 prune
  lastJudge: JudgeResult | null;
  players: Record<string, BuzzerPlayerState>; // deviceId → 个人累计
}

export type BuzzerAction = { kind: 'buzz' };

// 进入 reading 后的宽限:上一题按钮解禁瞬间的惯性连按静默丢弃,不判罚(照 route_race 900ms 冷却思路)
const GRACE_MS = 800;
// 迟到按下最多记几条(大屏「慢了 xx 毫秒」展示用)
const MAX_LATE_BUZZES = 5;
// 本题抢跳名单展示上限(防恶意灌名单撑大状态)
const MAX_FOULS_SHOWN = 20;

/** 抢答键:团队一队一键(t: 命名空间),个人裸 deviceId(照 route-race racerKeyOf) */
function buzzKeyOf(meta: Pick<ActionMeta, 'deviceId' | 'teamId'>): string {
  return meta.teamId ? `t:${meta.teamId}` : meta.deviceId;
}

function freshPlayer(meta: Pick<ActionMeta, 'nickname' | 'teamId' | 'teamName'>): BuzzerPlayerState {
  return {
    nickname: meta.nickname,
    teamId: meta.teamId ?? null,
    teamName: meta.teamName ?? null,
    score: 0,
    wins: 0,
    fouls: 0,
  };
}

/** 玩家记录惰性建 + meta 队伍恒权威(null=真无队,不回落旧值 —— 照 route-race 幽灵队籍教训) */
function withPlayer(
  players: Record<string, BuzzerPlayerState>,
  meta: ActionMeta,
  patch: (p: BuzzerPlayerState) => BuzzerPlayerState,
): Record<string, BuzzerPlayerState> {
  const cur = players[meta.deviceId] ?? freshPlayer(meta);
  return {
    ...players,
    [meta.deviceId]: patch({
      ...cur,
      nickname: meta.nickname || cur.nickname,
      teamId: meta.teamId ?? null,
      teamName: meta.teamName ?? null,
    }),
  };
}

/** 当前是否被抢跳锁禁抢(个人键 + 队键双查:个人判罚只锁个人、整队判罚锁队键) */
function isLockedNow(state: BuzzerState, meta: Pick<ActionMeta, 'deviceId' | 'teamId'>): boolean {
  if ((state.lockedRound[meta.deviceId] ?? 0) >= state.roundNo) return true;
  if (meta.teamId && (state.lockedRound[`t:${meta.teamId}`] ?? 0) >= state.roundNo) return true;
  return false;
}

function leaderboard(state: BuzzerState): RankRow[] {
  return competitionRank(
    Object.entries(state.players).map(([deviceId, p]) => ({
      deviceId,
      nickname: p.nickname,
      score: p.score,
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
  topDeviceId: string | null; // 队内得分最高者(领奖台头像用)
}

/** 队伍榜:成员分和(照 tap_race teamStandings) */
function teamStandings(state: BuzzerState): TeamRow[] {
  const agg = new Map<
    string,
    { name: string; score: number; members: number; topDeviceId: string | null; topScore: number }
  >();
  for (const [deviceId, p] of Object.entries(state.players)) {
    if (!p.teamId) continue;
    const cur =
      agg.get(p.teamId) ?? { name: p.teamName ?? p.teamId, score: 0, members: 0, topDeviceId: null, topScore: -Infinity };
    cur.score += p.score;
    cur.members += 1;
    if (p.score > cur.topScore) {
      cur.topScore = p.score;
      cur.topDeviceId = deviceId;
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

/** 抢跳判罚:按 foulScope 写锁 + 记名单;已在禁抢中者重复按幂等忽略 */
function applyFoul(state: BuzzerState, meta: ActionMeta, cfg: BuzzerConfig): ReduceResult<BuzzerState> {
  if (isLockedNow(state, meta)) return { state };
  const key = cfg.foulScope === 'team' && meta.teamId ? `t:${meta.teamId}` : meta.deviceId;
  const untilRound = state.roundNo + (cfg.foulLockNextRound ? 1 : 0);
  const foul: FoulRecord = { key, nickname: meta.nickname, teamName: meta.teamName ?? null };
  return {
    state: {
      ...state,
      players: withPlayer(state.players, meta, (p) => ({ ...p, fouls: p.fouls + 1 })),
      lockedRound: { ...state.lockedRound, [key]: Math.max(state.lockedRound[key] ?? 0, untilRound) },
      foulsThisRound:
        state.foulsThisRound.length < MAX_FOULS_SHOWN ? [...state.foulsThisRound, foul] : state.foulsThisRound,
    },
    events: [
      { kind: 'buzz:foul', payload: { nickname: meta.nickname, teamName: meta.teamName ?? null, untilRound } },
    ],
  };
}

/** 开抢期有效抢答:第一个有效按下锁定 winner(reduce 串行,天然无并发) */
function tryWin(state: BuzzerState, meta: ActionMeta, cfg: BuzzerConfig): ReduceResult<BuzzerState> {
  if (isLockedNow(state, meta)) return { state }; // 判罚中(手机端按 remoteView 显示禁抢)
  const key = buzzKeyOf(meta);
  if (state.excluded[key]) return { state }; // 本题已答错被排除
  const openedAt = state.openedAt ?? meta.at;
  const reactionMs = Math.max(0, meta.at - openedAt);
  const winner: BuzzerWinner = {
    key,
    deviceId: meta.deviceId,
    nickname: meta.nickname,
    teamId: meta.teamId ?? null,
    teamName: meta.teamName ?? null,
    at: meta.at,
    reactionMs,
  };
  const events = [
    { kind: 'buzz:won', payload: { nickname: meta.nickname, teamName: meta.teamName ?? null, reactionMs } },
  ];
  if (cfg.scoring === 'buzz') {
    // 抢到即得分:+1 直接完题(winner 不留驻 —— 不变量 winner⟺locked)
    return {
      state: {
        ...state,
        sub: 'idle',
        winner: null,
        players: withPlayer(state.players, meta, (p) => ({ ...p, score: p.score + 1, wins: p.wins + 1 })),
        lastJudge: {
          roundNo: state.roundNo,
          kind: 'buzz',
          nickname: meta.nickname,
          teamName: meta.teamName ?? null,
          points: 1,
          reactionMs,
          at: meta.at,
        },
      },
      events,
    };
  }
  return {
    state: {
      ...state,
      sub: 'locked',
      winner,
      players: withPlayer(state.players, meta, (p) => ({ ...p, wins: p.wins + 1 })),
    },
    events,
  };
}

/** 已有人抢到后的迟到按下:记「慢了 xx 毫秒」(同键去重、无资格者不记) */
function recordLate(state: BuzzerState, meta: ActionMeta): ReduceResult<BuzzerState> {
  const w = state.winner;
  if (!w) return { state };
  const key = buzzKeyOf(meta);
  if (key === w.key) return { state }; // winner 本人/同队重复按
  if (isLockedNow(state, meta) || state.excluded[key]) return { state };
  if (state.lateBuzzes.length >= MAX_LATE_BUZZES) return { state };
  if (state.lateBuzzes.some((l) => l.key === key)) return { state };
  return {
    state: {
      ...state,
      lateBuzzes: [
        ...state.lateBuzzes,
        { key, nickname: meta.nickname, teamName: meta.teamName ?? null, deltaMs: Math.max(0, meta.at - w.at) },
      ],
    },
  };
}

export const buzzerGame: GameDef<BuzzerConfig, BuzzerState, BuzzerAction> = {
  type: 'buzzer',
  label: '抢答器',
  icon: 'BellRing',

  defaultConfig: {
    scoring: 'judge',
    pointsCorrect: 10,
    pointsWrong: 0,
    wrongReopen: true,
    countdownSec: 3,
    foulScope: 'player',
    foulLockNextRound: false,
  },

  validateConfig(input) {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    let correct = Math.round(Number(o.pointsCorrect));
    if (!Number.isFinite(correct)) correct = 10;
    correct = Math.min(1000, Math.max(1, correct));
    let wrong = Math.round(Number(o.pointsWrong));
    if (!Number.isFinite(wrong)) wrong = 0;
    wrong = Math.min(1000, Math.max(0, wrong));
    let cd = Math.round(Number(o.countdownSec));
    if (!Number.isFinite(cd)) cd = 3;
    cd = Math.min(10, Math.max(0, cd));
    return {
      scoring: o.scoring === 'buzz' ? 'buzz' : 'judge',
      pointsCorrect: correct,
      pointsWrong: wrong,
      wrongReopen: o.wrongReopen !== false,
      countdownSec: cd,
      foulScope: o.foulScope === 'team' ? 'team' : 'player',
      foulLockNextRound: o.foulLockNextRound === true,
    };
  },

  makeInitialState(_cfg, ctx: GameContext) {
    const players: Record<string, BuzzerPlayerState> = {};
    for (const p of ctx.players) {
      players[p.deviceId] = {
        nickname: p.nickname,
        teamId: p.teamId ?? null,
        teamName: p.teamName ?? null,
        score: 0,
        wins: 0,
        fouls: 0,
      };
    }
    return {
      status: 'ready' as const,
      sub: 'reading' as const,
      roundNo: 0,
      readingSince: null,
      countdownEndsAt: null,
      openedAt: null,
      winner: null,
      lateBuzzes: [],
      foulsThisRound: [],
      excluded: {},
      lockedRound: {},
      lastJudge: null,
      players,
    };
  },

  reduce(state, action, meta: ActionMeta, cfg): ReduceResult<BuzzerState> {
    if (action.kind !== 'buzz') return { state };
    // 防伪造队键:无队却自称 t: 前缀 deviceId(队伍 id 随投影广播可被抄走)
    if (!meta.teamId && meta.deviceId.startsWith('t:')) return { state };
    // 任何按下先按 meta 权威刷新玩家档案:激活后才选队的玩家在 state.players 里队伍是陈旧的,
    // 而「本队被禁/本队已答错」的手机显示依赖它 —— 首次交互即自愈(拦截判定本就用 meta,不受影响)
    const s: BuzzerState = { ...state, players: withPlayer(state.players, meta, (p) => p) };

    if (s.status === 'countdown') {
      // 倒计时边界修正:tick 是 400ms 粒度,GO 时刻已过但 tick 还没翻 → 是有效抢答不是抢跳
      // (openedAt 用 countdownEndsAt,与 tick 翻转同基准,reactionMs 口径一致)
      if (s.countdownEndsAt !== null && meta.at >= s.countdownEndsAt) {
        const opened: BuzzerState = {
          ...s,
          status: 'running',
          sub: 'open',
          countdownEndsAt: null,
          openedAt: s.countdownEndsAt,
        };
        return tryWin(opened, meta, cfg);
      }
      return applyFoul(s, meta, cfg); // 3-2-1 期间按下 = 抢跳
    }

    if (s.status !== 'running') return { state: s };
    switch (s.sub) {
      case 'reading':
        // 进入读题后的宽限期:上一题按钮解禁瞬间的惯性连按,静默丢弃不判罚
        if (s.readingSince !== null && meta.at - s.readingSince < GRACE_MS) return { state: s };
        return applyFoul(s, meta, cfg);
      case 'open':
        return tryWin(s, meta, cfg);
      case 'locked':
        return recordLate(s, meta);
      default:
        return { state: s }; // idle:本题已结束,按下无效不判罚
    }
  },

  control(state, cmd: ControlCmd, meta: ActionMeta, cfg): ReduceResult<BuzzerState> {
    if (cmd.kind === 'start') {
      if (state.status !== 'ready') return { state };
      return {
        state: {
          ...state,
          status: 'running',
          sub: 'reading',
          roundNo: 1,
          readingSince: meta.at,
          countdownEndsAt: null,
          openedAt: null,
          winner: null,
          lateBuzzes: [],
          foulsThisRound: [],
          excluded: {},
          lastJudge: null,
        },
        events: [{ kind: 'buzz:round', payload: { roundNo: 1 } }],
      };
    }
    if (cmd.kind === 'arm') {
      // 开抢!reading 正常路径;idle 也允许(误跳过后重开同一题的兜底,excluded 不清)
      if (state.status !== 'running' || (state.sub !== 'reading' && state.sub !== 'idle')) return { state };
      if (cfg.countdownSec > 0) {
        return {
          state: {
            ...state,
            status: 'countdown',
            countdownEndsAt: meta.at + cfg.countdownSec * 1000,
            openedAt: null,
            winner: null,
            lateBuzzes: [],
          },
          events: [{ kind: 'countdown:start' }],
        };
      }
      return {
        state: { ...state, sub: 'open', countdownEndsAt: null, openedAt: meta.at, winner: null, lateBuzzes: [] },
        events: [{ kind: 'buzz:open' }],
      };
    }
    if (cmd.kind === 'judge') {
      if (state.status !== 'running' || state.sub !== 'locked' || !state.winner) return { state };
      if (cfg.scoring !== 'judge') return { state };
      const ok = (cmd as { ok?: unknown }).ok === true;
      const w = state.winner;
      const wMeta: ActionMeta = {
        deviceId: w.deviceId,
        nickname: w.nickname,
        teamId: w.teamId,
        teamName: w.teamName,
        at: meta.at,
        isHost: false,
      };
      if (ok) {
        return {
          state: {
            ...state,
            sub: 'idle',
            winner: null,
            players: withPlayer(state.players, wMeta, (p) => ({ ...p, score: p.score + cfg.pointsCorrect })),
            lastJudge: {
              roundNo: state.roundNo,
              kind: 'correct',
              nickname: w.nickname,
              teamName: w.teamName,
              points: cfg.pointsCorrect,
              reactionMs: w.reactionMs,
              at: meta.at,
            },
          },
          events: [{ kind: 'buzz:judged', payload: { ok: true, nickname: w.nickname } }],
        };
      }
      const afterWrong: BuzzerState = {
        ...state,
        winner: null,
        players: withPlayer(state.players, wMeta, (p) => ({ ...p, score: p.score - cfg.pointsWrong })),
        excluded: { ...state.excluded, [w.key]: true as const },
        lastJudge: {
          roundNo: state.roundNo,
          kind: 'wrong',
          nickname: w.nickname,
          teamName: w.teamName,
          points: -cfg.pointsWrong,
          reactionMs: w.reactionMs,
          at: meta.at,
        },
      };
      if (cfg.wrongReopen) {
        // 重新开放继续抢:openedAt 重置(第二人反应时间从重开算),已答错者持续排除
        return {
          state: { ...afterWrong, sub: 'open', openedAt: meta.at, lateBuzzes: [] },
          events: [{ kind: 'buzz:reopen', payload: { nickname: w.nickname } }],
        };
      }
      return {
        state: { ...afterWrong, sub: 'idle' },
        events: [{ kind: 'buzz:judged', payload: { ok: false, nickname: w.nickname } }],
      };
    }
    if (cmd.kind === 'next') {
      // 下一题(从任意题内阶段可推进 = 隐含放弃本题;倒计时中也可)
      if (state.status !== 'running' && state.status !== 'countdown') return { state };
      const roundNo = state.roundNo + 1;
      const lockedRound: Record<string, number> = {};
      for (const [k, until] of Object.entries(state.lockedRound)) {
        if (until >= roundNo) lockedRound[k] = until; // prune 已过期的锁
      }
      return {
        state: {
          ...state,
          status: 'running',
          sub: 'reading',
          roundNo,
          readingSince: meta.at,
          countdownEndsAt: null,
          openedAt: null,
          winner: null,
          lateBuzzes: [],
          foulsThisRound: [],
          excluded: {},
          lockedRound,
        },
        events: [{ kind: 'buzz:round', payload: { roundNo } }],
      };
    }
    if (cmd.kind === 'end') {
      if (state.status === 'ended') return { state };
      return { state: { ...state, status: 'ended', sub: 'idle', winner: null }, ended: true };
    }
    if (cmd.kind === 'reset') {
      // 保留玩家名单+队伍,分数/锁表/排除全清(「再来一局」,照 tap_race)
      const players: Record<string, BuzzerPlayerState> = {};
      for (const [k, v] of Object.entries(state.players)) {
        players[k] = { nickname: v.nickname, teamId: v.teamId, teamName: v.teamName, score: 0, wins: 0, fouls: 0 };
      }
      return {
        state: {
          status: 'ready',
          sub: 'reading',
          roundNo: 0,
          readingSince: null,
          countdownEndsAt: null,
          openedAt: null,
          winner: null,
          lateBuzzes: [],
          foulsThisRound: [],
          excluded: {},
          lockedRound: {},
          lastJudge: null,
          players,
        },
      };
    }
    return { state };
  },

  tick(state, now): ReduceResult<BuzzerState> | null {
    if (state.status === 'countdown') {
      if (state.countdownEndsAt !== null && now >= state.countdownEndsAt) {
        return {
          state: {
            ...state,
            status: 'running',
            sub: 'open',
            countdownEndsAt: null,
            openedAt: state.countdownEndsAt,
          },
          events: [{ kind: 'buzz:open' }],
        };
      }
      return { state }; // 倒计时进行中:定频广播刷新 3-2-1
    }
    return null; // 其余阶段无计时驱动(抢答/判定由动作推进,合批广播兜底)
  },

  settle(state, cfg) {
    const teams = teamStandings(state);
    return {
      ranking: leaderboard(state),
      extra: {
        rounds: state.roundNo,
        scoring: cfg.scoring,
        ...(teams.length ? { teams } : {}),
      },
    };
  },

  projectScreen(state, cfg) {
    const teams = teamStandings(state);
    return {
      status: state.status,
      sub: state.sub,
      roundNo: state.roundNo,
      scoring: cfg.scoring,
      pointsCorrect: cfg.pointsCorrect,
      pointsWrong: cfg.pointsWrong,
      wrongReopen: cfg.wrongReopen,
      countdownSec: cfg.countdownSec,
      foulScope: cfg.foulScope,
      foulLockNextRound: cfg.foulLockNextRound,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      // 抢答后闪避(投影约定字段,大屏 bgmDuckOf 消费):有人抢到(locked)~本题收尾(idle)期间
      // 背景音压到 1%,别盖住答题人/主持人说话;重新开抢/下一题自动恢复
      bgmDuck: state.status === 'running' && (state.sub === 'locked' || state.sub === 'idle') ? 0.01 : 1,
      playerCount: Object.keys(state.players).length,
      hasTeams: teams.length > 0,
      teams,
      leaderboard: leaderboard(state).slice(0, 20),
      winner: state.winner
        ? {
            deviceId: state.winner.deviceId,
            nickname: state.winner.nickname,
            teamId: state.winner.teamId,
            teamName: state.winner.teamName,
            reactionMs: state.winner.reactionMs,
          }
        : null,
      lateBuzzes: state.lateBuzzes.map((l) => ({ nickname: l.nickname, teamName: l.teamName, deltaMs: l.deltaMs })),
      fouls: state.foulsThisRound.map((f) => ({ nickname: f.nickname, teamName: f.teamName })),
      excludedCount: Object.keys(state.excluded).length,
      lastJudge: state.lastJudge,
    };
  },

  projectRemote(state, cfg, deviceId) {
    const me = state.players[deviceId];
    const board = leaderboard(state);
    const mine = board.find((r) => r.deviceId === deviceId);
    const teams = teamStandings(state);
    const myTeam = me?.teamId ? teams.find((t) => t.teamId === me.teamId) : null;
    const myKey = me?.teamId ? `t:${me.teamId}` : deviceId;
    const lockedUntil = Math.max(
      state.lockedRound[deviceId] ?? 0,
      me?.teamId ? state.lockedRound[`t:${me.teamId}`] ?? 0 : 0,
    );
    const w = state.winner;
    return {
      status: state.status,
      sub: state.sub,
      roundNo: state.roundNo,
      scoring: cfg.scoring,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      openedAt: state.openedAt, // 手机本地按下锁的 key 成分(答错重开会变 → 按钮自动解锁)
      myScore: me?.score ?? 0,
      myRank: mine?.rank ?? null,
      myWins: me?.wins ?? 0,
      myFouls: me?.fouls ?? 0,
      myTeamId: me?.teamId ?? null,
      myTeamName: me?.teamName ?? null,
      myTeamScore: myTeam?.score ?? null,
      myTeamRank: myTeam?.rank ?? null,
      iWon: w !== null && w.deviceId === deviceId,
      winnerIsMyTeam: w !== null && me?.teamId != null && w.teamId === me.teamId,
      winnerName: w ? (w.teamName ? `${w.teamName} · ${w.nickname}` : w.nickname) : null,
      winnerReactionMs: w?.reactionMs ?? null,
      lockedUntilRound: lockedUntil >= state.roundNo && state.roundNo > 0 ? lockedUntil : null, // null=无判罚生效
      amExcluded: state.excluded[myKey] === true,
      lastJudge: state.lastJudge,
      playerCount: Object.keys(state.players).length,
    };
  },
};
