import {
  type ActionMeta,
  type ControlCmd,
  type GameContext,
  type GameDef,
  type RankRow,
  type ReduceResult,
  type ScreenEvent,
  competitionRank,
} from '../game-def';
import { CHECKPOINT_KINDS, type AnswerAction, type Checkpoint, type CheckpointKind } from '../checkpoints';
import { computeGates, normalizeRouteRaceDesign, type RouteRaceDesign } from '../route-race-design';

/**
 * 自制闯关赛(route_race)—— 互动游戏编辑器的运行时:玩家连点让角色沿自定义路线行进,
 * 路线上有关卡(答题/图片找错)拦截,答对通过、答错退回 N 步重新挑战;时限内冲终点,
 * 先到者按完成时间排名、未到者按进度排名。
 *
 * 与 tap_race 的关系:连点上报管线/限速/3-2-1 倒计时逐行移植,但 State 以「racer」为单位 ——
 * 个人赛一玩家一 racer、团队赛一队一 racer(racerKey = meta.teamId ?? meta.deviceId,动态归并;
 * makeInitialState 拿不到 grouping,团队与否纯由玩家动作的 meta 派生)。
 * 团队规则(用户定案):全队点击共同推进,撞关后全队手机同题,第 1 人答对全队通过,答错全队共担退步。
 *
 * 脱敏铁律:projectRemote 的 challenge 只带题面(quiz 无 correctIdx / spot 无 regions),
 * 判定只在服务端 reduce 内做(CHECKPOINT_KINDS[kind].judge)。
 */

export interface RouteRaceConfig extends Omit<RouteRaceDesign, 'sound'> {
  designId?: string; // 溯源:来自哪个设计(「重新同步设计」按钮用;快照后本节目独立)
  designName?: string;
}

interface RacerState {
  name: string; // 个人=昵称;团队=队名
  teamId: string | null;
  steps: number; // 0..totalSteps
  finishedAt: number | null; // 冲线时刻(epoch ms;null=未完赛)
  blockedCpIdx: number | null; // 被 checkpoints[i] 拦住答题中;null=畅通
  passedCp: Record<string, true>; // 已过关卡(key=String(cpIdx));退步跨回不重锁
  itemIdx: Record<string, number>; // 每关轮换指针(答错 +1,% itemCount 循环出题)
  nonce: number; // 出题序号:进入拦截/答错轮换时 +1(答案竞态闸:旧题答案作废)
  wrongCount: number;
  lastResult: { nonce: number; correct: boolean; by: string; at: number; penalty?: number } | null;
}

interface PlayerRate {
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  taps: number; // 个人有效点击贡献(限速裁平后;团队赛的个人副榜)
  rateWinStart: number; // 限速滑动窗(按玩家,不按 racer —— 团队人多推进快是玩法本体)
  rateWinCount: number;
}

export interface RouteRaceState {
  status: 'ready' | 'countdown' | 'running' | 'ended';
  countdownEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  racers: Record<string, RacerState>; // key = teamId | deviceId
  players: Record<string, PlayerRate>; // key = deviceId
}

export type RouteRaceAction = { kind: 'tap'; n?: number } | AnswerAction;

// 与 tap-race 同一套服务端权威限速(多指/脚本/伪造大 n 都被裁平)
const MAX_TAPS_PER_ACTION = 25;
const MAX_TAPS_PER_SEC = 15;
const COUNTDOWN_MS = 3000;

function fid(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 64) : undefined;
}

function racerKeyOf(meta: Pick<ActionMeta, 'deviceId' | 'teamId'>): string {
  return meta.teamId ?? meta.deviceId;
}

function newRacer(meta: Pick<ActionMeta, 'nickname' | 'teamId' | 'teamName'>): RacerState {
  return {
    name: meta.teamId ? meta.teamName ?? '队伍' : meta.nickname,
    teamId: meta.teamId ?? null,
    steps: 0,
    finishedAt: null,
    blockedCpIdx: null,
    passedCp: {},
    itemIdx: {},
    nonce: 0,
    wrongCount: 0,
    lastResult: null,
  };
}

function newPlayer(meta: Pick<ActionMeta, 'nickname' | 'teamId' | 'teamName'>): PlayerRate {
  return {
    nickname: meta.nickname,
    teamId: meta.teamId ?? null,
    teamName: meta.teamName ?? null,
    taps: 0,
    rateWinStart: 0,
    rateWinCount: 0,
  };
}

interface RankedRacer {
  key: string;
  racer: RacerState;
  rank: number;
}

