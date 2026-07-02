import { flattenLeaves, type IndicatorNode } from './indicator-tree';
import { computeScore, getScoringSpec, sumDeductions, type RawMetric, type ScoreCtx } from './scoring-strategies';

/**
 * 考核轮次计算引擎(纯函数,无 Prisma —— 可单测)。
 * 口径(对齐 spec P2):
 *   取数(rawValue)→ 计分(scoring-strategies)→ × 难易系数 → 排名/标准化(crossTarget 需全体)
 *   → 加权汇总(normal 累加 / bonus·deduction 块按上限封顶)→ 名次划档定级。
 * 难易系数应用点:
 *   - crossTarget(排名/标准化)工具:系数乘在「参与排名的值」上(得分×系数 再排名,如宣传积分);
 *   - 非 crossTarget 工具:系数乘在「算出的得分」上。
 */

export interface RoundTargetResult {
  ref: string;
  name: string;
  leafScores: Record<string, number>;
  normalScore: number;
  bonus: number;
  deduct: number;
  total: number;
  rank: number;
  grade: string;
}
export interface RoundResults {
  computedAt: string;
  targets: RoundTargetResult[];
}

interface GradeTierLike {
  grade: string;
  band: string;
  pct?: number;
}
interface GradeThresholdLike {
  grade: string;
  min: number;
}
export interface GradeRulesLike {
  mode?: string;
  tiers?: GradeTierLike[];
  thresholds?: GradeThresholdLike[];
}

type RawMap = Record<string, Record<string, unknown>>; // targetRef → leafCode → rawValue(已 parse)

const round2 = (x: number) => Math.round(x * 100) / 100;
/** 取「已录入的数值」:数字/布尔→数值,未录入(null/undefined/字符串/NaN)→null(用于把未录入对象排除出排名群体) */
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null;

/** 减分逐级封顶:每个减分块,下级减分之和超本级「减分上限」(weight)即锁死在上限;上限=0 视为不封顶。递归到末端叶子。
 *  打分页(previewSubtotal)与考核排名页(computeRoundResults)共用同一函数,保证两处口径一致。 */
const capVal = (s: number, w: number | undefined) => (w && w > 0 ? Math.min(s, w) : s);
export function cappedDeduct(node: IndicatorNode, leafScore: (code: string) => number): number {
  const kids = node.children ?? [];
  if (!kids.length) return leafScore(node.code);
  const childSum = kids.reduce((acc, c) => acc + cappedDeduct(c, leafScore), 0);
  return capVal(childSum, node.weight);
}

/** 单个末端指标:对全体对象算 ●得分(含难易系数;crossTarget 系数乘在排名值上再排名)。返回 ref→●得分。 */
export function scoreOneLeaf(
  leaf: IndicatorNode,
  targets: { ref: string }[],
  rawOf: (ref: string) => unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  const type = leaf.scoringType ?? '';
  const spec = getScoringSpec(type);
  const fullScore = Number.isFinite(leaf.weight) ? leaf.weight : 0;
  const coefOf = (ref: string) => (leaf.difficultyOn ? leaf.difficultyCoefs?.[ref] ?? 1 : 1);
  if (!spec) {
    for (const t of targets) out[t.ref] = 0;
    return out;
  }
  // 计分参数统一归一化(排序档位/补默认值等),让「考核排名页直接吃快照参数」与「打分页预览归一化后参数」口径一致;
  // 万一存量参数非法(本不该,存表已校验)归一化抛错时,退回原始参数兜底,避免一个坏叶子让整轮算分 500。
  let params: Record<string, unknown> = leaf.strategyParams ?? {};
  try {
    params = spec.normalizeParams(params);
  } catch {
    params = leaf.strategyParams ?? {};
  }
  if (spec.crossTarget) {
    // 只把「已录入数值」的对象纳入排名/标准化群体:未录入的不参与(不挤名次)、本身记 0 分。
    const entered = targets
      .map((t) => ({ ref: t.ref, v: numOrNull(rawOf(t.ref)) }))
      .filter((e): e is { ref: string; v: number } => e.v !== null)
      .map((e) => ({ ref: e.ref, v: e.v * coefOf(e.ref) }));
    const all = entered.map((e) => e.v);
    const order = params.order === 'asc' ? 'asc' : 'desc';
    for (const t of targets) out[t.ref] = 0; // 默认(未录入)= 0
    for (const { ref, v } of entered) {
      const ahead = all.filter((x) => (order === 'asc' ? x < v : x > v)).length;
      const ctx: ScoreCtx = { fullScore, params, allValues: all, count: all.length || 1, rank: 1 + ahead };
      out[ref] = round2(computeScore(type, v, ctx));
    }
  } else {
    for (const t of targets) {
      const rv = (rawOf(t.ref) ?? null) as RawMetric;
      // 减分项:本项得分 = 实际扣分额(正数),而非「满分−扣分」(那是计权制语义)。
      // manual_deduct 用扣分明细之和;其余工具(如「按次扣分」deduction)用 computeScore 的罚分。
      // 减分项无「满分起评」初始分;按本叶「扣分上限」(weight)封顶(0=不封顶),块级再逐级封顶(见 cappedDeduct)。
      let s: number;
      if (leaf.kind === 'deduction') {
        const ded = type === 'manual_deduct' ? sumDeductions(rv) : computeScore(type, rv, { fullScore, params });
        s = fullScore > 0 ? Math.min(ded, fullScore) : ded;
      } else {
        s = computeScore(type, rv, { fullScore, params });
      }
      if (leaf.difficultyOn) s *= coefOf(t.ref);
      out[t.ref] = round2(s);
    }
  }
  return out;
}

