import type { GradeRules, GradeTier } from "./api";

/**
 * 定级规则预设(党委 / 党支部 / 党员 综合考核定级)。
 * 来源:用户单位真实考核办法。按名次划档(mode='rank'),计算在 P2 引擎。
 * 加新预设 = 这里加一条;与考核关系 key 关联,可按关系自动推荐。
 */
export interface GradePreset {
  key: string;
  label: string;
  /** 适用的考核关系 key(被考核对象层级)—— 用于按当前关系自动推荐 */
  relationKeys: string[];
  /** 一句话说明 */
  note: string;
  rules: GradeRules;
}

export const GRADE_PRESETS: GradePreset[] = [
  {
    key: "committee",
    label: "党委(直属党总支)综合考核定级",
    relationKeys: ["party.company.committee"],
    note: "先进 / 良好 / 一般 / 较差;排名前 15% 且未亏损为先进,后 15% 为一般,连续 2 年一般或当年重大不良影响为较差。",
    rules: {
      mode: "rank",
      tiers: [
        { grade: "先进", band: "top", pct: 15, requireNoLoss: true },
        { grade: "良好", band: "rest" },
        { grade: "一般", band: "bottom", pct: 15 },
        { grade: "较差", band: "downgrade", fromGrade: "一般", years: 2, onMajorIncident: true },
      ],
    },
  },
  {
    key: "branch",
    label: "党支部综合考核定级",
    relationKeys: ["party.agency.branch", "party.grassroots.branch"],
    note: "先进 / 达标 / 基本达标 / 未达标;排名前 15% 为先进,后 15% 为基本达标,连续 2 年基本达标或当年重大不良影响为未达标。",
    rules: {
      mode: "rank",
      tiers: [
        { grade: "先进", band: "top", pct: 15 },
        { grade: "达标", band: "rest" },
        { grade: "基本达标", band: "bottom", pct: 15 },
        { grade: "未达标", band: "downgrade", fromGrade: "基本达标", years: 2, onMajorIncident: true },
      ],
    },
  },
  {
    key: "member",
    label: "党员综合考核定级",
    relationKeys: ["party.branch.member"],
    note: "优秀 / 合格 / 基本合格 / 不合格;排名前 30% 为优秀,后 5% 为基本合格,连续 2 年基本合格或当年重大不良影响为不合格。",
    rules: {
      mode: "rank",
      tiers: [
        { grade: "优秀", band: "top", pct: 30 },
        { grade: "合格", band: "rest" },
        { grade: "基本合格", band: "bottom", pct: 5 },
        { grade: "不合格", band: "downgrade", fromGrade: "基本合格", years: 2, onMajorIncident: true },
      ],
    },
  },
];

export function getGradePreset(key: string): GradePreset | undefined {
  return GRADE_PRESETS.find((p) => p.key === key);
}

/** 按当前考核关系推荐匹配的定级预设(被考核对象层级一致) */
export function presetForRelation(relationKey?: string): GradePreset | undefined {
  if (!relationKey) return undefined;
  return GRADE_PRESETS.find((p) => p.relationKeys.includes(relationKey));
}

/** 名次档的可读规则文字 */
export function tierRuleText(t: GradeTier): string {
  switch (t.band) {
    case "top":
      return `排名前 ${t.pct ?? 0}%${t.requireNoLoss ? "、且未亏损" : ""}`;
    case "bottom":
      return `排名后 ${t.pct ?? 0}%`;
    case "downgrade": {
      const parts: string[] = [];
      if (t.fromGrade && t.years) parts.push(`连续 ${t.years} 年「${t.fromGrade}」`);
      if (t.onMajorIncident) parts.push("当年发生重大不良影响");
      return parts.join(" 或 ") || "特殊情形";
    }
    default:
      return "其余对象";
  }
}

/** 深拷贝预设规则(应用时避免共享引用) */
export function cloneRules(rules: GradeRules): GradeRules {
  return JSON.parse(JSON.stringify(rules)) as GradeRules;
}
