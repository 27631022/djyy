import {
  HEX_COLOR,
  STUDIO_SCHEMA_VERSION,
  type AvatarStudioConfig,
  type StudioGender,
  type StudioSlot,
  type StylePack,
} from "./types";

/** 字符串 → 32bit 种子(xmur3) */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32 PRNG(32bit 种子,外观随机足够) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 单槽位随机:候选 = 该性别变体(选前过滤);optional 槽位把「无」按 noneWeight 并入权重池。
 * 每槽位用 hash(seed+slotKey) 派生独立子种子 —— 某槽位素材增删不影响其它槽位的抽取结果。
 */
function pickSlot(slot: StudioSlot, gender: StudioGender, seed: string): string | null {
  const pool = slot.variants.filter((v) => v.gender === gender);
  if (pool.length === 0) return null;
  const rand = mulberry32(xmur3(`${seed}::${slot.key}`)());
  const noneW = slot.optional ? (slot.noneWeight ?? 1) : 0;
  const total = pool.reduce((s, v) => s + (v.weight ?? 1), 0) + noneW;
  let r = rand() * total;
  if (slot.optional) {
    r -= noneW;
    if (r < 0) return null;
  }
  for (const v of pool) {
    r -= v.weight ?? 1;
    if (r < 0) return v.id;
  }
  return pool[pool.length - 1].id;
}

/** 随机一套配置(seed 缺省用时间+随机数;复现能力靠持久化结果,不靠 seed) */
export function randomConfig(pack: StylePack, gender: StudioGender, seed?: string): AvatarStudioConfig {
  const s = seed ?? `${Date.now()}-${Math.random()}`;
  const picks: Record<string, string | null> = {};
  for (const slot of pack.slots) picks[slot.key] = pickSlot(slot, gender, s);
  return { packId: pack.id, schemaVersion: STUDIO_SCHEMA_VERSION, gender, picks };
}

/**
 * 校验/修复外来配置(回灌再编辑):未知槽位丢弃、未知变体或跨性别变体置空、
 * bgColor 过 hex 白名单(非法值→null 透明 —— 它会流进 canvas fillStyle 与 SVG 属性,入口收敛在这一处)。
 */
export function sanitizeConfig(pack: StylePack, raw: unknown): AvatarStudioConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Partial<AvatarStudioConfig>;
  if (cfg.packId !== pack.id) return null;
  const gender: StudioGender = cfg.gender === "female" ? "female" : "male";
  const picks: Record<string, string | null> = {};
  for (const slot of pack.slots) {
    const want = cfg.picks?.[slot.key];
    const hit = typeof want === "string" ? slot.variants.find((v) => v.id === want && v.gender === gender) : null;
    picks[slot.key] = hit ? hit.id : null;
  }
  const bgColor = typeof cfg.bgColor === "string" && HEX_COLOR.test(cfg.bgColor) ? cfg.bgColor : null;
  return { packId: pack.id, schemaVersion: STUDIO_SCHEMA_VERSION, gender, picks, bgColor };
}
