import type { DifficultyBasis, DifficultyTable, DifficultyTier } from "./api";

/**
 * 难易系数(积分系数):大单位人多、积分天然占优,按规模给不同倍率拉平。
 * 设计为可做多套(basis 区分):目前落「员工人数」;以后可加党员人数、营收规模等。
 * 按指标走(像计分工具):指标默认系数 1,只个别指标(如宣传积分)选用。
 * 计算在 P2:本指标得分 × 对象难易系数,再排名/汇总;P1 只配置 + 可读展示。
 * 加新口径 = BASIS_LABELS 加一项 + 给个默认表(或让用户在设置里建)。
 */

export const BASIS_LABELS: Record<DifficultyBasis, string> = {
  headcount: "员工人数",
};

/** 用户单位现行表:人数越少系数越高(最高 2 倍) */
export const DEFAULT_HEADCOUNT_TABLE: DifficultyTable = {
  id: "headcount",
  label: "按员工人数",
  basis: "headcount",
  tiers: [
    { maxCount: 100, coef: 2 },
    { maxCount: 300, coef: 1.8 },
    { maxCount: 500, coef: 1.6 },
    { maxCount: 1000, coef: 1.4 },
    { maxCount: 2000, coef: 1.2 },
    { maxCount: null, coef: 1 },
  ],
};

/** tiers 按上限升序(null 视为 +∞ 排末尾) */
export function sortedTiers(tiers: DifficultyTier[]): DifficultyTier[] {
  return [...tiers].sort((a, b) => (a.maxCount ?? Infinity) - (b.maxCount ?? Infinity));
}

/** 规模数(如员工人数)→ 系数:命中第一个 count ≤ 上限 的档(null=上不封顶兜底) */
export function coefForCount(table: DifficultyTable, count: number): number {
  for (const t of sortedTiers(table.tiers)) {
    if (count <= (t.maxCount ?? Infinity)) return t.coef;
  }
  return 1;
}

/** 某档的人数区间可读文字(基于升序后的相邻上限) */
export function tierRangeLabel(tiers: DifficultyTier[], tier: DifficultyTier): string {
  const sorted = sortedTiers(tiers);
  const idx = sorted.indexOf(tier);
  const prev = idx > 0 ? sorted[idx - 1].maxCount : null;
  const lo = prev === null || prev === undefined ? 0 : prev + 1;
  if (tier.maxCount === null) return `${lo} 人以上`;
  if (lo <= 1) return `${tier.maxCount} 人以下`;
  return `${lo}-${tier.maxCount} 人`;
}

/** 整张表的一句话摘要:如「100人以下→2 / … / 2000人以上→1」 */
export function tableSummary(table: DifficultyTable): string {
  return sortedTiers(table.tiers)
    .map((t) => `${tierRangeLabel(table.tiers, t)}→${t.coef}`)
    .join("、");
}

let seq = 0;
export function newTableId(): string {
  seq += 1;
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(seq);
  return `diff_${rnd}`;
}
