import { BadRequestException } from '@nestjs/common';
import type { ReportField } from './report-fields';

/**
 * 报送目标(ReportGoal)—— 通用、可多个,挂在 ReportTask.goalsJson(发布快照)。
 * 一个目标 = 「对明细按维度过滤 + 看金额达标 / 是否有内容」:
 *   - kind='amount'   : Σ(命中明细的价税合计) ≥ 目标值 → 完成率 + 是否达标;目标值 uniform 或 perUnit。
 *   - kind='presence' : 命中明细存在(dim=feeSource/category)或 某头字段有内容(dim='field')→ 是否达标(bool)。
 * 维度 dim:all(全部明细) | feeSource(费用来源) | category(分部分,如第一部分) | field(某头字段)。
 * 加新维度 = DIMS 加一项 + lineMatches/取数处加一支。目标设定属【业务/report】(见 assessment spec P2 边界)。
 */
export type GoalKind = 'amount' | 'presence';
export type GoalDim = 'all' | 'feeSource' | 'category' | 'field';
export type GoalTargetMode = 'uniform' | 'perUnit';

export interface ReportGoal {
  key: string; // goal_1
  label: string;
  kind: GoalKind;
  dim: GoalDim;
  dimValue?: string; // feeSource/category 的取值;dim='field' 时 = 头字段 code
  targetMode?: GoalTargetMode; // 仅 amount
  target?: number; // uniform 目标值(元),仅 amount + uniform
}

const KEY_RE = /^goal_\d+$/;
const KINDS: GoalKind[] = ['amount', 'presence'];
const DIMS: GoalDim[] = ['all', 'feeSource', 'category', 'field'];

/** 校验并规整目标定义数组(非法抛 400)。 */
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
    const kind = KINDS.includes(g.kind as GoalKind) ? (g.kind as GoalKind) : null;
    if (!kind) throw new BadRequestException(`目标 "${label}" 的类型不支持`);
    const dim = DIMS.includes(g.dim as GoalDim) ? (g.dim as GoalDim) : 'all';
    const goal: ReportGoal = { key, label, kind, dim };
    if (dim === 'feeSource' || dim === 'category' || dim === 'field') {
      const dv = typeof g.dimValue === 'string' ? g.dimValue.trim() : '';
      if (!dv) throw new BadRequestException(`目标 "${label}" 需指定${dim === 'field' ? '检查的字段' : '范围取值'}`);
      goal.dimValue = dv;
    }
    if (kind === 'amount') {
      if (dim === 'field') throw new BadRequestException(`目标 "${label}":金额类不支持「字段」范围`);
      const mode: GoalTargetMode = g.targetMode === 'perUnit' ? 'perUnit' : 'uniform';
      goal.targetMode = mode;
      if (mode === 'uniform') {
        const t = Number(g.target);
        if (!Number.isFinite(t) || t < 0) throw new BadRequestException(`目标 "${label}" 需填写有效的目标金额`);
        goal.target = t;
      }
      // perUnit:目标值在 ReportTarget.goalTargetsJson[key],定义里不存
    }
    out.push(goal);
  });
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

export interface GoalLine {
  amountCents: number;
  taxCents?: number;
  feeSource?: string | null;
  category?: string | null;
}
export interface GoalProgress {
  key: string;
  label: string;
  kind: GoalKind;
  actualAmount: number | null; // 金额类:实际价税合计(元);presence 类为 null
  target: number | null; // 金额类:本单位目标值(元)
  rate: number | null; // 金额类:完成率 %
  met: boolean; // 是否达标/有内容
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

function lineMatches(goal: ReportGoal, l: GoalLine): boolean {
  if (goal.dim === 'feeSource') return (l.feeSource ?? '') === goal.dimValue;
  if (goal.dim === 'category') return (l.category ?? '') === goal.dimValue;
  return true; // 'all'
}

/**
 * 算一个单位对全部目标的完成情况。
 * @param lines        该单位所有明细行(跨其全部发票)
 * @param perUnitTargets 该单位的逐单位目标值 { goalKey: 元 }
 * @param fieldHasContent (code)=>bool:该单位是否有任一发票填了该头字段(presence·field 用)
 */
export function computeGoalProgress(
  goals: ReportGoal[],
  lines: GoalLine[],
  perUnitTargets: Record<string, number>,
  fieldHasContent: (fieldCode: string) => boolean,
): GoalProgress[] {
  return goals.map((goal) => {
    if (goal.kind === 'amount') {
      let cents = 0;
      for (const l of lines) if (lineMatches(goal, l)) cents += (l.amountCents || 0) + (l.taxCents || 0);
      const actual = cents / 100;
      const target =
        goal.targetMode === 'perUnit' ? Number(perUnitTargets[goal.key]) || 0 : Number(goal.target) || 0;
      const rate = target > 0 ? round1((actual / target) * 100) : actual > 0 ? 100 : 0;
      const met = target > 0 ? actual >= target : actual > 0;
      return { key: goal.key, label: goal.label, kind: goal.kind, actualAmount: round2(actual), target: target || null, rate, met };
    }
    // presence:dim='field' 看头字段是否有内容;否则看是否有命中明细
    const met =
      goal.dim === 'field' ? fieldHasContent(goal.dimValue ?? '') : lines.some((l) => lineMatches(goal, l));
    return { key: goal.key, label: goal.label, kind: goal.kind, actualAmount: null, target: null, rate: null, met };
  });
}

/** 某发票是否填了某头字段(按字段 role 映射到提交头属性;自定义字段查 headData)。presence·field 用。 */
export function submissionFieldFilled(
  fields: ReportField[],
  sub: {
    invoiceNo?: string | null;
    purchaseDate?: unknown;
    invoiceFileId?: string | null;
    contractFileId?: string | null;
    headData?: Record<string, unknown> | null;
  },
  fieldCode: string,
): boolean {
  const f = fields.find((x) => x.code === fieldCode);
  const role = f?.role;
  if (role === 'invoiceFile') return !!sub.invoiceFileId;
  if (role === 'contractFile') return !!sub.contractFileId;
  if (role === 'invoiceNo') return !!(sub.invoiceNo && String(sub.invoiceNo).trim());
  if (role === 'purchaseDate') return sub.purchaseDate != null;
  const v = sub.headData?.[fieldCode];
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
}