/**
 * 两段排名(competitionRank 表达不了,自写):完成者按 finishedAt 升序在前(同 ms 并列取小名次),
 * 未完成者按 steps 降序接续(同步数并列);段间不并列(量纲不同)。
 */
function rankRacers(racers: Record<string, RacerState>): RankedRacer[] {
  const entries = Object.entries(racers);
  const finished = entries
    .filter(([, r]) => r.finishedAt !== null)
    .sort((a, b) => (a[1].finishedAt as number) - (b[1].finishedAt as number));
  const unfinished = entries.filter(([, r]) => r.finishedAt === null).sort((a, b) => b[1].steps - a[1].steps);
  const out: RankedRacer[] = [];
  let idx = 0;
  let lastRank = 0;
  let lastVal: number | null = null;
  const push = (key: string, racer: RacerState, val: number): void => {
    idx += 1;
    const rank = lastVal !== null && val === lastVal ? lastRank : idx;
    lastRank = rank;
    lastVal = val;
    out.push({ key, racer, rank });
  };
  for (const [key, r] of finished) push(key, r, r.finishedAt as number);
  lastVal = null; // 段间重置:未完成者不与完成者并列
  for (const [key, r] of unfinished) push(key, r, r.steps);
  return out;
}

/** 按队聚合玩家贡献(领奖台头像取队内点击最高者,照 tap_race topDeviceId 惯例) */
function teamMetaOf(
  players: Record<string, PlayerRate>,
): Record<string, { members: number; topDeviceId: string | null; topTaps: number }> {
  const out: Record<string, { members: number; topDeviceId: string | null; topTaps: number }> = {};
  for (const [deviceId, p] of Object.entries(players)) {
    if (!p.teamId) continue;
    const cur = out[p.teamId] ?? { members: 0, topDeviceId: null, topTaps: -1 };
    cur.members += 1;
    if (p.taps > cur.topTaps) {
      cur.topTaps = p.taps;
      cur.topDeviceId = deviceId;
    }
    out[p.teamId] = cur;
  }
  return out;
}

function reduceTap(
  state: RouteRaceState,
  action: { kind: 'tap'; n?: number },
  meta: ActionMeta,
  cfg: RouteRaceConfig,
): ReduceResult<RouteRaceState> {
  const key = racerKeyOf(meta);
  const racer = state.racers[key] ?? newRacer(meta);
  // 拦截中/已完赛:点击无效(不消耗限速窗、不计贡献 —— 该答题就去答题)。
  // 但**必须同步玩家身份**(meta 优先,与下方正常路径同语义):projectRemote 按
  // players[deviceId].teamId 找团队 racer —— 激活时播种的玩家 teamId 还是选队前的旧值,
  // 队友在队伍被拦截期间点击若被整个丢弃,他的手机将永远看不到团队题目(E2E 实测抓到)。
  if (racer.finishedAt !== null || racer.blockedCpIdx !== null) {
    const p0 = state.players[meta.deviceId];
    const teamId = meta.teamId ?? p0?.teamId ?? null;
    if (p0 && p0.teamId === teamId) return { state };
    const next: PlayerRate = p0
      ? { ...p0, nickname: meta.nickname || p0.nickname, teamId, teamName: meta.teamName ?? p0.teamName ?? null }
      : newPlayer(meta);
    return { state: { ...state, players: { ...state.players, [meta.deviceId]: next } } };
  }

  const rawN = Math.round(Number(action.n) || 1);
  const n = Math.min(MAX_TAPS_PER_ACTION, Math.max(1, rawN));
  const p = state.players[meta.deviceId] ?? newPlayer(meta);
  let winStart = p.rateWinStart;
  let winCount = p.rateWinCount;
  if (meta.at - winStart >= 1000) {
    winStart = meta.at;
    winCount = 0;
  }
  const grant = Math.max(0, Math.min(n, MAX_TAPS_PER_SEC - winCount));
  winCount += grant;
  const players = {
    ...state.players,
    [meta.deviceId]: {
      ...p,
      nickname: meta.nickname || p.nickname,
      teamId: meta.teamId ?? p.teamId ?? null,
      teamName: meta.teamName ?? p.teamName ?? null,
      taps: p.taps + grant,
      rateWinStart: winStart,
      rateWinCount: winCount,
    },
  };
  if (grant <= 0) return { state: { ...state, players } };

  const totalSteps = cfg.board.totalSteps;
  const gates = computeGates(cfg.board.checkpoints, totalSteps);
  // 下一未过关卡(拦截中不会走到这;steps===gate 且未过 → 立即重新拦截,自愈)
  let nextIdx: number | null = null;
  for (let i = 0; i < gates.length; i++) {
    if (!racer.passedCp[String(i)] && gates[i] >= racer.steps) {
      nextIdx = i;
      break;
    }
  }
  const cap = nextIdx !== null ? gates[nextIdx] : totalSteps;
  const newSteps = Math.min(racer.steps + grant, cap);
  const r2: RacerState = { ...racer, steps: newSteps };
  const events: ScreenEvent[] = [];
  if (nextIdx !== null && newSteps === gates[nextIdx]) {
    r2.blockedCpIdx = nextIdx;
    r2.nonce = racer.nonce + 1;
    events.push({ kind: 'cp:reached', payload: { key, cpIdx: nextIdx, cpKind: cfg.board.checkpoints[nextIdx].kind } });
  } else if (nextIdx === null && newSteps >= totalSteps) {
    // 冲线只记时刻不提前结束局(观众未必都点过,racer 集合不代表全场;时限/主持人「结束」收尾)
    r2.finishedAt = meta.at;
    events.push({ kind: 'racer:finished', payload: { key, name: r2.name } });
  }
  return {
    state: { ...state, players, racers: { ...state.racers, [key]: r2 } },
    events: events.length ? events : undefined,
  };
}

