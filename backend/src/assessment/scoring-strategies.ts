import { BadRequestException } from '@nestjs/common';

/**
 * 计分工具(ScoringStrategy)注册表 —— 把数据源产出的「原始度量」换算成「得分」。
 * 与「数据源(data-sources.ts)」解耦:任意 outputType↔inputType 兼容的组合都可复用。
 * 照 task/task-fields.ts 的 FIELD_SPECS 范式:每种工具一条 spec(normalizeParams 校验参数 + compute 算分)。
 *
 * 加新计分工具 = 这里加一条 SCORING_SPECS + 前端 scoring/<type>.tsx 加一份镜像实现。
 */
export type ScoreInput = 'rate' | 'number' | 'bool' | 'count' | 'label' | 'deductions';

export interface ScoreCtx {
  /** 该叶子满分(= 指标分值) */
  fullScore: number;
  /** 规整后的策略参数 */
  params: Record<string, unknown>;
  /** crossTarget:全体对象同指标的 rawValue(数值);排名/标准化用 */
  allValues?: number[];
  /** crossTarget:本对象名次(1 起) */
  rank?: number;
  /** crossTarget:对象总数 */
  count?: number;
}

/** 扣分明细(人工扣分制):逐条「存在问题 → 扣分」,引擎归约成总扣分 */
export interface DeductItem {
  issue?: string;
  points?: number;
}
export interface DeductRaw {
  items: DeductItem[];
}
export type RawMetric = number | boolean | string | null | DeductRaw;

