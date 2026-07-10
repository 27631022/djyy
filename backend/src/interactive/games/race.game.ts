import { type GameDef } from '../game-def';
import { tapRaceGame } from './tap-race.game';

/**
 * 赛跑(race)—— **可复用的赛跑游戏场景**:玩法/计分与 tap_race 完全一致(限时狂点、点得多跑得远、
 * 仍计点击数,含 3-2-1 倒计时、分组对抗),视觉走**主题系统**(前端 raceThemes 注册表)。
 * 后端复用 tap_race 全部逻辑,只在 config 上加 theme/overrides/accent,并在 projectScreen 里带给大屏。
 * 加新主题 = 前端 raceThemes 注册一行(纯视觉,后端不用改)。
 */

const THEMES = ['soccer', 'neon']; // 与前端 raceThemes 键对齐(后端仅做白名单校验)

function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function fid(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 64) : undefined;
}
function color(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : '';
}

interface RaceOverrides {
  backdropFileId?: string;
  trackFileId?: string;
  podiumFileId?: string;
  remoteBgFileId?: string; // 手机端背景图(上传替换;缺省用主题默认)
  spriteFileIds?: string[];
}

/** 领奖台版式:前 3 名头像圈(圆心 ax/ay + 直径 as,% of 领奖台图)+ 名牌位置(nx/ny)。 */
interface PodiumFrame {
  ax: number;
  ay: number;
  as: number;
  nx: number;
  ny: number;
}
function clamp(v: unknown, min: number, max: number, fb: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
}
/** 版式编辑器保存的 3 帧;非法/缺帧返回 undefined(用主题默认) */
function normFrames(v: unknown): PodiumFrame[] | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  return v.slice(0, 3).map((f) => {
    const o = asRec(f);
    return {
      ax: clamp(o.ax, 0, 100, 50),
      ay: clamp(o.ay, 0, 100, 40),
      as: clamp(o.as, 2, 60, 15),
      nx: clamp(o.nx, 0, 100, 50),
      ny: clamp(o.ny, 0, 100, 60),
    };
  });
}
function normOverrides(v: unknown): RaceOverrides {
  const o = asRec(v);
  const out: RaceOverrides = {};
  const b = fid(o.backdropFileId);
  if (b) out.backdropFileId = b;
  const t = fid(o.trackFileId);
  if (t) out.trackFileId = t;
  const p = fid(o.podiumFileId);
  if (p) out.podiumFileId = p;
  const rb = fid(o.remoteBgFileId);
  if (rb) out.remoteBgFileId = rb;
  if (Array.isArray(o.spriteFileIds)) {
    const s = o.spriteFileIds.map(fid).filter((x): x is string => !!x).slice(0, 6);
    if (s.length) out.spriteFileIds = s;
  }
  return out;
}

export const raceGame = {
  ...tapRaceGame,
  type: 'race', // 类型键不改(旧活动配置兼容),仅改显示名
  label: '快乐点点点',
  icon: 'Trophy',
  defaultConfig: { durationSec: 30, theme: 'soccer', overrides: {}, accent: '' },

  validateConfig(input: unknown) {
    const base = tapRaceGame.validateConfig(input) as { durationSec: number };
    const o = asRec(input);
    const theme = THEMES.includes(String(o.theme)) ? String(o.theme) : 'soccer';
    const frames = normFrames(o.frames);
    return {
      ...base,
      theme,
      overrides: normOverrides(o.overrides),
      accent: color(o.accent),
      avatarBehind: o.avatarBehind !== false, // 图层:头像默认藏在颁奖台图后面(从相框透明洞露出)
      ...(frames ? { frames } : {}),
    };
  },

  projectScreen(state: unknown, cfg: unknown) {
    const inner = (tapRaceGame.projectScreen as (s: unknown, c: unknown) => Record<string, unknown>)(state, cfg);
    const c = cfg as {
      theme?: unknown;
      overrides?: unknown;
      accent?: unknown;
      frames?: unknown;
      avatarBehind?: unknown;
    };
    return {
      ...inner,
      theme: c.theme,
      overrides: c.overrides,
      accent: c.accent,
      frames: c.frames,
      avatarBehind: c.avatarBehind !== false,
    };
  },

  // 手机端也带主题/覆盖(手机背景图按 主题/上传 解析)
  projectRemote(state: unknown, cfg: unknown, deviceId: string) {
    const inner = (tapRaceGame.projectRemote as (s: unknown, c: unknown, d: string) => Record<string, unknown>)(
      state,
      cfg,
      deviceId,
    );
    const c = cfg as { theme?: unknown; overrides?: unknown; accent?: unknown };
    return { ...inner, theme: c.theme, overrides: c.overrides, accent: c.accent };
  },
} as unknown as GameDef;