export interface PreviewRow {
  ref: string;
  name: string;
  score: number;
  rank: number;
}
/** 单指标实时预览:给各对象实际值 → 按 ●得分 降序的 ●# 单项排名(无状态,录入页右栏用)。 */
export function previewIndicator(
  leaf: IndicatorNode,
  units: { ref: string; name: string; raw: unknown }[],
): PreviewRow[] {
  const rawMap = new Map(units.map((u) => [u.ref, u.raw] as const));
  const scores = scoreOneLeaf(leaf, units, (ref) => rawMap.get(ref));
  const rows: PreviewRow[] = units.map((u) => ({ ref: u.ref, name: u.name, score: scores[u.ref] ?? 0, rank: 0 }));
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  // 并列共享名次(竞赛排名法):同分同名次,下一名跳号。原先按 sort 下标+1 会给并列者
  // 按数组顺序发任意名次,且与体检单(1+严格更高个数)对不上 —— 两处统一本口径。
  let lastScore = Number.POSITIVE_INFINITY;
  let lastRank = 0;
  sorted.forEach((r, i) => {
    if (r.score !== lastScore) {
      lastRank = i + 1;
      lastScore = r.score;
    }
    r.rank = lastRank;
  });
  return sorted;
}

/** 一组指标的实时合计预览(打分人看自己负责的几项:单项 + 合计排名)。 */
export interface SubtotalPreview {
  /** leafCode → 该指标各对象 ●# 单项排名 */
  perLeaf: Record<string, PreviewRow[]>;
  /** 各对象在这组指标的合计得分 + 合计排名(score=Σ各项得分) */
  subtotal: PreviewRow[];
  /** 这组指标的满分之和(Σ weight) */
  fullScore: number;
}
/**
 * 多指标合计实时预览。每个指标独立按 scoreOneLeaf 算(crossTarget 用该指标全体对象值),
 * 再按对象把各项得分相加、排名。无状态(不落库),前端传当前录入即时出结果。
 */
export function previewSubtotal(
  leaves: IndicatorNode[],
  units: { ref: string; name: string; valuesByLeaf: Record<string, unknown> }[],
  deductBlocks: IndicatorNode[] = [],
): SubtotalPreview {
  const perLeaf: Record<string, PreviewRow[]> = {};
  const nameByRef = new Map(units.map((u) => [u.ref, u.name] as const));

  // 1) 单项排名:我的每项指标(含减分)逐项 ●# —— 展示不变。
  for (const leaf of leaves) {
    perLeaf[leaf.code] = previewIndicator(
      leaf,
      units.map((u) => ({ ref: u.ref, name: u.name, raw: u.valuesByLeaf?.[leaf.code] })),
    );
  }

  // 2) 减分块内全部叶子按对象算分(leafCode→ref→●扣分额,已按本叶上限封顶),供逐级封顶 cappedDeduct 使用。
  const blockLeafScore: Record<string, Record<string, number>> = {};
  const coveredDeduct = new Set<string>();
  const valOf = new Map(units.map((u) => [u.ref, u.valuesByLeaf ?? {}] as const));
  const collectLeaves = (n: IndicatorNode): IndicatorNode[] =>
    n.children && n.children.length ? n.children.flatMap(collectLeaves) : [n];
  for (const block of deductBlocks) {
    for (const lf of collectLeaves(block)) {
      coveredDeduct.add(lf.code);
      blockLeafScore[lf.code] = scoreOneLeaf(lf, units, (ref) => valOf.get(ref)?.[lf.code]);
    }
  }

  // 3) 合计:正项(计权/加分)累加 + 减分块逐级封顶后减(与考核排名页 computeRoundResults 同口径)。
  let fullScore = 0;
  for (const leaf of leaves)
    if (leaf.kind !== 'deduction') fullScore += Number.isFinite(leaf.weight) ? leaf.weight : 0;
  const scoreInPerLeaf = (code: string, ref: string) => perLeaf[code]?.find((r) => r.ref === ref)?.score ?? 0;
  const sumByRef: Record<string, number> = {};
  for (const u of units) {
    let s = 0;
    for (const leaf of leaves) if (leaf.kind !== 'deduction') s += scoreInPerLeaf(leaf.code, u.ref);
    for (const block of deductBlocks) s -= cappedDeduct(block, (code) => blockLeafScore[code]?.[u.ref] ?? 0);
    // 兜底:不在任何减分块内的减分叶子(理论上不应出现)——按叶子分(已按本叶上限封顶)直接减,避免漏减。
    for (const leaf of leaves)
      if (leaf.kind === 'deduction' && !coveredDeduct.has(leaf.code)) s -= scoreInPerLeaf(leaf.code, u.ref);
    sumByRef[u.ref] = s;
  }

  const subtotal: PreviewRow[] = units.map((u) => ({
    ref: u.ref,
    name: nameByRef.get(u.ref) ?? u.ref,
    score: round2(sumByRef[u.ref] ?? 0),
    rank: 0,
  }));
  subtotal.sort((a, b) => b.score - a.score);
  subtotal.forEach((r, i) => (r.rank = i + 1));
  return { perLeaf, subtotal, fullScore: round2(fullScore) };
}