export interface ScoringSpec {
  type: string;
  label: string;
  inputType: ScoreInput;
  /** 是否需要全体对象数据(排名/标准化) */
  crossTarget: boolean;
  /** 校验 + 规整参数(非法抛 BadRequestException),返回干净 params */
  normalizeParams(raw: Record<string, unknown>): Record<string, unknown>;
  /** 原始度量 → 得分(纯函数;前端镜像同款做即时预览,后端权威) */
  compute(raw: RawMetric, ctx: ScoreCtx): number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function pickNum(o: unknown, k: string, d = 0): number {
  if (o && typeof o === 'object') {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return d;
}

/** 原始度量取数值(bool→1/0;字符串/对象/null/NaN→null) */
function asNumber(raw: RawMetric): number | null {
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  return null;
}

/** 扣分制:总扣分 = 各明细 points 之和(也容忍直接给一个总扣分 number) */
export function sumDeductions(raw: RawMetric): number {
  if (typeof raw === 'number') return Math.max(0, raw);
  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
    let d = 0;
    for (const it of raw.items) d += Math.max(0, pickNum(it, 'points', 0));
    return d;
  }
  return 0;
}

interface ScoreTier {
  min: number;
  score: number;
}
interface OverTier {
  over: number;
  bonus: number;
}
interface RankTier {
  topN: number;
  topPct: number;
  score: number;
}
interface GradeOption {
  label: string;
  score: number;
}

const SCORING_SPECS: Record<string, ScoringSpec> = {
  // 人工打分(加分制):0 分起评,责任部门直接录得分 0..满分(同屏显示评分标准 rubric)
  manual: {
    type: 'manual',
    label: '人工打分(加分制)',
    inputType: 'number',
    crossTarget: false,
    normalizeParams(raw) {
      const p: Record<string, unknown> = {};
      const m = pickNum(raw, 'max', NaN);
      if (Number.isFinite(m) && m >= 0) p.max = m;
      return p;
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const max = num(ctx.params.max, ctx.fullScore);
      return clamp(v, 0, max);
    },
  },

  // 人工打分(扣分制):分值满分起评,逐条记录「存在问题 → 扣分」,得分 = 分值 − 总扣分(扣到 0 为止)
  manual_deduct: {
    type: 'manual_deduct',
    label: '人工打分(扣分制)',
    inputType: 'deductions',
    crossTarget: false,
    normalizeParams() {
      return {};
    },
    compute(raw, ctx) {
      const d = sumDeductions(raw);
      return clamp(ctx.fullScore - d, 0, ctx.fullScore);
    },
  },

  // 完成率比例:满分 × 完成率(可设超额上限 cap)
  proportional: {
    type: 'proportional',
    label: '完成率比例',
    inputType: 'rate',
    crossTarget: false,
    normalizeParams(raw) {
      const cap = pickNum(raw, 'cap', 100);
      if (cap <= 0) throw new BadRequestException('完成率比例:上限 cap 必须 > 0');
      return { cap };
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const cap = num(ctx.params.cap, 100);
      const capped = Math.min(Math.max(v, 0), cap);
      return clamp((ctx.fullScore * capped) / 100, 0, (ctx.fullScore * cap) / 100);
    },
  },

  // 超额阶梯加分:≤100% 按比例;>100% 在满分基础上按超出百分点落档加分,封顶 capBonus
  overachieve_tiers: {
    type: 'overachieve_tiers',
    label: '超额阶梯加分',
    inputType: 'rate',
    crossTarget: false,
    normalizeParams(raw) {
      const arr = Array.isArray(raw.tiers) ? raw.tiers : [];
      const tiers: OverTier[] = arr
        .map((t) => ({ over: pickNum(t, 'over'), bonus: pickNum(t, 'bonus') }))
        .filter((t) => t.over >= 0 && t.bonus >= 0)
        .sort((a, b) => a.over - b.over);
      const p: Record<string, unknown> = { tiers };
      const base = pickNum(raw, 'base', NaN);
      if (Number.isFinite(base) && base >= 0) p.base = base;
      return p;
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      // base = 完成 100% 的得分(默认满分);超额按档「累加」加分;总分封顶 = 本项分值(fullScore),不可超
      const base = num(ctx.params.base, ctx.fullScore);
      if (v <= 100) return clamp((base * Math.max(v, 0)) / 100, 0, ctx.fullScore);
      const tiers = (ctx.params.tiers as OverTier[]) ?? [];
      const over = v - 100;
      let bonus = 0;
      for (const t of tiers) if (over >= t.over) bonus += t.bonus;
      return clamp(base + bonus, 0, ctx.fullScore);
    },
  },

  // 阶梯赋分:多段区间,命中第一个 raw≥min 的 score
  threshold_tiers: {
    type: 'threshold_tiers',
    label: '阶梯赋分',
    inputType: 'number',
    crossTarget: false,
    normalizeParams(raw) {
      const arr = Array.isArray(raw.tiers) ? raw.tiers : [];
      const tiers: ScoreTier[] = arr
        .map((t) => ({ min: pickNum(t, 'min'), score: pickNum(t, 'score') }))
        .filter((t) => t.score >= 0)
        .sort((a, b) => b.min - a.min);
      if (tiers.length === 0) throw new BadRequestException('阶梯赋分:至少配置一档');
      return { tiers };
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const tiers = (ctx.params.tiers as ScoreTier[]) ?? [];
      for (const t of tiers) if (v >= t.min) return clamp(t.score, 0, Math.max(ctx.fullScore, t.score));
      return 0;
    },
  },

  // 是否完成(二值):完成→onTrue(默认满分),否则→onFalse(默认 0)
  binary: {
    type: 'binary',
    label: '是否完成(二值)',
    inputType: 'bool',
    crossTarget: false,
    normalizeParams(raw) {
      const p: Record<string, unknown> = {};
      const t = pickNum(raw, 'onTrue', NaN);
      const f = pickNum(raw, 'onFalse', NaN);
      if (Number.isFinite(t) && t >= 0) p.onTrue = t;
      if (Number.isFinite(f) && f >= 0) p.onFalse = f;
      return p;
    },
    compute(raw, ctx) {
      const truthy = raw === true || raw === 1;
      const onTrue = num(ctx.params.onTrue, ctx.fullScore);
      const onFalse = num(ctx.params.onFalse, 0);
      return clamp(truthy ? onTrue : onFalse, 0, Math.max(ctx.fullScore, onTrue));
    },
  },

  // 排名阶梯:按名次落档(topN 或 topPct)
  rank_tiers: {
    type: 'rank_tiers',
    label: '排名阶梯',
    inputType: 'number',
    crossTarget: true,
    normalizeParams(raw) {
      const order = raw.order === 'asc' ? 'asc' : 'desc';
      const arr = Array.isArray(raw.tiers) ? raw.tiers : [];
      const tiers: RankTier[] = arr
        .map((t) => ({ topN: pickNum(t, 'topN'), topPct: pickNum(t, 'topPct'), score: pickNum(t, 'score') }))
        .filter((t) => t.score >= 0 && (t.topN > 0 || (t.topPct > 0 && t.topPct <= 100)))
        .sort((a, b) => (a.topN > 0 ? a.topN : a.topPct * 1e6) - (b.topN > 0 ? b.topN : b.topPct * 1e6));
      if (tiers.length === 0) throw new BadRequestException('排名阶梯:至少配置一档');
      return { order, tiers };
    },
    compute(raw, ctx) {
      const rank = ctx.rank;
      const count = ctx.count;
      if (!rank || !count) return 0;
      const tiers = (ctx.params.tiers as RankTier[]) ?? [];
      for (const t of tiers) {
        const n = t.topN > 0 ? t.topN : Math.ceil((count * t.topPct) / 100);
        if (rank <= n) return clamp(t.score, 0, Math.max(ctx.fullScore, t.score));
      }
      return 0;
    },
  },

  // 排名线性:满分 ×(count-rank+1)/count
  rank_linear: {
    type: 'rank_linear',
    label: '排名线性',
    inputType: 'number',
    crossTarget: true,
    normalizeParams(raw) {
      return { order: raw.order === 'asc' ? 'asc' : 'desc' };
    },
    compute(raw, ctx) {
      const rank = ctx.rank;
      const count = ctx.count;
      if (!rank || !count || count <= 0) return ctx.fullScore;
      return clamp((ctx.fullScore * (count - rank + 1)) / count, 0, ctx.fullScore);
    },
  },

  // 极差标准化:(raw-min)/(max-min) × 满分,可设保底 floor
  minmax: {
    type: 'minmax',
    label: '极差标准化',
    inputType: 'number',
    crossTarget: true,
    normalizeParams(raw) {
      const order = raw.order === 'asc' ? 'asc' : 'desc';
      const floor = pickNum(raw, 'floor', 0);
      return { order, floor: floor >= 0 ? floor : 0 };
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const all = (ctx.allValues ?? []).filter((x) => Number.isFinite(x));
      if (all.length === 0) return ctx.fullScore;
      const min = Math.min(...all);
      const max = Math.max(...all);
      const range = max - min;
      const floor = num(ctx.params.floor, 0);
      if (range === 0) return ctx.fullScore;
      const norm = ctx.params.order === 'asc' ? (max - v) / range : (v - min) / range;
      return clamp(floor + (ctx.fullScore - floor) * norm, 0, ctx.fullScore);
    },
  },

  // 加分:每项 × perUnit,封顶 cap(P2 归入 bonusScore)
  bonus: {
    type: 'bonus',
    label: '加分',
    inputType: 'count',
    crossTarget: false,
    normalizeParams(raw) {
      return { perUnit: pickNum(raw, 'perUnit', 1), cap: pickNum(raw, 'cap', 0) };
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const add = v * num(ctx.params.perUnit, 1);
      const cap = num(ctx.params.cap, 0);
      return cap > 0 ? Math.min(add, cap) : add;
    },
  },

  // 扣分:每项 × perUnit,封顶 cap(返回正数罚分;P2 归入 deductScore)
  deduction: {
    type: 'deduction',
    label: '扣分',
    inputType: 'count',
    crossTarget: false,
    normalizeParams(raw) {
      return { perUnit: pickNum(raw, 'perUnit', 1), cap: pickNum(raw, 'cap', 0) };
    },
    compute(raw, ctx) {
      const v = asNumber(raw);
      if (v === null) return 0;
      const penalty = v * num(ctx.params.perUnit, 1);
      const cap = num(ctx.params.cap, 0);
      return cap > 0 ? Math.min(penalty, cap) : penalty;
    },
  },

  // 评价定分(对照表):评价名次/等次 → 固定分(评上某档即得该档分,不按名次细分;"抓两头带中间")。
  // 复用面广:党委/党支部/党员定级兑现、各类等次评价。input=评价名次(label),param.options=名次→分对照表。
  grade_map: {
    type: 'grade_map',
    label: '评价定分(对照表)',
    inputType: 'label',
    crossTarget: false,
    normalizeParams(raw) {
      const arr = Array.isArray(raw.options) ? raw.options : [];
      const options: GradeOption[] = arr
        .map((o) => {
          const r = (o ?? {}) as Record<string, unknown>;
          return {
            label: typeof r.label === 'string' ? r.label.trim() : '',
            score: pickNum(r, 'score'),
          };
        })
        .filter((o) => o.label.length > 0);
      if (options.length === 0) throw new BadRequestException('评价定分:至少配置一个「名次→分」');
      return { options };
    },
    compute(raw, ctx) {
      if (typeof raw !== 'string') return 0;
      const label = raw.trim();
      const options = (ctx.params.options as GradeOption[]) ?? [];
      const hit = options.find((o) => o.label === label);
      if (!hit) return 0;
      return clamp(hit.score, 0, Math.max(ctx.fullScore, hit.score));
    },
  },

};

export const SCORING_TYPES = Object.keys(SCORING_SPECS);

export function getScoringSpec(type: string): ScoringSpec | undefined {
  return SCORING_SPECS[type];
}

export function computeScore(type: string, raw: RawMetric, ctx: ScoreCtx): number {
  const spec = SCORING_SPECS[type];
  if (!spec) return 0;
  return spec.compute(raw, ctx);
}

/** 数据源产出类型 outputType 是否兼容某计分工具的 inputType */
export function isInputCompatible(inputType: ScoreInput, outputType: string): boolean {
  switch (inputType) {
    case 'bool':
      return outputType === 'bool';
    case 'rate':
      return outputType === 'rate' || outputType === 'number';
    case 'count':
      return outputType === 'count' || outputType === 'number';
    case 'number':
      return outputType === 'number' || outputType === 'rate' || outputType === 'count';
    case 'label':
      return outputType === 'label';
    case 'deductions':
      // 扣分制由责任部门录入,沿用「部门填写(number)」源 → 与加分制在同一数据源下并列可选
      return outputType === 'number';
    default:
      return false;
  }
}
