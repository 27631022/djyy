import { api, apiOrigin } from "@/shared/api/client";
import readyMp3 from "./assets/sounds/ready.mp3";
import countdownMp3 from "./assets/sounds/countdown.mp3";
import playingMp3 from "./assets/sounds/playing.mp3";
import cheerMp3 from "./assets/sounds/cheer.mp3";
import endingMp3 from "./assets/sounds/ending.mp3";

/** socket.io 连后端 3001 同源(默认握手路径 /socket.io/,不受 setGlobalPrefix('api') 影响)。 */
export const INTERACTIVE_SOCKET_URL = apiOrigin;

export interface InteractiveRound {
  id: string;
  seq: number;
  status: string; // running | ended
  resultJson: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface InteractiveGame {
  id: string;
  gameType: string;
  title: string;
  orderIdx: number;
  configJson: string;
  status: string; // pending | active | done
  rounds?: InteractiveRound[];
}

export interface EventTeam {
  id: string;
  name: string;
  color: string;
}

/** 一个音效(镜像后端 event-config.ts):fileId 空=用内置默认音;可调循环/次数/延迟/音量/截取 */
export interface SoundEffect {
  fileId?: string;
  name?: string;
  loop: boolean;
  playCount: number;
  delayMs: number;
  volume: number;
  clipStart: number;
  clipEnd: number;
}
export type SoundKey = "ready" | "countdown" | "playing" | "cheer" | "ending";
export interface EventSound {
  enabled: boolean;
  effects: Record<SoundKey, SoundEffect>;
}
export const SOUND_SLOTS: { key: SoundKey; label: string }[] = [
  { key: "ready", label: "准备" },
  { key: "countdown", label: "倒计时" },
  { key: "playing", label: "进行中" },
  { key: "cheer", label: "欢呼声" },
  { key: "ending", label: "结束" },
];
const DEF_EFFECT: Record<SoundKey, SoundEffect> = {
  ready: { loop: true, playCount: 1, delayMs: 0, volume: 0.8, clipStart: 0, clipEnd: 0 },
  countdown: { loop: false, playCount: 1, delayMs: 0, volume: 1, clipStart: 0, clipEnd: 0 },
  playing: { loop: true, playCount: 1, delayMs: 0, volume: 0.7, clipStart: 0, clipEnd: 0 },
  cheer: { loop: false, playCount: 1, delayMs: 0, volume: 1, clipStart: 0, clipEnd: 0 },
  ending: { loop: true, playCount: 1, delayMs: 0, volume: 0.9, clipStart: 0, clipEnd: 0 },
};
function defaultSound(): EventSound {
  return {
    enabled: false,
    effects: {
      ready: { ...DEF_EFFECT.ready },
      countdown: { ...DEF_EFFECT.countdown },
      playing: { ...DEF_EFFECT.playing },
      cheer: { ...DEF_EFFECT.cheer },
      ending: { ...DEF_EFFECT.ending },
    },
  };
}
/** 内置默认音(用户提供的 5 段:准备/倒计时/进行中/欢呼声/结束);音效未上传覆盖时用这些 */
export const DEFAULT_SOUND_URL: Record<SoundKey, string> = {
  ready: readyMp3,
  countdown: countdownMp3,
  playing: playingMp3,
  cheer: cheerMp3,
  ending: endingMp3,
};

/** 节目级音效初始值:同一套默认音,但每个节目独立一份(不共用);节目音效默认启用 */
export function defaultGameSound(): EventSound {
  return { ...defaultSound(), enabled: true };
}

/** 从节目 configJson 解析其独立音效(填默认;权威归一化在后端 normalizeGameSound) */
export function parseGameSound(raw: string | null | undefined): EventSound {
  const ds = defaultGameSound();
  if (!raw) return ds;
  try {
    const o = JSON.parse(raw) as { sound?: { enabled?: boolean; effects?: Partial<Record<SoundKey, Partial<SoundEffect>>> } };
    const so = o.sound;
    if (!so) return ds;
    return {
      enabled: so.enabled !== false,
      effects: {
        ready: { ...ds.effects.ready, ...(so.effects?.ready ?? {}) },
        countdown: { ...ds.effects.countdown, ...(so.effects?.countdown ?? {}) },
        playing: { ...ds.effects.playing, ...(so.effects?.playing ?? {}) },
        cheer: { ...ds.effects.cheer, ...(so.effects?.cheer ?? {}) },
        ending: { ...ds.effects.ending, ...(so.effects?.ending ?? {}) },
      },
    };
  } catch {
    return ds;
  }
}

/** 从节目 configJson 解析玩法配置(剥掉 sound/grouping 通用键,供 ui.Config 编辑) */
export function parseGamePlayConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    delete o.sound;
    delete o.grouping;
    return o;
  } catch {
    return {};
  }
}

