import { flattenLeaves, type IndicatorNode } from './indicator-tree';
import { computeScore, getScoringSpec, type RawMetric, type ScoreCtx } from './scoring-strategies';

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
const toNum = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;

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

  // ── 逐叶子算分 ──
  for (const leaf of leaves) {
    const type = leaf.scoringType ?? '';
    const spec = getScoringSpec(type);
    const fullScore = Number.isFinite(leaf.weight) ? leaf.weight : 0;
    const params = leaf.strategyParams ?? {};
    const coefOf = (ref: string) => (leaf.difficultyOn ? leaf.difficultyCoefs?.[ref] ?? 1 : 1);

    if (!spec) {
      for (const t of targets) scoreOf[t.ref][leaf.code] = 0;
      continue;
    }

    if (spec.crossTarget) {
      // 系数乘在参与排名的值上,再排名
      const eff = targets.map((t) => ({ ref: t.ref, v: toNum(raw[t.ref]?.[leaf.code]) * coefOf(t.ref) }));
      const all = eff.map((e) => e.v);
      const order = params.order === 'asc' ? 'asc' : 'desc';
      for (const { ref, v } of eff) {
        const ahead = all.filter((x) => (order === 'asc' ? x < v : x > v)).length;
        const ctx: ScoreCtx = { fullScore, params, allValues: all, count: all.length || 1, rank: 1 + ahead };
        scoreOf[ref][leaf.code] = round2(computeScore(type, v, ctx));
      }
    } else {
      for (const t of targets) {
        const rv = (raw[t.ref]?.[leaf.code] ?? null) as RawMetric;
        const ctx: ScoreCtx = { fullScore, params };
        let s = computeScore(type, rv, ctx);
        if (leaf.difficultyOn) s *= coefOf(t.ref);
        scoreOf[t.ref][leaf.code] = round2(s);
      }
    }
  }

  // ── 逐对象加权汇总 ──
  const cap = (s: number, w: number | undefined) => (w && w > 0 ? Math.min(s, w) : s);
  const results: RoundTargetResult[] = targets.map((t) => {
    let normalScore = 0;
    let bonus = 0;
    let deduct = 0;
    for (const top of indicators) {
      const s = flattenLeaves([top]).reduce((a, l) => a + (scoreOf[t.ref][l.code] ?? 0), 0);
      if (top.kind === 'bonus') bonus += cap(s, top.weight);
      else if (top.kind === 'deduction') deduct += cap(s, top.weight);
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
