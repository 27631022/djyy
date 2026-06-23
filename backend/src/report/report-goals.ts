import { BadRequestException } from '@nestjs/common';
import type { ReportField } from './report-fields';

/**
 * 报送目标(ReportGoal)—— 通用「报送明细查询工具」,与具体业务无关,任何报送任务都能用。
 * 两栏模型(左筛选 → 中统计),只产出「目标值 + 实际值」,不做达标判断:
 *
 *   左·筛选(groups + groupOp):单层分组。
 *     · 每条 condition = { col, values[] }:col=本任务派生列(见 deriveGoalColumns),
 *       values 内多值=「或」(精确列 ∈ / 文本列 包含),values 空=该列不限。
 *     · 一个 group 内多条 condition 用 group.op(and/or)连;多个 group 之间用 groupOp(and/or)连。
 *       → 能表达 (福利费 且 第一部分) 或 (工会经费)。无 group / 空 group = 全部明细。
 *
 *   中·统计(agg + metricCol + groupBy/grain):把命中明细算成实际值 S。
 *     · agg: 'sum' 求和 / 'avg' 平均 / 'count' 计数(文本列只能计数 = 统计数量)。
 *     · metricCol: sum/avg 对哪列;count 可选(指定列=统计该列非空行数,空=命中行数)。
 *     · groupBy: 选了 → 按 日期列粒度(grain 年/季/月)或维度列值 分堆,每堆各算一个 S。
 *
 *   目标值(逐单位,goalTargetsJson)仅作展示参考(目标 vs 实际 + 完成率,中性);
 *   ★达标判断 + 给分由【考核工具】统一处理 —— report 只当数据源,不判断、不复合(见 assessment spec P2 边界)。
 *
 * ★通用关键:条件列/聚合列/分组列都由 deriveGoalColumns(task.fields) 派生,引擎按 col.source 取值
 *   (结构化列 col:* / 金额 amount / 其余动态列 extra:*)。换报送类型 = 字段变,引擎零改。
 * 旧字段 { kind, conditions, targetMode, target, targetOp, perGroupMode } 在 normalizeGoals 里向前兼容/忽略。
 */
export type GoalAgg = 'sum' | 'avg' | 'count';
export type GoalBool = 'and' | 'or';
export type GoalGrain = 'year' | 'quarter' | 'month';
export type GoalColMatch = 'exact' | 'text';

/** 一个筛选条件:某列 ∈/包含 一组值(values 内=或;空=不限)。 */
export interface GoalCondition {
  col: string;
  values: string[];
}
/** 条件分组:组内多条 condition 用 op(且/或)连。 */
export interface GoalGroup {
  op: GoalBool;
  conditions: GoalCondition[];
}

export interface ReportGoal {
  key: string;
  label: string;
  // 左·筛选
  groupOp: GoalBool; // 组与组之间(且/或)
  groups: GoalGroup[];
  // 中·统计
  agg: GoalAgg;
  metricCol?: string; // sum/avg 对哪列;count 可选(该列非空数,空=命中行数)
  groupBy?: string; // 分组依据列 key;空=不分组
  grain?: GoalGrain; // groupBy 为日期列时的粒度
  // 目标值(逐单位,goalTargetsJson)仅作展示参考;达标判断 + 给分由考核工具统一处理(report 不判断)。
}

/** 从任务字段派生出的「可筛选/可聚合/可分组列」。 */
export interface GoalColumn {
  key: string;
  label: string;
  role: 'dim' | 'metric' | 'date'; // dim=筛选,metric=聚合,date=可按粒度分组
  match?: GoalColMatch; // dim
  options?: string[]; // dim·exact 的静态可选值(select/费用来源)
  source: string; // 取值来源:'col:<结构化列>' | 'amount' | 'extra:<code>'
  isCents?: boolean; // metric:值以「分」存(金额列)
}

// catalog_pick 列展开成的快照子列(映射到 ReportLine 结构化列)
const CATALOG_SUBCOLS: Omit<GoalColumn, 'role'>[] = [
  { key: 'category', label: '分部分', match: 'exact', source: 'col:category' },
  { key: 'recommendOrg', label: '推荐单位', match: 'text', source: 'col:recommendOrg' },
  { key: 'origin', label: '产地', match: 'text', source: 'col:origin' },
  { key: 'catalogSupplier', label: '清单供应商', match: 'text', source: 'col:catalogSupplier' },
  { key: 'supplier', label: '销售方', match: 'text', source: 'col:supplier' },
  { key: 'productName', label: '产品名称', match: 'text', source: 'col:productName' },
  { key: 'spec', label: '规格', match: 'text', source: 'col:spec' },
];

