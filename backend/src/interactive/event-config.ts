import * as crypto from 'crypto';

/**
 * 活动级通用设置(存 InteractiveEvent.configJson)—— 跨游戏共享:
 * 背景 / 背景音乐 / 分组对抗(自定义队伍 + 队色 + 限制每队人数 + 自选或均分)。
 * 全部 JSON 可序列化;normalizeEventConfig 是安全网(白名单重建,非法回退默认)。
 */

export interface EventTeam {
  id: string;
  name: string;
  color: string; // 队色(语义色,不跟主题变)
}

/**
 * 一个音效:fileId 为空=用前端内置默认音(准备/倒计时/进行中/欢呼声/结束)。
 * 每个音效可调:是否循环 / 播放次数 / 延迟 / 音量 / 播放截取([clipStart,clipEnd] 秒,0=到结尾)。
 */
export interface SoundEffect {
  fileId?: string; // 上传覆盖;空=内置默认
  name?: string;
  loop: boolean; // 是否循环
  playCount: number; // 播放次数(loop=false 时;≥1)
  delayMs: number; // 延迟时间(ms)
  volume: number; // 音量 0..1
  clipStart: number; // 播放截取起点(秒)
  clipEnd: number; // 播放截取终点(秒;0=到结尾)
}

/** 5 种音效,按游戏阶段触发:准备(等待)/倒计时/进行中/欢呼声(结算)/结束(结算) */
export type SoundKey = 'ready' | 'countdown' | 'playing' | 'cheer' | 'ending';

export interface EventSound {
  enabled: boolean;
  effects: Record<SoundKey, SoundEffect>;
}

export const SOUND_SLOTS: { key: SoundKey; label: string }[] = [
  { key: 'ready', label: '准备' },
  { key: 'countdown', label: '倒计时' },
  { key: 'playing', label: '进行中' },
  { key: 'cheer', label: '欢呼声' },
  { key: 'ending', label: '结束' },
];

const DEFAULT_EFFECTS: Record<SoundKey, SoundEffect> = {
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
      ready: { ...DEFAULT_EFFECTS.ready },
      countdown: { ...DEFAULT_EFFECTS.countdown },
      playing: { ...DEFAULT_EFFECTS.playing },
      cheer: { ...DEFAULT_EFFECTS.cheer },
      ending: { ...DEFAULT_EFFECTS.ending },
    },
  };
}

/**
 * 分组对抗配置 —— **属于节目(游戏)玩法**,存 InteractiveGame.configJson.grouping,
 * 每个节目独立(如摇一摇分组、你比我猜也分组但队伍不同)。
 * EventConfig 里的 grouping 仅作旧数据兼容保留,运行时不再消费。
 */
export interface GroupingConfig {
  mode: 'individual' | 'teams';
  teams: EventTeam[]; // 自定义分组
  maxPerTeam: number; // 限制每队人数(0=不限)
  assign: 'pick' | 'auto'; // 玩家自选 / 系统均分
}

export interface EventConfig {
  background: {
    kind: 'color' | 'image';
    imageFileId?: string; // kind=image 时;storage fileId(ownerModule='interactive')
    color1: string; // kind=color 时渐变起色
    color2: string; // 渐变止色
  };
  music: EventSound; // 首页音乐(大屏首页/等待时;节目音效在各节目 configJson.sound)
  grouping: GroupingConfig; // ⚠ 旧数据兼容保留;分组已下沉到节目级
}

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  background: { kind: 'color', color1: '#241a3a', color2: '#0b0b12' },
  music: defaultSound(),
  grouping: { mode: 'individual', teams: [], maxPerTeam: 0, assign: 'pick' },
};

/** 内置队色板(自定义分组新建时取用) */
export const TEAM_COLORS = ['#E23B3B', '#3B82F6', '#22B573', '#F5A623', '#9B59B6', '#17C0C0', '#EC4899', '#64748B'];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : fallback;
}
function optFileId(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 64) : undefined;
}

function clampNum(v: unknown, min: number, max: number, fb: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, n));
}
function clampInt(v: unknown, min: number, max: number, fb: number): number {
  return Math.round(clampNum(v, min, max, fb));
}

function normalizeEffect(v: unknown, key: SoundKey): SoundEffect {
  const o = asRecord(v);
  const d = DEFAULT_EFFECTS[key];
  const out: SoundEffect = {
    loop: typeof o.loop === 'boolean' ? o.loop : d.loop,
    playCount: clampInt(o.playCount, 1, 20, d.playCount),
    delayMs: clampInt(o.delayMs, 0, 60000, d.delayMs),
    volume: clampNum(o.volume, 0, 1, d.volume),
    clipStart: clampNum(o.clipStart, 0, 3600, d.clipStart),
    clipEnd: clampNum(o.clipEnd, 0, 3600, d.clipEnd),
  };
  const fileId = optFileId(o.fileId);
  if (fileId) {
    out.fileId = fileId;
    const n = str(o.name, 60);
    if (n) out.name = n;
  }
  return out;
}

