import {
  HEX_COLOR,
  STUDIO_SCHEMA_VERSION,
  type AvatarStudioConfig,
  type StudioGender,
  type StudioSlot,
  type StylePack,
} from "./types";

/** 解析后的类目分组(槽位 key → 槽位对象;未入组槽位自动补单槽组) */
export interface ResolvedGroup {
  key: string;
  label: string;
  slots: StudioSlot[];
  exclusive: boolean;
  noneWeight: number;
}

/** 风格包的 UI 分组解析:groups 缺省 = 每槽位一组;登记了不存在槽位的组条目忽略该槽位 */
export function resolveGroups(pack: StylePack): ResolvedGroup[] {
  const byKey = new Map(pack.slots.map((s) => [s.key, s]));
  const out: ResolvedGroup[] = [];
  const used = new Set<string>();
  for (const g of pack.groups ?? []) {
    const slots = g.slots.map((k) => byKey.get(k)).filter((s): s is StudioSlot => !!s);
    if (!slots.length) continue;
    for (const s of slots) used.add(s.key);
    out.push({ key: g.key, label: g.label, slots, exclusive: !!g.exclusive, noneWeight: g.noneWeight ?? 1 });
  }
  for (const s of pack.slots) {
    if (used.has(s.key)) continue;
    out.push({ key: s.key, label: s.label, slots: [s], exclusive: false, noneWeight: s.noneWeight ?? 1 });
  }
  return out;
}

/** 互斥组约束:组内多个槽位同时有值时,保留组内靠后的槽位(眼镜/胡子这类"外层件"),其余清空 */
export function enforceExclusive(pack: StylePack, picks: Record<string, string | null>): void {
  for (const g of pack.groups ?? []) {
    if (!g.exclusive) continue;
    const withValue = g.slots.filter((k) => picks[k] != null);
    for (const k of withValue.slice(0, -1)) picks[k] = null;
  }
}

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

/**
 * 互斥组联合随机:组内全部槽位的变体 + 「无」同锅抽签(命中某变体 = 该槽位取值、组内其它清空)。
 * 子种子挂组 key —— 组内某槽位素材增删只影响本组。
 */
function pickExclusiveGroup(
  group: ResolvedGroup,
  gender: StudioGender,
  seed: string,
  picks: Record<string, string | null>,
): void {
  for (const s of group.slots) picks[s.key] = null;
  const pool: { slotKey: string; id: string; weight: number }[] = [];
  for (const s of group.slots)
    for (const v of s.variants)
      if (v.gender === gender) pool.push({ slotKey: s.key, id: v.id, weight: v.weight ?? 1 });
  if (!pool.length) return;
  const rand = mulberry32(xmur3(`${seed}::group:${group.key}`)());
  const total = pool.reduce((sum, p) => sum + p.weight, 0) + group.noneWeight;
  let r = rand() * total - group.noneWeight;
  if (r < 0) return; // 组内全无 = 用基准默认
  for (const p of pool) {
    r -= p.weight;
    if (r < 0) {
      picks[p.slotKey] = p.id;
      return;
    }
  }
  picks[pool[pool.length - 1].slotKey] = pool[pool.length - 1].id;
}

/** 随机一套配置(seed 缺省用时间+随机数;复现能力靠持久化结果,不靠 seed) */
export function randomConfig(pack: StylePack, gender: StudioGender, seed?: string): AvatarStudioConfig {
  const s = seed ?? `${Date.now()}-${Math.random()}`;
  const picks: Record<string, string | null> = {};
  for (const g of resolveGroups(pack)) {
    if (g.exclusive) pickExclusiveGroup(g, gender, s, picks);
    else for (const slot of g.slots) picks[slot.key] = pickSlot(slot, gender, s);
  }
  return { packId: pack.id, schemaVersion: STUDIO_SCHEMA_VERSION, gender, picks };
}

/**
 * 校验/修复外来配置(回灌再编辑):未知槽位丢弃、未知变体或跨性别变体置空、互斥组强制二选一
 * (合并前的旧存档可能眼镜+闭眼同时有值 → 保留外层件),bgColor 过 hex 白名单
 * (非法值→null 透明 —— 它会流进 canvas fillStyle 与 SVG 属性,入口收敛在这一处)。
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
  enforceExclusive(pack, picks);
  const bgColor = typeof cfg.bgColor === "string" && HEX_COLOR.test(cfg.bgColor) ? cfg.bgColor : null;
  return { packId: pack.id, schemaVersion: STUDIO_SCHEMA_VERSION, gender, picks, bgColor };
}