/** 从任务字段派生可筛选列(dim)+ 可聚合列(metric)+ 可分组日期列(date)。任何报送类型都按它自己的字段出列。 */
export function deriveGoalColumns(fields: ReportField[]): GoalColumn[] {
  const cols: GoalColumn[] = [];
  const seen = new Set<string>();
  const push = (c: GoalColumn) => {
    if (!seen.has(c.key)) {
      seen.add(c.key);
      cols.push(c);
    }
  };

  // 头层费用来源(套到每行)
  const feeField = fields.find((f) => f.role === 'feeSource');
  if (feeField)
    push({ key: 'feeSource', label: feeField.label || '费用来源', role: 'dim', match: 'exact', options: feeField.options ?? [], source: 'col:feeSource' });

  // 头层购买日期(role=purchaseDate)→ 可按年/季/月分组(report.service 把 submission.purchaseDate 注入每行 structured.purchaseDate)
  const dateHead = fields.find((f) => f.role === 'purchaseDate');
  if (dateHead) push({ key: dateHead.code, label: dateHead.label || '日期', role: 'date', source: 'col:purchaseDate' });

  const dt = fields.find((f) => f.type === 'detail_table');
  for (const c of dt?.columns ?? []) {
    if (c.type === 'catalog_pick') {
      for (const sub of CATALOG_SUBCOLS) push({ ...sub, role: 'dim' });
    } else if (c.type === 'number') {
      if (c.role === 'amount') push({ key: c.code, label: c.label || '金额', role: 'metric', source: 'amount', isCents: true });
      else push({ key: c.code, label: c.label, role: 'metric', source: `extra:${c.code}` });
    } else if (c.type === 'select' && c.role !== 'feeSource') {
      push({ key: c.code, label: c.label, role: 'dim', match: 'exact', options: c.options ?? [], source: `extra:${c.code}` });
    } else if (c.type === 'text') {
      push({ key: c.code, label: c.label, role: 'dim', match: 'text', source: `extra:${c.code}` });
    } else if (c.type === 'date') {
      push({ key: c.code, label: c.label, role: 'date', source: `extra:${c.code}` });
    }
  }
  return cols;
}

const KEY_RE = /^goal_\d+$/;
const AGGS: GoalAgg[] = ['sum', 'avg', 'count'];
const GRAINS: GoalGrain[] = ['year', 'quarter', 'month'];

/** 校验并规整目标定义数组(非法抛 400)。列名按任务字段派生,故只校验形状(列有效性 compute 期软处理)。 */
export function normalizeGoals(raw: unknown): ReportGoal[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new BadRequestException('goals 必须是数组');
  if (raw.length > 50) throw new BadRequestException('目标过多(上限 50 个)');
  const out: ReportGoal[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    if (typeof item !== 'object' || item === null) throw new BadRequestException(`第 ${i + 1} 个目标格式错误`);
    const g = item as Record<string, unknown>;
    const key = typeof g.key === 'string' && KEY_RE.test(g.key) ? g.key : `goal_${i + 1}`;
    if (seen.has(key)) throw new BadRequestException(`目标编号 "${key}" 重复`);
    seen.add(key);
    const label = typeof g.label === 'string' ? g.label.trim() : '';
    if (!label) throw new BadRequestException(`第 ${i + 1} 个目标缺少名称`);

    // 兼容旧字段:kind=presence→count、kind=amount→sum;旧 targetOp/perGroupMode 等判断字段一律忽略(判断归考核)
    const legacyKind = typeof g.kind === 'string' ? g.kind : '';
    const agg: GoalAgg = AGGS.includes(g.agg as GoalAgg)
      ? (g.agg as GoalAgg)
      : legacyKind === 'presence'
        ? 'count'
        : 'sum';

    const goal: ReportGoal = {
      key,
      label,
      groupOp: g.groupOp === 'or' ? 'or' : 'and',
      groups: normalizeGroups(g),
      agg,
    };
    if (typeof g.metricCol === 'string' && g.metricCol.trim()) goal.metricCol = g.metricCol.trim();
    if (typeof g.groupBy === 'string' && g.groupBy.trim()) {
      goal.groupBy = g.groupBy.trim();
      if (GRAINS.includes(g.grain as GoalGrain)) goal.grain = g.grain as GoalGrain;
    }
    out.push(goal);
  });
  return out;
}

