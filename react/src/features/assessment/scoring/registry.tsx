import {
  ArrowDownWideNarrow,
  ListOrdered,
  MinusCircle,
  PencilLine,
  Percent,
  PlusCircle,
  Scaling,
  ToggleRight,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ScoringStrategyDef } from "./types";
import { NumberField, OrderSelect, PropRow, TiersEditor } from "./widgets";
import { num, pickNum, pickRows } from "./shared";

/**
 * 计分工具注册表(11 个)。照 task/fields 的注册表范式;compute 由后端 trial 端点权威计算。
 * 加新工具 = 这里加一个 def + ALL 数组加一项 + 后端 scoring-strategies.ts 对应加一条。
 */

const manual: ScoringStrategyDef = {
  type: "manual",
  label: "人工打分",
  icon: PencilLine,
  order: 10,
  inputType: "number",
  crossTarget: false,
  Properties: ({ params, patch }) => (
    <PropRow label="封顶分" hint="留空=满分">
      <NumberField value={pickNum(params, "max")} onChange={(v) => patch({ max: v })} placeholder="满分" />
    </PropRow>
  ),
  summary: () => "责任部门直接录 0~满分,配合评分标准",
};

const proportional: ScoringStrategyDef = {
  type: "proportional",
  label: "完成率比例",
  icon: Percent,
  order: 20,
  inputType: "rate",
  crossTarget: false,
  makeDefaults: () => ({ cap: 100 }),
  Properties: ({ params, patch }) => (
    <PropRow label="完成率上限 %" hint="超额封顶,默认 100">
      <NumberField value={pickNum(params, "cap")} onChange={(v) => patch({ cap: v })} placeholder="100" />
    </PropRow>
  ),
  summary: (p) => `满分 × 完成率,封顶 ${num(p.cap, 100)}%`,
  validate: (p) => (num(p.cap, 100) > 0 ? null : "上限须 > 0"),
};

const overachieve_tiers: ScoringStrategyDef = {
  type: "overachieve_tiers",
  label: "超额阶梯加分",
  icon: TrendingUp,
  order: 30,
  inputType: "rate",
  crossTarget: false,
  makeDefaults: () => ({ tiers: [{ over: 20, bonus: 1 }, { over: 50, bonus: 1 }] }),
  Properties: ({ params, patch }) => (
    <div className="space-y-2">
      <PropRow label="完成 100% 得分" hint="留空=满分;超额在此基础上累加">
        <NumberField value={pickNum(params, "base")} onChange={(v) => patch({ base: v })} placeholder="满分" />
      </PropRow>
      <PropRow label="超额阶梯" hint="超出百分点 → 累加加分(总分封顶=本项分值)">
        <TiersEditor
          rows={pickRows(params, "tiers")}
          columns={[
            { key: "over", label: "超出%≥", placeholder: "20" },
            { key: "bonus", label: "加分", placeholder: "1" },
          ]}
          onChange={(rows) => patch({ tiers: rows })}
        />
      </PropRow>
    </div>
  ),
  summary: (p) => `100%→${pickNum(p, "base") ?? "满分"};超额累加,封顶本项分值`,
  validate: (p) => (pickRows(p, "tiers").length > 0 ? null : "至少一档超额加分"),
};

const threshold_tiers: ScoringStrategyDef = {
  type: "threshold_tiers",
  label: "阶梯赋分",
  icon: ListOrdered,
  order: 40,
  inputType: "number",
  crossTarget: false,
  makeDefaults: () => ({ tiers: [{ min: 95 }, { min: 90 }, { min: 80 }] }),
  Properties: ({ params, patch }) => (
    <PropRow label="阶梯" hint="值 ≥ 阈值 → 给分(自动按阈值降序命中)">
      <TiersEditor
        rows={pickRows(params, "tiers")}
        columns={[
          { key: "min", label: "阈值≥", placeholder: "95" },
          { key: "score", label: "得分", placeholder: "" },
        ]}
        onChange={(rows) => patch({ tiers: rows })}
      />
    </PropRow>
  ),
  summary: () => "命中第一个 值≥阈值 的档位给分",
  validate: (p) => (pickRows(p, "tiers").length > 0 ? null : "至少配置一档"),
};

const binary: ScoringStrategyDef = {
  type: "binary",
  label: "是否完成(二值)",
  icon: ToggleRight,
  order: 50,
  inputType: "bool",
  crossTarget: false,
  Properties: ({ params, patch }) => (
    <div className="grid grid-cols-2 gap-2">
      <PropRow label="完成给分" hint="默认满分">
        <NumberField value={pickNum(params, "onTrue")} onChange={(v) => patch({ onTrue: v })} />
      </PropRow>
      <PropRow label="未完成给分" hint="默认 0">
        <NumberField value={pickNum(params, "onFalse")} onChange={(v) => patch({ onFalse: v })} />
      </PropRow>
    </div>
  ),
  summary: (p) => `完成→${pickNum(p, "onTrue") ?? "满分"},未完成→${num(p.onFalse, 0)}`,
};

