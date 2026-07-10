import { useEffect, useRef } from "react";
import {
  DEFAULT_SOUND_URL,
  SOUND_SLOTS,
  interactiveFileUrl,
  type EventSound,
  type SoundEffect,
  type SoundKey,
} from "./api";

export type Phase = "waiting" | "countdown" | "running" | "ended";

/** 各游戏阶段触发哪些音效(欢呼声+结束音在结算同时响) */
const PHASE_EFFECTS: Record<Phase, SoundKey[]> = {
  waiting: ["ready"],
  countdown: ["countdown"],
  running: ["playing"],
  ended: ["cheer", "ending"],
};

/** 从活动配置 + 游戏状态推导当前阶段 */
export function phaseOf(hasGame: boolean, view: unknown): Phase {
  if (!hasGame) return "waiting";
  const s = (view as { status?: string } | null)?.status;
  if (s === "countdown") return "countdown";
  if (s === "running") return "running";
  if (s === "ended") return "ended";
  return "waiting";
}

function urlFor(key: SoundKey, sound: EventSound, defaults?: Partial<Record<SoundKey, string>>): string {
  const fid = sound.effects[key].fileId;
  // 上传自定义 > 该游戏默认音(GameUi.defaultSounds)> 全局内置默认
  return fid ? interactiveFileUrl(fid) : defaults?.[key] ?? DEFAULT_SOUND_URL[key];
}

/**
 * 单个音效播放器:按配置 延迟 → 从 clipStart 播 →(clipEnd 或自然结尾)→ 循环 / 播 N 次 → 停。
 * 音量、截取区间、循环/次数、延迟全在这里落实。所有事件用 timeupdate + ended 手动管理循环点。
 */
class EffectEngine {
  private audio = new Audio();
  private cfg: SoundEffect | null = null;
  private url = "";
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private playsLeft = 0;

  constructor() {
    this.audio.preload = "auto";
    this.audio.addEventListener("timeupdate", this.onTime);
    this.audio.addEventListener("ended", this.onEnded);
  }

  setConfig(url: string, cfg: SoundEffect): void {
    if (url !== this.url) {
      this.url = url;
      this.audio.src = url;
    }
    this.cfg = cfg;
  }

  play(): void {
    this.stop();
    const c = this.cfg;
    if (!c) return;
    this.audio.volume = Math.min(1, Math.max(0, c.volume));
    this.playsLeft = c.loop ? Number.POSITIVE_INFINITY : Math.max(1, c.playCount);
    const start = () => {
      try {
        this.audio.currentTime = c.clipStart || 0;
      } catch {
        /* currentTime 未就绪时忽略 */
      }
      void this.audio.play().catch(() => {});
    };
    if (c.delayMs > 0) this.delayTimer = setTimeout(start, c.delayMs);
    else start();
  }

  stop(): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    this.playsLeft = 0;
    this.audio.pause();
  }

  setMuted(m: boolean): void {
    this.audio.muted = m;
  }

  dispose(): void {
    this.stop();
    this.audio.removeEventListener("timeupdate", this.onTime);
    this.audio.removeEventListener("ended", this.onEnded);
    this.audio.src = "";
  }

  private onTime = () => {
    const c = this.cfg;
    if (c && c.clipEnd > 0 && this.audio.currentTime >= c.clipEnd) this.advance();
  };
  private onEnded = () => this.advance();

  private advance(): void {
    if (this.playsLeft <= 0) return;
    this.playsLeft -= 1;
    const c = this.cfg;
    if (this.playsLeft > 0 && c) {
      try {
        this.audio.currentTime = c.clipStart || 0;
      } catch {
        /* ignore */
      }
      void this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }
}

/**
 * 大屏音效引擎 —— 按阶段自动播放 5 段音效。
 * entered=一次性手势已解锁自动播放;sound.enabled=总开关。配置变化(live PATCH)即时生效。
 * sourceId=音源标识(首页='event' / 节目=gameId):音源切换即使同阶段也重触发
 * (如 大厅等待→激活节目报名页 都是 waiting,但要停首页音乐、起该节目的「准备」音)。
 */
export function useSoundEngine(
  sound: EventSound,
  phase: Phase,
  entered: boolean,
  muted: boolean,
  sourceId = "event",
  defaults?: Partial<Record<SoundKey, string>>, // 该游戏的默认音效覆盖(GameUi.defaultSounds)
): void {
  const enginesRef = useRef<Record<SoundKey, EffectEngine> | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  // 挂载即创建 5 个播放器(new Audio 在 effect 里,不在 render 期)
  useEffect(() => {
    const r = {} as Record<SoundKey, EffectEngine>;
    for (const { key } of SOUND_SLOTS) r[key] = new EffectEngine();
    enginesRef.current = r;
    return () => {
      for (const { key } of SOUND_SLOTS) r[key].dispose();
      enginesRef.current = null;
    };
  }, []);

  // 配置同步(含 live 改设置 / 切游戏换默认音)
  useEffect(() => {
    const e = enginesRef.current;
    if (!e) return;
    for (const { key } of SOUND_SLOTS) e[key].setConfig(urlFor(key, sound, defaults), sound.effects[key]);
  }, [sound, defaults]);

  // 静音开关(大屏底部控制条)
  useEffect(() => {
    const e = enginesRef.current;
    if (!e) return;
    for (const { key } of SOUND_SLOTS) e[key].setMuted(muted);
  }, [muted]);

  // 阶段/音源切换 → 停旧、播新;音源禁用或切到禁用音源时全停
  useEffect(() => {
    const e = enginesRef.current;
    if (!e) return;
    if (!entered) return;
    const key = `${phase}|${sourceId}|${sound.enabled ? 1 : 0}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    if (!sound.enabled) {
      for (const { key: k } of SOUND_SLOTS) e[k].stop();
      return;
    }
    const active = new Set(PHASE_EFFECTS[phase]);
    for (const { key: k } of SOUND_SLOTS) if (!active.has(k)) e[k].stop();
    for (const k of PHASE_EFFECTS[phase]) e[k].play();
  }, [phase, sourceId, entered, sound.enabled, sound]);
}