/** 从节目 configJson 解析其分组配置(填默认;权威归一化在后端 normalizeGrouping) */
export function parseGameGrouping(raw: string | null | undefined): GroupingConfig {
  const d = defaultGrouping();
  if (!raw) return d;
  try {
    const o = JSON.parse(raw) as { grouping?: Partial<GroupingConfig> };
    const g = o.grouping;
    if (!g) return d;
    return {
      mode: g.mode === "teams" ? "teams" : "individual",
      teams: Array.isArray(g.teams) ? g.teams : [],
      maxPerTeam: Number(g.maxPerTeam) || 0,
      assign: g.assign === "auto" ? "auto" : "pick",
    };
  } catch {
    return d;
  }
}

/** 分组对抗配置 —— **属于节目玩法**(存节目 configJson.grouping,每节目独立);EventConfig 里仅旧数据兼容 */
export interface GroupingConfig {
  mode: "individual" | "teams";
  teams: EventTeam[];
  maxPerTeam: number;
  assign: "pick" | "auto";
}

export function defaultGrouping(): GroupingConfig {
  return { mode: "individual", teams: [], maxPerTeam: 0, assign: "pick" };
}

/** 活动通用设置(首页背景/首页音乐),镜像后端 event-config.ts */
export interface EventConfig {
  background: { kind: "color" | "image"; imageFileId?: string; color1: string; color2: string };
  music: EventSound; // 首页音乐(节目音效在各节目 configJson.sound)
  grouping: GroupingConfig; // ⚠ 旧数据兼容保留;分组已下沉到节目级
}

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  background: { kind: "color", color1: "#241a3a", color2: "#0b0b12" },
  music: defaultSound(),
  grouping: { mode: "individual", teams: [], maxPerTeam: 0, assign: "pick" },
};

/** 内置队色板 */
export const TEAM_COLORS = ["#E23B3B", "#3B82F6", "#22B573", "#F5A623", "#9B59B6", "#17C0C0", "#EC4899", "#64748B"];

/** 宽松解析 configJson → EventConfig(填默认,前端表单用;权威归一化在后端) */
export function parseEventConfig(raw: string | null | undefined): EventConfig {
  const base = DEFAULT_EVENT_CONFIG;
  let o: Partial<EventConfig> = {};
  if (raw) {
    try {
      o = JSON.parse(raw) as Partial<EventConfig>;
    } catch {
      o = {};
    }
  }
  const ds = defaultSound();
  const mo = o.music;
  const music: EventSound = mo
    ? {
        enabled: mo.enabled === true,
        effects: {
          ready: { ...ds.effects.ready, ...(mo.effects?.ready ?? {}) },
          countdown: { ...ds.effects.countdown, ...(mo.effects?.countdown ?? {}) },
          playing: { ...ds.effects.playing, ...(mo.effects?.playing ?? {}) },
          cheer: { ...ds.effects.cheer, ...(mo.effects?.cheer ?? {}) },
          ending: { ...ds.effects.ending, ...(mo.effects?.ending ?? {}) },
        },
      }
    : ds;
  return {
    background: { ...base.background, ...(o.background ?? {}) },
    music,
    grouping: { ...base.grouping, ...(o.grouping ?? {}), teams: o.grouping?.teams ?? [] },
  };
}