const rank_tiers: ScoringStrategyDef = {
  type: "rank_tiers",
  label: "排名阶梯",
  icon: Trophy,
  order: 60,
  inputType: "number",
  crossTarget: true,
  makeDefaults: () => ({ order: "desc", tiers: [{ topN: 1 }, { topN: 3 }] }),
  Properties: ({ params, patch }) => (
    <div className="space-y-2">
      <PropRow label="排序方向">
        <OrderSelect value={typeof params.order === "string" ? params.order : undefined} onChange={(v) => patch({ order: v })} />
      </PropRow>
      <PropRow label="名次档" hint="前 N 名 或 前 % 二选一 → 给分">
        <TiersEditor
          rows={pickRows(params, "tiers")}
          columns={[
            { key: "topN", label: "前N名", placeholder: "1" },
            { key: "topPct", label: "或前%", placeholder: "" },
            { key: "score", label: "得分", placeholder: "" },
          ]}
          onChange={(rows) => patch({ tiers: rows })}
        />
      </PropRow>
    </div>
  ),
  summary: () => "按名次落档给分(需全体对象)",
  validate: (p) => (pickRows(p, "tiers").length > 0 ? null : "至少配置一档"),
};

const rank_linear: ScoringStrategyDef = {
  type: "rank_linear",
  label: "排名线性",
  icon: ArrowDownWideNarrow,
  order: 70,
  inputType: "number",
  crossTarget: true,
  makeDefaults: () => ({ order: "desc" }),
  Properties: ({ params, patch }) => (
    <PropRow label="排序方向">
      <OrderSelect value={typeof params.order === "string" ? params.order : undefined} onChange={(v) => patch({ order: v })} />
    </PropRow>
  ),
  summary: () => "满分 ×(对象数 - 名次 + 1)/ 对象数",
};

const minmax: ScoringStrategyDef = {
  type: "minmax",
  label: "极差标准化",
  icon: Scaling,
  order: 80,
  inputType: "number",
  crossTarget: true,
  makeDefaults: () => ({ order: "desc", floor: 0 }),
  Properties: ({ params, patch }) => (
    <div className="space-y-2">
      <PropRow label="排序方向">
        <OrderSelect value={typeof params.order === "string" ? params.order : undefined} onChange={(v) => patch({ order: v })} />
      </PropRow>
      <PropRow label="保底分" hint="最低分,默认 0">
        <NumberField value={pickNum(params, "floor")} onChange={(v) => patch({ floor: v })} />
      </PropRow>
    </div>
  ),
  summary: () => "(本值-最低)/(最高-最低) × 满分",
};

const bonus: ScoringStrategyDef = {
  type: "bonus",
  label: "加分",
  icon: PlusCircle,
  order: 90,
  inputType: "count",
  crossTarget: false,
  makeDefaults: () => ({ perUnit: 1, cap: 5 }),
  Properties: ({ params, patch }) => (
    <div className="grid grid-cols-2 gap-2">
      <PropRow label="每项加分">
        <NumberField value={pickNum(params, "perUnit")} onChange={(v) => patch({ perUnit: v })} />
      </PropRow>
      <PropRow label="加分封顶" hint="0=不封顶">
        <NumberField value={pickNum(params, "cap")} onChange={(v) => patch({ cap: v })} />
      </PropRow>
    </div>
  ),
  summary: (p) => `每项 +${num(p.perUnit, 1)},封顶 ${num(p.cap, 0) || "不限"}`,
};

const deduction: ScoringStrategyDef = {
  type: "deduction",
  label: "扣分",
  icon: MinusCircle,
  order: 100,
  inputType: "count",
  crossTarget: false,
  makeDefaults: () => ({ perUnit: 1, cap: 10 }),
  Properties: ({ params, patch }) => (
    <div className="grid grid-cols-2 gap-2">
      <PropRow label="每项扣分">
        <NumberField value={pickNum(params, "perUnit")} onChange={(v) => patch({ perUnit: v })} />
      </PropRow>
      <PropRow label="扣分封顶" hint="0=不封顶">
        <NumberField value={pickNum(params, "cap")} onChange={(v) => patch({ cap: v })} />
      </PropRow>
    </div>
  ),
  summary: (p) => `每项 -${num(p.perUnit, 1)},封顶 ${num(p.cap, 0) || "不限"}`,
};

const ALL: ScoringStrategyDef[] = [
  manual,
  proportional,
  overachieve_tiers,
  threshold_tiers,
  binary,
  rank_tiers,
  rank_linear,
  minmax,
  bonus,
  deduction,
];

export const SCORING_STRATEGIES: Record<string, ScoringStrategyDef> = Object.fromEntries(
  ALL.map((d) => [d.type, d]),
);
export const SCORING_STRATEGY_LIST: ScoringStrategyDef[] = [...ALL].sort((a, b) => a.order - b.order);

export function getStrategy(type?: string): ScoringStrategyDef | undefined {
  return type ? SCORING_STRATEGIES[type] : undefined;
}
export function strategyLabel(type?: string): string {
  return getStrategy(type)?.label ?? type ?? "";
}

/** 数据源 outputType 是否兼容某计分工具 inputType(与后端 isInputCompatible 一致) */
export function isInputCompatible(inputType: string, outputType: string): boolean {
  switch (inputType) {
    case "bool":
      return outputType === "bool";
    case "rate":
      return outputType === "rate" || outputType === "number";
    case "count":
      return outputType === "count" || outputType === "number";
    case "number":
      return outputType === "number" || outputType === "rate" || outputType === "count";
    default:
      return false;
  }
}
