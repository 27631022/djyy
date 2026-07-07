import { ChartLine, Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber } from "./shared";
import type { ToolDef, ToolEditorProps } from "./types";
import { NumInput, PropRow, TextInput } from "./widgets";

/** 趋势图:按期折线/柱状(recharts 已装,零新增依赖)—— 体现「进位」走势 */
interface TrendPoint {
  label?: string;
  value?: number;
}

export interface TrendContent extends Record<string, unknown> {
  title?: string;
  chart?: "line" | "bar";
  unit?: string;
  decimals?: number;
  points?: TrendPoint[];
}

function TrendEditor({ value, onChange }: ToolEditorProps<TrendContent>) {
  const points = value.points ?? [];
  const setPoint = (i: number, patch: Partial<TrendPoint>) =>
    onChange({ ...value, points: points.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-2.5">
      <PropRow label="标题">
        <TextInput
          className="flex-1"
          value={value.title}
          maxLength={50}
          placeholder="如「月度安全里程走势」(选填)"
          onChange={(v) => onChange({ ...value, title: v })}
        />
      </PropRow>
      <PropRow label="图形">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={value.chart ?? "line"}
          onChange={(e) => onChange({ ...value, chart: e.target.value as "line" | "bar" })}
        >
          <option value="line">折线图</option>
          <option value="bar">柱状图</option>
        </select>
        <TextInput
          className="w-24"
          value={value.unit}
          maxLength={12}
          placeholder="单位"
          onChange={(v) => onChange({ ...value, unit: v })}
        />
      </PropRow>
      <div className="space-y-1.5">
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <TextInput
              className="w-32"
              value={p.label}
              maxLength={30}
              placeholder={`期数,如「${i + 1}月」`}
              onChange={(v) => setPoint(i, { label: v })}
            />
            <NumInput
              className="w-32"
              value={p.value}
              placeholder="数值"
              onChange={(v) => setPoint(i, { value: v })}
            />
            {points.length > 2 && (
              <button
                type="button"
                className="p-1 text-muted-foreground hover:text-red-500"
                onClick={() => onChange({ ...value, points: points.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {points.length < 60 && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-[var(--party-primary)] hover:underline"
            onClick={() => onChange({ ...value, points: [...points, {}] })}
          >
            <Plus className="h-4 w-4" />
            加一期
          </button>
        )}
      </div>
    </div>
  );
}

function TrendDisplay({ value }: { value: TrendContent }) {
  const data = (value.points ?? [])
    .filter((p) => p.label && p.value !== undefined)
    .map((p) => ({ name: p.label, value: p.value }));
  if (data.length < 2) return null;
  const decimals = value.decimals ?? 0;
  const fmt = (v: number) => fmtNumber(v, decimals, value.unit);
  const common = {
    data,
    margin: { top: 8, right: 16, bottom: 0, left: 0 },
  };
  return (
    <div>
      {value.title && <div className="mb-2 text-sm font-medium">{value.title}</div>}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {value.chart === "bar" ? (
            <BarChart {...common}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v) => [fmt(Number(v)), value.title || "数值"]} />
              <Bar dataKey="value" fill="var(--party-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          ) : (
            <LineChart {...common}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v) => [fmt(Number(v)), value.title || "数值"]} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--party-primary)"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "var(--party-primary)" }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const trendTool: ToolDef<TrendContent> = {
  type: "trend",
  label: "趋势图",
  icon: ChartLine,
  order: 7,
  description: "按月/季录入数据,折线或柱状图晒走势与进位",
  makeDefault: () => ({ chart: "line", points: [{}, {}, {}] }),
  Editor: TrendEditor,
  Display: TrendDisplay,
  validate: (v) => {
    const pts = (v.points ?? []).filter((p) => p.label?.trim() && p.value !== undefined);
    if (pts.length < 2) return "趋势图至少要 2 期完整数据(期数 + 数值)";
    return null;
  },
};
