/**
 * 游戏注册表契约 —— 照 task/fields、showcase/tools 的双端注册表范式。
 *
 * 加一个新游戏 =
 *   ① 后端 games/<type>.game.ts 写一个 GameDef 对象 + games/registry.ts 注册一行
 *   ② 前端 features/interactive/games/<type>.tsx 写 { Screen, Remote, Config } + registry 注册一行
 * 不动实时基座(网关 / 房间服务)。
 *
 * 铁律:Config / State / Action / View 全部**必须 JSON 可序列化** —— 要走 WebSocket 传输、
 * 存进内存房间态、结算快照落库。禁止在 State 里放函数 / 类实例 / Map / Set。
 *
 * 服务端权威:客户端只发「意图动作」(player:action / host:control);所有状态迁移由服务端
 * reduce/control/tick 计算,再经 projectScreen / projectRemote 投影下发。手机不本地算分。
 */

/** 玩家引用(makeInitialState 拿到当前在房名单用) */
export interface PlayerRef {
  deviceId: string;
  nickname: string;
  teamId?: string | null;
  teamName?: string | null;
}

/** 一局开局时的上下文 */
export interface GameContext {
  roomCode: string;
  players: PlayerRef[];
}

/** 一个动作的服务端元信息(权威时刻、发起人身份 + 分组) */
export interface ActionMeta {
  deviceId: string;
  nickname: string;
  teamId?: string | null; // 分组对抗:发起人所属队(individual 模式为 null)
  teamName?: string | null;
  at: number; // 服务端接收时刻(epoch ms,权威)
  isHost: boolean;
}

/** 主持控制指令(游戏私有动作在 kind 上扩展) */
export type ControlCmd =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'reset' }
  | { kind: 'next' }
  | { kind: string; [k: string]: unknown };

/** 触发大屏一次性动画/音效的瞬时事件(丢失可容忍,不承载权威状态) */
export interface ScreenEvent {
  kind: string; // 'game:started' | 'rank:up' | 'answer:correct' | 'wheel:landed' ...
  payload?: unknown;
}

/** reduce/control/tick 的返回:新状态 + 可选瞬时事件 + 是否结束 */
export interface ReduceResult<S> {
  state: S;
  events?: ScreenEvent[];
  ended?: boolean; // true → 房间服务调 settle 落库、广播结算
}

/** 结算榜单一行(竞争排名 1,2,2,4) */
export interface RankRow {
  deviceId: string;
  nickname: string;
  score: number;
  rank: number;
  teamId?: string | null;
}

/** 一局结算快照(落 InteractiveRound.resultJson) */
export interface Settlement {
  ranking: RankRow[];
  extra?: Record<string, unknown>;
}

/**
 * 游戏定义契约。泛型默认 unknown —— 注册表以 `GameDef`(全 unknown)存储;
 * 具体游戏用窄类型实现后 `as GameDef` 收敛(见 registry.ts,规避方法参数逆变不兼容)。
 */
export interface GameDef<
  Config = unknown,
  State = unknown,
  Action = unknown,
  ScreenView = unknown,
  RemoteView = unknown,
> {
  type: string;
  label: string;
  icon: string; // lucide 图标名(配置台/大屏用)

  /** 默认配置 */
  defaultConfig: Config;
  /** 归一化 + 白名单重建,非法回退默认(照 normalizeFieldDefs 安全网) */
  validateConfig(input: unknown): Config;

  /** 开一局:据配置 + 当前在房名单建初始状态 */
  makeInitialState(cfg: Config, ctx: GameContext): State;
  /** 玩家动作(服务端权威 reduce) */
  reduce(state: State, action: Action, meta: ActionMeta, cfg: Config): ReduceResult<State>;
  /** 主持动作 start/end/reset/next(游戏私有语义) */
  control(state: State, cmd: ControlCmd, meta: ActionMeta, cfg: Config): ReduceResult<State>;
  /** 倒计时驱动(房间服务定频调用;无变化返回 null) */
  tick(state: State, now: number, cfg: Config): ReduceResult<State> | null;
  /** 结束结算 */
  settle(state: State, cfg: Config): Settlement;

  /** 大屏视图投影(广播给整房;手机端忽略) */
  projectScreen(state: State, cfg: Config): ScreenView;
  /** 手机视图投影(单播给每个 player;deviceId=收件人) */
  projectRemote(state: State, cfg: Config, deviceId: string): RemoteView;
}

/** 竞争排名:按分降序,同分并列取小名次(1,2,2,4) */
export function competitionRank(
  rows: { deviceId: string; nickname: string; score: number; teamId?: string | null }[],
): RankRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((r, i) => {
    let rank: number;
    if (lastScore !== null && r.score === lastScore) {
      rank = lastRank;
    } else {
      rank = i + 1;
      lastRank = rank;
      lastScore = r.score;
    }
    return {
      deviceId: r.deviceId,
      nickname: r.nickname,
      score: r.score,
      rank,
      teamId: r.teamId ?? null,
    };
  });
}

/** 安全解析 JSON 字符串(失败回退空对象) */
export function safeParseConfig(raw: string | null | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