function reduceAnswer(
  state: RouteRaceState,
  action: AnswerAction,
  meta: ActionMeta,
  cfg: RouteRaceConfig,
): ReduceResult<RouteRaceState> {
  const key = racerKeyOf(meta);
  const racer = state.racers[key];
  // ── 答案竞态三重闸(团队防双奖/双罚的关键,缺一不可) ──
  if (!racer || racer.blockedCpIdx === null) return { state }; // 闸1:队友已答对解锁 → 在途答案自然失效
  const cpIdx = racer.blockedCpIdx;
  const cp = cfg.board.checkpoints[cpIdx];
  if (!cp || cp.id !== String(action.cpId ?? '')) return { state }; // 闸2:答的不是当前关
  if (Number(action.nonce) !== racer.nonce) return { state }; // 闸3:已轮换,旧题答案作废(不双重惩罚)

  const spec = CHECKPOINT_KINDS[cp.kind];
  const count = Math.max(1, spec.itemCount(cp));
  const itemIdx = (racer.itemIdx[String(cpIdx)] ?? 0) % count;
  const correct = spec.judge(cp, itemIdx, action);
  const totalSteps = cfg.board.totalSteps;
  const gates = computeGates(cfg.board.checkpoints, totalSteps);

  if (correct) {
    const r2: RacerState = {
      ...racer,
      passedCp: { ...racer.passedCp, [String(cpIdx)]: true },
      blockedCpIdx: null,
      lastResult: { nonce: racer.nonce, correct: true, by: meta.nickname, at: meta.at },
    };
    const events: ScreenEvent[] = [{ kind: 'answer:correct', payload: { key, cpIdx, by: meta.nickname } }];
    // 关卡在终点(gate===totalSteps):答对即完赛(拦截时 steps 恒等于 gate)
    if (gates[cpIdx] >= totalSteps) {
      r2.finishedAt = meta.at;
      events.push({ kind: 'racer:finished', payload: { key, name: r2.name } });
    }
    return { state: { ...state, racers: { ...state.racers, [key]: r2 } }, events };
  }

  // 答错:退回 penaltySteps 重新挑战直到答对;轮换下一题(nonce+1 使旧题答案作废)。
  // penalty=0 → 退回后仍在阈值上 → 保持拦截原地换题;>0 → 解除拦截,点回来再触发。
  // 退步可能跨过更早的关卡 —— 都已 passedCp,回程不重锁(reduceTap 只找未过关)。
  const penalty = cp.penaltySteps;
  const newSteps = Math.max(0, racer.steps - penalty);
  const stillAtGate = newSteps === gates[cpIdx];
  const r2: RacerState = {
    ...racer,
    steps: newSteps,
    wrongCount: racer.wrongCount + 1,
    itemIdx: { ...racer.itemIdx, [String(cpIdx)]: itemIdx + 1 },
    nonce: racer.nonce + 1,
    blockedCpIdx: stillAtGate ? cpIdx : null,
    lastResult: { nonce: racer.nonce, correct: false, by: meta.nickname, at: meta.at, penalty },
  };
  return {
    state: { ...state, racers: { ...state.racers, [key]: r2 } },
    events: [{ kind: 'answer:wrong', payload: { key, cpIdx, by: meta.nickname, penalty } }],
  };
}