/** 规整 groups。兼容旧 conditions[](扁平 AND → 单组)与更旧 { dim, dimValue }。 */
function normalizeGroups(g: Record<string, unknown>): GoalGroup[] {
  if (Array.isArray(g.groups)) {
    const out: GoalGroup[] = [];
    for (const grp of g.groups) {
      if (typeof grp !== 'object' || grp === null) continue;
      const gg = grp as Record<string, unknown>;
      const conditions = normalizeConditionArray(gg.conditions);
      out.push({ op: gg.op === 'or' ? 'or' : 'and', conditions });
    }
    return out;
  }
  // 旧扁平 conditions[](AND)→ 单组
  if (Array.isArray(g.conditions)) {
    return [{ op: 'and', conditions: normalizeConditionArray(g.conditions) }];
  }
  // 更旧 { dim, dimValue }
  if (typeof g.dim === 'string') {
    const dim = g.dim;
    const dv = typeof g.dimValue === 'string' ? g.dimValue.trim() : '';
    if (dim === 'all' || dim === 'field' || !dv) return [];
    return [{ op: 'and', conditions: [{ col: dim, values: [dv] }] }];
  }
  return [];
}

function normalizeConditionArray(raw: unknown): GoalCondition[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: GoalCondition[] = [];
  for (const c of arr) {
    if (typeof c !== 'object' || c === null) continue;
    const cc = c as Record<string, unknown>;
    const col = typeof cc.col === 'string' ? cc.col.trim() : '';
    if (!col) continue;
    const values = Array.isArray(cc.values)
      ? [...new Set(cc.values.map((v) => String(v).trim()).filter(Boolean))]
      : [];
    out.push({ col, values });
  }
  return out;
}

export function parseGoals(json: string): ReportGoal[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as ReportGoal[]) : [];
  } catch {
    return [];
  }
}

/* ─── 完成情况计算 ─── */

/** 一条明细的取值载体:结构化列 + 解析后的 extraJson + 金额(分)。 */
export interface GoalLine {
  amountCents: number;
  taxCents?: number;
  structured: Record<string, string | null | undefined>;
  extra: Record<string, unknown>;
}

/** 原始报送提交(头购买日期 + 明细行,prisma 形状)。 */
export interface RawSubmissionForGoals {
  purchaseDate?: Date | string | null;
  lines: {
    amountCents: number;
    category?: string | null;
    feeSource?: string | null;
    recommendOrg?: string | null;
    origin?: string | null;
    catalogSupplier?: string | null;
    supplier?: string | null;
    productName?: string | null;
    spec?: string | null;
    extraJson?: string | null;
  }[];
}

