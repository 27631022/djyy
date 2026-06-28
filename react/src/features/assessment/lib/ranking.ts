import type { GradeRules, GradeTier, IndicatorNode } from "../api";

/** 末端叶子 DFS 收集。 */
export function flattenLeaves(nodes: IndicatorNode[]): IndicatorNode[] {
  const out: IndicatorNode[] = [];
  const walk = (ns: IndicatorNode[]) =>
    ns.forEach((n) => (n.children && n.children.length ? walk(n.children) : out.push(n)));
  walk(nodes);
  return out;
}

/** 某用户负责的叶子 code 集(leaf.ownerUserIds 含 userId;兼容旧单值 ownerUserId)。userId 空 → 空集。 */
export function responsibleLeafCodes(tree: IndicatorNode[], userId: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!userId) return set;
  for (const lf of flattenLeaves(tree)) {
    const owners = lf.ownerUserIds ?? (lf.ownerUserId ? [lf.ownerUserId] : []);
    if (owners.includes(userId)) set.add(lf.code);
  }
  return set;
}

export interface LeafMeta {
  code: string;
  label: string;
  weight: number;
  kind: string;
  /** 顶层一级目录名(顶层叶子取自身) */
  groupLabel: string;
}

/** 叶子 code → 元数据(label / 满分 weight / kind / 一级目录名)。 */
export function leafMetaMap(tree: IndicatorNode[]): Map<string, LeafMeta> {
  const m = new Map<string, LeafMeta>();
  const walk = (nodes: IndicatorNode[], groupLabel: string) => {
    for (const n of nodes) {
      const g = groupLabel || n.label;
      if (n.children && n.children.length) walk(n.children, g);
      else m.set(n.code, { code: n.code, label: n.label, weight: n.weight || 0, kind: n.kind, groupLabel: g });
    }
  };
  walk(tree, "");
  return m;
}

/** 进度条百分比:score / 列表最大值(最高 = 100%)。 */
export function barPct(score: number, maxInList: number): number {
  if (maxInList <= 0) return 0;
  return Math.max(0, Math.min(100, (score / maxInList) * 100));
}

/** 金/银/铜 名次样式(语义色,不随主题)。返回 null = 非前三。 */
export function medalStyle(rank: number): { badge: string; text: string } | null {
  if (rank === 1) return { badge: "linear-gradient(135deg,#F5A623,#E8700A)", text: "#E8700A" };
  if (rank === 2) return { badge: "linear-gradient(135deg,#C0C0C0,#A8A8A8)", text: "#888" };
  if (rank === 3) return { badge: "linear-gradient(135deg,#CD7F32,#A0522D)", text: "#A0522D" };
  return null;
}

function gradeTierText(t: GradeTier): string {
  const name = t.grade || "档";
  if (t.band === "top") return `${name}=排名前 ${t.pct ?? 0}%${t.requireNoLoss ? "(需未亏损)" : ""}`;
  if (t.band === "bottom") return `${name}=排名后 ${t.pct ?? 0}%`;
  if (t.band === "rest") return `${name}=其余`;
  if (t.band === "downgrade") return `${name}=连续${t.years ?? 2}年${t.fromGrade ?? ""}或重大不良影响`;
  return name;
}

/** 定级规则 → 一句话可读(打分页规则展示用)。 */
export function gradeRulesText(g: GradeRules | undefined): string {
  if (!g) return "未设定级规则";
  const mode = g.mode ?? (g.tiers && g.tiers.length ? "rank" : "score");
  if (mode === "rank") {
    const tiers = g.tiers ?? [];
    if (!tiers.length) return "按名次划档(未配置档次)";
    return tiers.map(gradeTierText).join(" · ");
  }
  const th = g.thresholds ?? [];
  if (!th.length) return "按总分划档(未配置阈值)";
  return [...th]
    .sort((a, b) => b.min - a.min)
    .map((t) => `${t.grade || "档"}=≥${t.min} 分`)
    .join(" · ");
}
