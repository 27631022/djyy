import type { IndicatorNode, RoundTargetResult } from "../api";
import { flattenLeaves, type LeafMeta } from "./ranking";

/**
 * 单位体检单的纯计算(无请求、可单测):
 * 雷达维度自适应下钻 / 单项排名 / 「我的单位」按党组织归属解析 / 规则版短板诊断 / AI 摘要拼装。
 */

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ─── 雷达维度:自适应下钻 ─── */

export interface CheckupDim {
  label: string;
  /** 该维度覆盖的末端叶子 code(computeDimRows 按它聚合) */
  leafCodes: string[];
  /** 维度满分 = Σ 叶子分值 */
  full: number;
}

/**
 * 取雷达图维度:顶层计权(normal)块作候选;只有一个且有子节点时逐层下钻
 * (真实数据常是「六大工程→思想聚力→…」单链,顶层只 1 个计权块画不成雷达),
 * 直到该层分支数 ≥2 或到叶子。返回的每个维度带其子树全部叶子 code + 满分。
 * 加分/减分块不进雷达(得分率语义不适用),在报告表/诊断里单列。
 */
export function pickDimensions(indicators: IndicatorNode[]): CheckupDim[] {
  let level = indicators.filter((n) => n.kind === "normal");
  while (level.length === 1 && level[0].children && level[0].children.length > 0) {
    // 每层都复筛 normal:防御 AI 生成/导入把加分/减分块嵌进 normal 根(减分维度的"得分率"语义会反)
    level = level[0].children.filter((n) => n.kind === "normal");
  }
  return level
    .map((n) => {
      const leaves = flattenLeaves([n]);
      return {
        label: n.label,
        leafCodes: leaves.map((l) => l.code),
        full: r2(leaves.reduce((a, l) => a + (l.weight || 0), 0)),
      };
    })
    .filter((d) => d.full > 0);
}

export interface DimRow {
  label: string;
  full: number;
  /** 本单位该维度得分 */
  score: number;
  /** 本单位得分率 0-100 */
  rate: number;
  /** 全体平均得分率 0-100 */
  avgRate: number;
}

/** 各维度:本单位得分/得分率 + 全体平均得分率(雷达图两条序列)。 */
export function computeDimRows(dims: CheckupDim[], mine: RoundTargetResult, all: RoundTargetResult[]): DimRow[] {
  const sumOf = (t: RoundTargetResult, codes: string[]) => codes.reduce((a, c) => a + (t.leafScores[c] ?? 0), 0);
  return dims.map((d) => {
    const score = r2(sumOf(mine, d.leafCodes));
    const avg = all.length ? all.reduce((a, t) => a + sumOf(t, d.leafCodes), 0) / all.length : 0;
    return {
      label: d.label,
      full: d.full,
      score,
      rate: r2(Math.max(0, Math.min(100, (score / d.full) * 100))),
      avgRate: r2(Math.max(0, Math.min(100, (avg / d.full) * 100))),
    };
  });
}

/* ─── 单项排名(●#):按叶子逐项算本单位名次 ─── */

/**
 * leafCode → 本单位该项名次(1 起)。口径与打分页右栏(previewIndicator)一致:
 * 一律按该项数值降序 —— 计权/加分 = 得分高者靠前;减分 = 扣分额大者靠前(「曝光台」语义,
 * 与打分页「减分按扣分多少由高到低」同一方向,两页同一个数)。并列共享名次(1+严格更高的个数)。
 */
export function leafRanks(mine: RoundTargetResult, all: RoundTargetResult[], meta: Map<string, LeafMeta>): Map<string, number> {
  const out = new Map<string, number>();
  for (const code of meta.keys()) {
    const v = mine.leafScores[code] ?? 0;
    const better = all.filter((t) => (t.leafScores[code] ?? 0) > v).length;
    out.set(code, better + 1);
  }
  return out;
}

/* ─── 「我的单位」解析:党组织归属 → 沿 parentId 爬到考核对象 ─── */

/**
 * 登录人党组织归属(me.memberships.party)逐个沿 parentId 向上爬,命中考核对象(targetRef 集)即认定
 * 「我所属的被考核单位」。支书/党员挂在支部,支部往上爬到其基层党委(=考核对象)。可能命中多个(多归属)。
 */