/** 拦截中的 racer 的当前题目(脱敏投影:quiz 无 correctIdx / spot 无 regions) */
function challengeOf(racer: RacerState, cfg: RouteRaceConfig): Record<string, unknown> | null {
  if (racer.blockedCpIdx === null) return null;
  const cp = cfg.board.checkpoints[racer.blockedCpIdx];
  if (!cp) return null;
  const spec = CHECKPOINT_KINDS[cp.kind];
  const count = Math.max(1, spec.itemCount(cp));
  const idx = (racer.itemIdx[String(racer.blockedCpIdx)] ?? 0) % count;
  const out: Record<string, unknown> = {
    cpId: cp.id,
    kind: cp.kind,
    nonce: racer.nonce,
    penaltySteps: cp.penaltySteps,
  };
  if (cp.title) out.title = cp.title;
  if (cp.kind === 'quiz') {
    const q = cp.quiz?.questions[idx];
    if (!q) return null;
    out.quiz = { text: q.text, options: q.options, ...(q.imageFileId ? { imageFileId: q.imageFileId } : {}) };
  } else if (cp.kind === 'spot') {
    const p = cp.spot?.puzzles[idx];
    if (!p) return null;
    out.spot = { imageFileId: p.imageFileId, ...(p.prompt ? { prompt: p.prompt } : {}) };
  }
  return out;
}