/** 从原始报送提交构建 GoalLine[](goalProgress / queryGoal / 填报页完成情况共用,头购买日期注入每行)。 */
export function buildGoalLines(subs: RawSubmissionForGoals[]): GoalLine[] {
  return subs.flatMap((s) => {
    const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate).toISOString() : null;
    return s.lines.map((l) => {
      let taxCents = 0;
      let extra: Record<string, unknown> = {};
      try {
        const o = JSON.parse(l.extraJson ?? '{}');
        if (o && typeof o === 'object' && !Array.isArray(o)) {
          extra = o as Record<string, unknown>;
          taxCents = Number((o as { taxCents?: unknown }).taxCents) || 0;
        }
      } catch {
        /* noop */
      }
      return {
        amountCents: l.amountCents,
        taxCents,
        structured: {
          category: l.category,
          feeSource: l.feeSource,
          recommendOrg: l.recommendOrg,
          origin: l.origin,
          catalogSupplier: l.catalogSupplier,
          supplier: l.supplier,
          productName: l.productName,
          spec: l.spec,
          purchaseDate,
        },
        extra,
      };
    });
  });
}
/** 分组明细:一堆(季度/月/维度值)的统计值(无达标判断,判断归考核)。 */
export interface GoalGroupStat {
  label: string;
  value: number;
}
/** 一个目标对一个单位的完成情况(只给目标 + 实际 + 中性完成率;不判断达标)。 */
export interface GoalProgressItem {
  key: string;
  label: string;
  grouped: boolean;
  money: boolean; // 金额类(显示 ¥);count/分组为 false
  actual: number | null; // 实际值(分组=各堆之和总计)
  target: number | null; // 逐单位目标值(参考;无则 null)
  rate: number | null; // 完成率 % = 实际/目标(target>0 时;中性,无达标判断)
  groups?: GoalGroupStat[]; // 分组明细(每季度的数…)
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const isEmptyCell = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function sourceValue(source: string, line: GoalLine): unknown {
  if (source === 'amount') return line.amountCents;
  if (source.startsWith('col:')) return line.structured[source.slice(4)];
  if (source.startsWith('extra:')) return line.extra[source.slice(6)];
  return undefined;
}
function dimText(col: GoalColumn, line: GoalLine): string {
  const v = sourceValue(col.source, line);
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function numericValue(col: GoalColumn, line: GoalLine): number {
  if (col.source === 'amount') return (line.amountCents || 0) + (line.taxCents || 0); // 价税合计(分)
  const n = Number(sourceValue(col.source, line));
  return Number.isFinite(n) ? n : 0;
}

/** 把命中明细按 agg 算成一个数。count→行数,sum/avg→数值(金额列已 ÷100 转元)。 */
function aggregate(agg: GoalAgg, metric: GoalColumn | undefined, lines: GoalLine[]): number {
  if (agg === 'count') {
    if (!metric) return lines.length;
    return lines.filter((l) => !isEmptyCell(sourceValue(metric.source, l))).length;
  }
  if (!metric) return 0;
  let sum = 0;
  for (const l of lines) sum += numericValue(metric, l);
  const total = metric.isCents ? sum / 100 : sum;
  if (agg === 'avg') return lines.length ? total / lines.length : 0;
  return total;
}

/** 一条明细是否落入某目标的「日期堆」/「维度堆」;返回堆标签(null=不计入)。 */
function bucketLabel(goal: ReportGoal, gb: GoalColumn, line: GoalLine): string | null {
  const raw = sourceValue(gb.source, line);
  if (gb.role === 'date') {
    const d = parseDate(raw);
    if (!d) return null;
    const y = d.getUTCFullYear();
    if (goal.grain === 'month') return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (goal.grain === 'year') return `${y}`;
    return `${y} Q${Math.floor(d.getUTCMonth() / 3) + 1}`; // 季度(默认)
  }
  const s = raw == null ? '' : String(raw).trim();
  return s || null;
}
function parseDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const d = typeof raw === 'number' ? new Date(raw) : new Date(String(raw).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function condMatches(cond: GoalCondition, line: GoalLine, colByKey: Map<string, GoalColumn>): boolean {
  if (!cond.values || cond.values.length === 0) return true;
  const col = colByKey.get(cond.col);
  if (!col) return true; // 未知列 → 不约束(软)
  const v = dimText(col, line);
  return col.match === 'text' ? cond.values.some((val) => v.includes(val)) : cond.values.includes(v);
}

/** 一条明细是否通过目标的左侧筛选(单层分组:组内 op、组间 groupOp)。 */
function lineMatches(goal: ReportGoal, line: GoalLine, colByKey: Map<string, GoalColumn>): boolean {
  const groups = goal.groups ?? [];
  if (groups.length === 0) return true;
  const groupResults = groups.map((grp) => {
    const conds = grp.conditions ?? [];
    if (conds.length === 0) return true;
    const rs = conds.map((c) => condMatches(c, line, colByKey));
    return grp.op === 'or' ? rs.some(Boolean) : rs.every(Boolean);
  });
  return goal.groupOp === 'or' ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

/**
 * 算一个单位对全部目标的「目标 + 实际 + 中性完成率」(不判断达标;达标/给分归考核工具)。
 * @param columns deriveGoalColumns(task.fields):引擎据此按 col 取值/聚合/分组
 * @param perUnitTargets { goalKey: 目标值 }(逐单位目标值,仅作参考展示)
 */
export function computeGoalProgress(
  goals: ReportGoal[],
  columns: GoalColumn[],
  lines: GoalLine[],
  perUnitTargets: Record<string, number>,
): GoalProgressItem[] {
  const colByKey = new Map(columns.map((c) => [c.key, c]));
  const defaultMetric = columns.find((c) => c.role === 'metric' && c.source === 'amount') ?? columns.find((c) => c.role === 'metric');
  return goals.map((goal) => {
    const metric = (goal.metricCol ? colByKey.get(goal.metricCol) : undefined) ?? (goal.agg === 'count' ? undefined : defaultMetric);
    const money = goal.agg !== 'count' && !!metric?.isCents;
    const matched = lines.filter((l) => lineMatches(goal, l, colByKey));
    const target = Number(perUnitTargets[goal.key]) || 0;

    // ── 分组(每季度/每月/每维度值):列出每堆实际值,总计 = 各堆之和 ──
    if (goal.groupBy) {
      const gb = colByKey.get(goal.groupBy);
      const buckets = new Map<string, GoalLine[]>();
      if (gb)
        for (const l of matched) {
          const k = bucketLabel(goal, gb, l);
          if (k == null) continue;
          const arr = buckets.get(k) ?? [];
          arr.push(l);
          buckets.set(k, arr);
        }
      const groupStats: GoalGroupStat[] = [...buckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, ls]) => ({ label, value: round2(aggregate(goal.agg, metric, ls)) }));
      const total = round2(groupStats.reduce((s, g) => s + g.value, 0));
      const rate = target > 0 ? round1((total / target) * 100) : null;
      return { key: goal.key, label: goal.label, grouped: true, money, actual: total, target: target || null, rate, groups: groupStats };
    }

    // ── 不分组:一个实际值 S ──
    const s = round2(aggregate(goal.agg, metric, matched));
    const rate = target > 0 ? round1((s / target) * 100) : null;
    return { key: goal.key, label: goal.label, grouped: false, money, actual: s, target: target || null, rate };
  });
}