/**
 * 节目(游戏)级音效 —— 每个节目独立一份,存进 InteractiveGame.configJson 的 sound 键。
 * 初始化 = 同一套内置默认音(DEFAULT_EFFECTS),但**不共用**:改 A 节目不影响 B 节目。
 * 节目音效默认启用(有内置默认音,开箱即响);活动级 music 只剩「首页等待」用途。
 */
export function normalizeGameSound(input: unknown): EventSound {
  const o = asRecord(input);
  const effIn = asRecord(o.effects);
  return {
    enabled: o.enabled !== false,
    effects: {
      ready: normalizeEffect(effIn.ready, 'ready'),
      countdown: normalizeEffect(effIn.countdown, 'countdown'),
      playing: normalizeEffect(effIn.playing, 'playing'),
      cheer: normalizeEffect(effIn.cheer, 'cheer'),
      ending: normalizeEffect(effIn.ending, 'ending'),
    },
  };
}

/** 分组配置归一化(节目级消费;白名单重建,非法回退默认)。 */
export function normalizeGrouping(input: unknown): GroupingConfig {
  const grouping = asRecord(input);
  const teamsRaw = Array.isArray(grouping.teams) ? grouping.teams.slice(0, 12) : [];
  const seenIds = new Set<string>();
  const teams: EventTeam[] = teamsRaw.map((t, i) => {
    const tr = asRecord(t);
    let id = str(tr.id, 40);
    if (!id || seenIds.has(id)) id = crypto.randomUUID();
    seenIds.add(id);
    return {
      id,
      name: str(tr.name, 12) || `${i + 1}队`,
      color: hex(tr.color, TEAM_COLORS[i % TEAM_COLORS.length]),
    };
  });
  let maxPerTeam = Number(grouping.maxPerTeam);
  if (!Number.isFinite(maxPerTeam) || maxPerTeam < 0) maxPerTeam = 0;
  maxPerTeam = Math.min(200, Math.round(maxPerTeam));
  return {
    mode: grouping.mode === 'teams' ? 'teams' : 'individual',
    teams,
    maxPerTeam,
    assign: grouping.assign === 'auto' ? 'auto' : 'pick',
  };
}

export function normalizeEventConfig(input: unknown): EventConfig {
  const o = asRecord(input);
  const bg = asRecord(o.background);
  const music = asRecord(o.music);

  // 新结构 music.effects.{ready,...};兼容上一版 music.{waiting,countdown,start,ending} 与最早 bgmFileId
  const effIn = asRecord(music.effects);
  const hasNew = music.effects != null && typeof music.effects === 'object';
  const legacyOf: Record<SoundKey, unknown> = {
    ready: music.waiting,
    countdown: music.countdown,
    playing: music.start,
    cheer: undefined,
    ending: music.ending,
  };
  const srcOf = (k: SoundKey): unknown => (hasNew ? effIn[k] : legacyOf[k]);
  const musicOut: EventSound = {
    enabled: music.enabled === true,
    effects: {
      ready: normalizeEffect(srcOf('ready'), 'ready'),
      countdown: normalizeEffect(srcOf('countdown'), 'countdown'),
      playing: normalizeEffect(srcOf('playing'), 'playing'),
      cheer: normalizeEffect(srcOf('cheer'), 'cheer'),
      ending: normalizeEffect(srcOf('ending'), 'ending'),
    },
  };
  // 最早的单曲 bgmFileId → 准备音
  if (!hasNew && !musicOut.effects.ready.fileId) {
    const legacy = optFileId(music.bgmFileId);
    if (legacy) musicOut.effects.ready.fileId = legacy;
  }

  return {
    background: {
      kind: bg.kind === 'image' ? 'image' : 'color',
      imageFileId: optFileId(bg.imageFileId),
      color1: hex(bg.color1, DEFAULT_EVENT_CONFIG.background.color1),
      color2: hex(bg.color2, DEFAULT_EVENT_CONFIG.background.color2),
    },
    music: musicOut,
    grouping: normalizeGrouping(o.grouping), // 旧数据兼容;运行时消费的是节目级 grouping
  };
}

export function parseEventConfig(raw: string | null | undefined): EventConfig {
  if (!raw) return DEFAULT_EVENT_CONFIG;
  try {
    return normalizeEventConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_EVENT_CONFIG;
  }
}