export function resolveMyTargetRefs(
  partyOrgIds: string[],
  parentOf: Map<string, string | null>,
  targetRefs: Set<string>,
): string[] {
  const hits: string[] = [];
  for (const start of partyOrgIds) {
    let cur: string | null | undefined = start;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (targetRefs.has(cur)) {
        if (!hits.includes(cur)) hits.push(cur);
        break;
      }
      cur = parentOf.get(cur) ?? null;
    }
  }
  return hits;
}

/* ─── 规则版短板诊断(AI 不可达时的兜底,也是 AI 摘要的数据源)─── */

export interface IssueSection {
  title: string;
  tone: "bad" | "warn" | "good";
  items: string[];
}

export interface CheckupIssueInput {
  mine: RoundTargetResult;
  total: number;
  dimRows: DimRow[];
  meta: Map<string, LeafMeta>;
  ranks: Map<string, number>;
  unitCount: number;
}

/** 规则版诊断:失分较多 / 被扣分 / 加分空间 / 优势保持,各取要点。 */
export function buildIssues({ mine, dimRows, meta, ranks, unitCount }: CheckupIssueInput): IssueSection[] {
  const sections: IssueSection[] = [];

  // 失分较多的计权指标(失分额降序,取前 5;满分 0 的跳过)
  const losses = [...meta.values()]
    .filter((m) => m.kind === "normal" && (m.weight || 0) > 0)
    .map((m) => ({ m, score: mine.leafScores[m.code] ?? 0, lost: r2((m.weight || 0) - (mine.leafScores[m.code] ?? 0)) }))
    .filter((x) => x.lost > 0.005)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 5);
  if (losses.length) {
    sections.push({
      title: "失分较多",
      tone: "bad",
      items: losses.map(
        (x) => `「${x.m.label}」得 ${r2(x.score)} / ${x.m.weight},失 ${x.lost} 分(单项第 ${ranks.get(x.m.code) ?? "-"} 名 / ${unitCount})`,
      ),
    });
  }

  // 被扣分项
  const deducted = [...meta.values()]
    .filter((m) => m.kind === "deduction" && (mine.leafScores[m.code] ?? 0) > 0)
    .sort((a, b) => (mine.leafScores[b.code] ?? 0) - (mine.leafScores[a.code] ?? 0));
  if (deducted.length) {
    sections.push({
      title: "被扣分项(需整改防再犯)",
      tone: "bad",
      items: deducted.map((m) => `「${m.label}」扣 ${r2(mine.leafScores[m.code] ?? 0)} 分`),
    });
  }

  // 加分空间(加分叶未拿满)
  const bonusGaps = [...meta.values()]
    .filter((m) => m.kind === "bonus" && (m.weight || 0) - (mine.leafScores[m.code] ?? 0) > 0.005)
    .sort((a, b) => (b.weight - (mine.leafScores[b.code] ?? 0)) - (a.weight - (mine.leafScores[a.code] ?? 0)))
    .slice(0, 4);
  if (bonusGaps.length) {
    sections.push({
      title: "加分空间(可主动争取)",
      tone: "warn",
      items: bonusGaps.map(
        (m) => `「${m.label}」当前 ${r2(mine.leafScores[m.code] ?? 0)} / ${m.weight},还有 ${r2(m.weight - (mine.leafScores[m.code] ?? 0))} 分空间`,
      ),
    });
  }

  // 优势维度(得分率 ≥ 平均 + 10 个百分点)
  const strong = dimRows.filter((d) => d.rate >= d.avgRate + 10 && d.rate > 0).slice(0, 3);
  if (strong.length) {
    sections.push({
      title: "优势保持",
      tone: "good",
      items: strong.map((d) => `「${d.label}」得分率 ${d.rate}%(全体平均 ${d.avgRate}%)`),
    });
  }

  return sections;
}

/** 拼给 AI 的体检数据摘要(与规则版同一数据源,格式固定、可复现)。 */
export function checkupSummaryForAi(input: CheckupIssueInput): string {
  const { mine, total, dimRows, unitCount } = input;
  const lines: string[] = [
    `总分 ${mine.total} / ${total},第 ${mine.rank} 名 / ${unitCount} 个单位${mine.grade ? `,定级「${mine.grade}」` : ""}`,
    `计权 ${mine.normalScore} + 加分 ${mine.bonus} − 减分 ${mine.deduct}`,
    `各维度得分率(本单位 vs 全体平均):` +
      dimRows.map((d) => `${d.label} ${d.rate}%/${d.avgRate}%`).join(";"),
  ];
  for (const s of buildIssues(input)) lines.push(`${s.title}:${s.items.join(";")}`);
  return lines.join("\n");
}