export interface PublicRoomInfo {
  exists: boolean;
  title?: string;
  status?: string;
  config?: EventConfig;
  teamCounts?: Record<string, number>;
}

/** 公开文件 URL(大屏 <img>/<audio> 用;背景图/背景音乐) */
export function interactiveFileUrl(id: string): string {
  return `${apiOrigin}/api/public/interactive/files/${id}`;
}

export interface InteractiveManager {
  id: string;
  userId: string;
  userName: string;
  role: string; // owner | collaborator
}

export interface InteractiveEvent {
  id: string;
  roomCode: string;
  title: string;
  status: string; // draft | live | ended
  configJson: string; // 活动通用设置(背景/音乐/分组)快照
  createdById: string;
  createdByName: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  games: InteractiveGame[];
  managers?: InteractiveManager[];
  _count?: { players: number };
}

export interface CreateGameInput {
  gameType: string;
  title?: string;
  config?: unknown;
}
export interface CreateEventInput {
  title: string;
  games: CreateGameInput[];
  config?: EventConfig;
}

export const interactiveApi = {
  async listEvents(): Promise<InteractiveEvent[]> {
    const { data } = await api.get<InteractiveEvent[]>("/interactive/events");
    return data;
  },
  async getEvent(id: string): Promise<InteractiveEvent> {
    const { data } = await api.get<InteractiveEvent>(`/interactive/events/${id}`);
    return data;
  },
  async createEvent(input: CreateEventInput): Promise<InteractiveEvent> {
    const { data } = await api.post<InteractiveEvent>("/interactive/events", input);
    return data;
  },
  async endEvent(id: string): Promise<InteractiveEvent> {
    const { data } = await api.post<InteractiveEvent>(`/interactive/events/${id}/end`);
    return data;
  },
  async renameEvent(id: string, title: string): Promise<{ ok: true; title: string }> {
    const { data } = await api.patch<{ ok: true; title: string }>(`/interactive/events/${id}`, { title });
    return data;
  },
  async deleteEvent(id: string): Promise<{ ok: true }> {
    const { data } = await api.delete<{ ok: true }>(`/interactive/events/${id}`);
    return data;
  },
  async updateConfig(id: string, config: EventConfig): Promise<{ ok: true; config: EventConfig }> {
    const { data } = await api.patch<{ ok: true; config: EventConfig }>(
      `/interactive/events/${id}/config`,
      { config },
    );
    return data;
  },
  async addGame(eventId: string, input: CreateGameInput): Promise<InteractiveGame> {
    const { data } = await api.post<InteractiveGame>(`/interactive/events/${eventId}/games`, input);
    return data;
  },
  async removeGame(gameId: string): Promise<{ ok: true }> {
    const { data } = await api.delete<{ ok: true }>(`/interactive/games/${gameId}`);
    return data;
  },
  async updateGame(gameId: string, input: { title?: string; config?: unknown }): Promise<InteractiveGame> {
    const { data } = await api.patch<InteractiveGame>(`/interactive/games/${gameId}`, input);
    return data;
  },
  /** 公开:手机进场前拿队伍列表 + 各队实时人数(免登录) */
  async publicRoomInfo(code: string): Promise<PublicRoomInfo> {
    const { data } = await api.get<PublicRoomInfo>(`/public/interactive/rooms/${code}`);
    return data;
  },
};

/** 观众匿名身份:客户端生成并持久化的 deviceId(断线重连凭此恢复身份/分数)。 */
const DEVICE_KEY = "djyy_interactive_device";
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `d_${Math.random().toString(36).slice(2)}${Date.now()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `d_${Math.random().toString(36).slice(2)}`;
  }
}

/** 主持令牌:与 shared/api/client.ts 的 TOKEN_KEY 一致(扫控制器码把它交接到手机)。 */
const TOKEN_KEY = "djyy_auth_token_v1";
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
