import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { fmtNumber } from "./shared";
import type { ToolDef, ToolEditorProps } from "./types";
import { NumInput, PropRow, TextInput } from "./widgets";

/** 指标卡:大数字 + 单位 + 同比/环比箭头 —— 晒里程、晒业绩单项数字最直接 */
export interface MetricContent extends Record<string, unknown> {
  label?: string;
  value?: number;
  unit?: string;
  decimals?: number;
  compare?: { type: "yoy" | "mom"; pct: number };
  note?: string;
}

function MetricEditor({ value, onChange }: ToolEditorProps<MetricContent>) {
  const cmp = value.compare;
  return (
    <div className="space-y-2.5">
      <PropRow label="指标名称">
        <TextInput
          className="flex-1"
          value={value.label}
          maxLength={30}
          placeholder="如「安全行驶里程」「营业收入」"
          onChange={(v) => onChange({ ...value, label: v })}
        />
      </PropRow>
      <PropRow label="数值">
        <NumInput
          className="w-36"
          value={value.value}
          placeholder="0"
          onChange={(v) => onChange({ ...value, value: v })}
        />
        <TextInput
          className="w-24"
          value={value.unit}
          maxLength={12}
          placeholder="单位"
          onChange={(v) => onChange({ ...value, unit: v })}
        />
        <span className="text-xs text-muted-foreground">小数位</span>
        <NumInput
          className="w-16"
          value={value.decimals}
          placeholder="0"
          onChange={(v) => onChange({ ...value, decimals: v })}
        />
      </PropRow>
      <PropRow label="同比/环比">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={cmp?.type ?? ""}
          onChange={(e) => {
            const t = e.target.value as "yoy" | "mom" | "";
            onChange({ ...value, compare: t ? { type: t, pct: cmp?.pct ?? 0 } : undefined });
          }}
        >
          <option value="">不显示</option>
          <option value="yoy">同比</option>
          <option value="mom">环比</option>
        </select>
        {cmp && (
          <>
            <NumInput
              className="w-24"
              value={cmp.pct}
              placeholder="0"
              onChange={(v) => onChange({ ...value, compare: { ...cmp, pct: v ?? 0 } })}
            />
            <span className="text-xs text-muted-foreground">%(正=增长,负=下降)</span>
          </>
        )}
      </PropRow>
      <PropRow label="说明">
        <TextInput
          className="flex-1"
          value={value.note}
          maxLength={300}
          placeholder="补充说明(选填),如「连续 8 年无事故」"
          onChange={(v) => onChange({ ...value, note: v })}
        />
      </PropRow>
    </div>
  );
}

function MetricDisplay({ value }: { value: MetricContent }) {
  if (value.value === undefined || value.value === null) return null;
  const cmp = value.compare;
  const up = cmp ? cmp.pct >= 0 : false;
  return (
    <div className="rounded-xl border bg-gradient-to-br from-white to-red-50/40 px-6 py-5">
      <div className="text-sm text-muted-foreground">{value.label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-bold tracking-tight text-[var(--party-primary)]">
          {fmtNumber(value.value, value.decimals ?? 0)}
        </span>
        {value.unit && <span className="text-base text-muted-foreground">{value.unit}</span>}
        {cmp && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium ${
              up ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {cmp.type === "yoy" ? "同比" : "环比"}
            {up ? "+" : ""}
            {cmp.pct}%
          </span>
        )}
      </div>
      {value.note && <div className="mt-2 text-sm text-muted-foreground">{value.note}</div>}
    </div>
  );
}

export const metricTool: ToolDef<MetricContent> = {
  type: "metric",
  label: "指标卡",
  icon: Gauge,
  order: 6,
  description: "晒一个关键数字:大数字 + 单位 + 同比/环比涨跌",
  makeDefault: () => ({ decimals: 0 }),
  Editor: MetricEditor,
  Display: MetricDisplay,
  validate: (v) => {
    if (!v.label?.trim()) return "指标卡缺指标名称";
    if (v.value === undefined || v.value === null || !Number.isFinite(v.value)) return "指标卡缺数值";
    return null;
  },
};