export const routeRaceGame: GameDef<RouteRaceConfig, RouteRaceState, RouteRaceAction> = {
  type: 'route_race',
  label: '自制闯关赛',
  icon: 'Map',

  defaultConfig: normalizeRouteRaceDesign({}) as RouteRaceConfig,

  validateConfig(input) {
    const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const design = normalizeRouteRaceDesign(o);
    delete design.sound; // 音效由 service 统一归一化拼进 configJson 顶层,玩法 config 不留副本
    const out: RouteRaceConfig = { ...design };
    const did = fid(o.designId);
    if (did) out.designId = did;
    const dname = typeof o.designName === 'string' ? o.designName.trim().slice(0, 60) : '';
    if (dname) out.designName = dname;
    return out;
  },

  makeInitialState(_cfg, ctx: GameContext) {
    // 只播种 players(花名册/贡献榜);racer **完全动态**(首个动作时按 meta.teamId??deviceId 建)——
    // 团队模式玩家在激活后才选队,激活时播种会按无队身份留下一批 0 步「僵尸」个人 racer 污染大屏。
    const players: Record<string, PlayerRate> = {};
    for (const p of ctx.players) players[p.deviceId] = newPlayer(p);
    return { status: 'ready', countdownEndsAt: null, startedAt: null, endsAt: null, racers: {}, players };
  },

  reduce(state, action, meta: ActionMeta, cfg): ReduceResult<RouteRaceState> {
    if (state.status !== 'running') return { state };
    if (action.kind === 'tap') return reduceTap(state, action, meta, cfg);
    if (action.kind === 'answer') return reduceAnswer(state, action, meta, cfg);
    return { state };
  },

  control(state, cmd: ControlCmd, meta: ActionMeta): ReduceResult<RouteRaceState> {
    if (cmd.kind === 'start') {
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
      // 再来一局:保留玩家名单、清零贡献/限速窗;racer 清空(下局首个动作重建,ready 期可换队不留旧键)
      const players: Record<string, PlayerRate> = {};
      for (const [k, p] of Object.entries(state.players)) {
        players[k] = { ...p, taps: 0, rateWinStart: 0, rateWinCount: 0 };
      }
      return { state: { status: 'ready', countdownEndsAt: null, startedAt: null, endsAt: null, racers: {}, players } };
    }
    return { state };
  },

  tick(state, now, cfg): ReduceResult<RouteRaceState> | null {
    if (state.status === 'countdown') {
      if (state.countdownEndsAt !== null && now >= state.countdownEndsAt) {
        return {
          state: {
            ...state,
            status: 'running',
            countdownEndsAt: null,
            startedAt: now,
            endsAt: now + cfg.durationSec * 1000,
          },
          events: [{ kind: 'game:started' }],
        };
      }
      return { state }; // 倒计时进行中:定频广播刷新 3-2-1
    }
    if (state.status === 'running') {
      if (state.endsAt !== null && now >= state.endsAt) {
        // 时间到:拦截中的 racer 照常按当前 steps 入榜(不减分)
        return { state: { ...state, status: 'ended' }, ended: true, events: [{ kind: 'game:timeup' }] };
      }
      return { state };
    }
    return null;
  },

  settle(state, cfg) {
    const standings = rankRacers(state.racers);
    const tm = teamMetaOf(state.players);
    // ranking = 个人贡献榜(照 tap_race:score=有效点击数;团队赛的个人副榜)
    const ranking: RankRow[] = competitionRank(
      Object.entries(state.players).map(([deviceId, p]) => ({
        deviceId,
        nickname: p.nickname,
        score: p.taps,
        teamId: p.teamId,
      })),
    );
    const racersOut = standings.map((s) => ({
      key: s.key,
      name: s.racer.name,
      teamId: s.racer.teamId,
      steps: s.racer.steps,
      finishedAt: s.racer.finishedAt,
      rank: s.rank,
      wrongCount: s.racer.wrongCount,
    }));
    const teams = standings
      .filter((s) => s.racer.teamId !== null)
      .map((s) => ({
        teamId: s.racer.teamId as string,
        name: s.racer.name,
        rank: s.rank,
        steps: s.racer.steps,
        finishedAt: s.racer.finishedAt,
        memberCount: tm[s.racer.teamId as string]?.members ?? 0,
        topDeviceId: tm[s.racer.teamId as string]?.topDeviceId ?? null,
      }));
    return {
      ranking,
      extra: {
        racers: racersOut,
        totalSteps: cfg.board.totalSteps,
        ...(teams.length ? { teams } : {}),
      },
    };
  },

  projectScreen(state, cfg) {
    const standings = rankRacers(state.racers);
    const tm = teamMetaOf(state.players);
    return {
      status: state.status,
      durationSec: cfg.durationSec,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      remainMs: state.endsAt !== null ? Math.max(0, state.endsAt - Date.now()) : cfg.durationSec * 1000,
      playerCount: Object.keys(state.players).length,
      racerCount: standings.length,
      totalSteps: cfg.board.totalSteps,
      teamMode: standings.some((s) => s.racer.teamId !== null),
      board: {
        backgroundFileId: cfg.board.backgroundFileId,
        bgSize: cfg.board.bgSize,
        route: cfg.board.route,
        sprites: cfg.board.sprites,
        spriteSizePct: cfg.board.spriteSizePct,
        // 大屏只需关卡位置/类型/标题 —— 题面/答案/热区一概不下发
        checkpoints: cfg.board.checkpoints.map((c: Checkpoint) => ({
          id: c.id,
          kind: c.kind,
          t: c.t,
          ...(c.title ? { title: c.title } : {}),
        })),
      },
      lobby: cfg.lobby,
      award: cfg.award,
      racers: standings.slice(0, 20).map((s) => ({
        key: s.key,
        name: s.racer.name,
        teamId: s.racer.teamId,
        steps: s.racer.steps,
        finishedAt: s.racer.finishedAt,
        rank: s.rank,
        blocked: s.racer.blockedCpIdx !== null,
        blockedKind: (s.racer.blockedCpIdx !== null
          ? cfg.board.checkpoints[s.racer.blockedCpIdx]?.kind
          : undefined) as CheckpointKind | undefined,
        // 头像取谁:个人 racer=本人 deviceId;团队 racer=队内点击最高者(照 race topDeviceId 惯例)
        avatarDeviceId: s.racer.teamId ? (tm[s.racer.teamId]?.topDeviceId ?? null) : s.key,
        memberCount: s.racer.teamId ? (tm[s.racer.teamId]?.members ?? 0) : undefined,
      })),
    };
  },

  projectRemote(state, cfg, deviceId) {
    const me = state.players[deviceId];
    const key = me?.teamId ?? deviceId;
    const racer = state.racers[key];
    const standings = rankRacers(state.racers);
    const mine = standings.find((s) => s.key === key);
    return {
      status: state.status,
      countdownRemainMs: state.countdownEndsAt !== null ? Math.max(0, state.countdownEndsAt - Date.now()) : 0,
      remainMs: state.endsAt !== null ? Math.max(0, state.endsAt - Date.now()) : cfg.durationSec * 1000,
      totalSteps: cfg.board.totalSteps,
      mySteps: racer?.steps ?? 0,
      myRank: mine?.rank ?? null,
      myFinishedAt: racer?.finishedAt ?? null,
      myTaps: me?.taps ?? 0,
      myTeamId: me?.teamId ?? null,
      myTeamName: me?.teamName ?? null,
      playerCount: Object.keys(state.players).length,
      racerCount: standings.length,
      challenge: racer && state.status === 'running' ? challengeOf(racer, cfg) : null,
      lastResult: racer?.lastResult ?? null,
      remoteBgFileId: cfg.remoteBgFileId,
    };
  },
};