export function computeRoundResults(
  indicators: IndicatorNode[],
  targets: { ref: string; name: string }[],
  gradeRules: GradeRulesLike,
  raw: RawMap,
  computedAt: string,
): RoundResults {
  const leaves = flattenLeaves(indicators);
  const scoreOf: Record<string, Record<string, number>> = {};
  for (const t of targets) scoreOf[t.ref] = {};

  // ── 逐叶子算分(复用 scoreOneLeaf)──
  for (const leaf of leaves) {
    const ls = scoreOneLeaf(leaf, targets, (ref) => raw[ref]?.[leaf.code]);
    for (const t of targets) scoreOf[t.ref][leaf.code] = ls[t.ref] ?? 0;
  }

  // ── 逐对象加权汇总(减分逐级封顶:cappedDeduct,与打分页 previewSubtotal 共用)──
  const results: RoundTargetResult[] = targets.map((t) => {
    let normalScore = 0;
    let bonus = 0;
    let deduct = 0;
    for (const top of indicators) {
      if (top.kind === 'deduction') {
        // 减分:逐级按本级减分上限封顶(超出锁死),不是只在顶层封顶
        deduct += cappedDeduct(top, (code) => scoreOf[t.ref][code] ?? 0);
        continue;
      }
      const s = flattenLeaves([top]).reduce((a, l) => a + (scoreOf[t.ref][l.code] ?? 0), 0);
      if (top.kind === 'bonus') bonus += s; // 加分:下层求和、上层自动汇总,无上限
      else normalScore += s;
    }
    const total = Math.max(0, round2(normalScore + bonus - deduct));
    return {
      ref: t.ref,
      name: t.name,
      leafScores: scoreOf[t.ref],
      normalScore: round2(normalScore),
      bonus: round2(bonus),
      deduct: round2(deduct),
      total,
      rank: 0,
      grade: '',
    };
  });

  // ── 排名(按总分降序)──
  const sorted = [...results].sort((a, b) => b.total - a.total);
  sorted.forEach((r, i) => (r.rank = i + 1));

  // ── 定级 ──
  applyGrades(sorted, gradeRules);

  return { computedAt, targets: sorted };
}

function applyGrades(sorted: RoundTargetResult[], rules: GradeRulesLike): void {
  const mode = rules.mode ?? (rules.tiers && rules.tiers.length ? 'rank' : 'score');
  const N = sorted.length;
  if (mode === 'rank') {
    const tiers = rules.tiers ?? [];
    const top = tiers.find((t) => t.band === 'top');
    const bottom = tiers.find((t) => t.band === 'bottom');
    const rest = tiers.find((t) => t.band === 'rest');
    const topN = top ? Math.ceil((N * (top.pct ?? 0)) / 100) : 0;
    const bottomN = bottom ? Math.ceil((N * (bottom.pct ?? 0)) / 100) : 0;
    // 触底档(band='downgrade',如「较差」)需当年重大不良影响/连续N年 → P3 数据;本期按名次档落 top/bottom/rest。
    for (const r of sorted) {
      if (top && r.rank <= topN) r.grade = top.grade;
      else if (bottom && r.rank > N - bottomN) r.grade = bottom.grade;
      else r.grade = rest?.grade ?? '';
    }
  } else {
    const ths = (rules.thresholds ?? []).slice().sort((a, b) => b.min - a.min);
    for (const r of sorted) {
      r.grade = '';
      for (const th of ths) {
        if (r.total >= th.min) {
          r.grade = th.grade;
          break;
        }
      }
    }
  }
}
