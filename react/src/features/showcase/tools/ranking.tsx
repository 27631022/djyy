import { Medal, Plus, Trash2, Trophy } from "lucide-react";
import { competitionRank, fmtNumber, MEDAL_COLORS } from "./shared";
import type { ToolDef, ToolEditorProps } from "./types";
import { NumInput, PropRow, TextInput } from "./widgets";

/**
 * 排行榜(手动录入):名称 + 数值清单,自动排序,前三金银铜(语义色不跟主题)。
 * 数据源手动录入是 P1 定案;业务数据源(考核/证书)后续接。
 */
interface RankingRow {
  name?: string;
  value?: number;
}

export interface RankingContent extends Record<string, unknown> {
  title?: string;
  unit?: string;
  decimals?: number;
  order?: "desc" | "asc";
  items?: RankingRow[];
}

function RankingEditor({ value, onChange }: ToolEditorProps<RankingContent>) {
  const items = value.items ?? [];
  const setItem = (i: number, patch: Partial<RankingRow>) =>
    onChange({ ...value, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <div className="space-y-2.5">
      <PropRow label="榜单标题">
        <TextInput
          className="flex-1"
          value={value.title}
          maxLength={50}
          placeholder="如「各车队安全里程排行」(选填)"
          onChange={(v) => onChange({ ...value, title: v })}
        />
      </PropRow>
      <PropRow label="排序">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={value.order ?? "desc"}
          onChange={(e) => onChange({ ...value, order: e.target.value as "desc" | "asc" })}
        >
          <option value="desc">数值大的靠前</option>
          <option value="asc">数值小的靠前</option>
        </select>
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
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <TextInput
              className="flex-1"
              value={it.name}
              maxLength={50}
              placeholder="名称,如「第一车队」/「张三」"
              onChange={(v) => setItem(i, { name: v })}
            />
            <NumInput
              className="w-32"
              value={it.value}
              placeholder="数值"
              onChange={(v) => setItem(i, { value: v })}
            />
            {items.length > 1 && (
              <button
                type="button"
                className="p-1 text-muted-foreground hover:text-red-500"
                onClick={() => onChange({ ...value, items: items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {items.length < 100 && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-[var(--party-primary)] hover:underline"
            onClick={() => onChange({ ...value, items: [...items, {}] })}
          >
            <Plus className="h-4 w-4" />
            加一行
          </button>
        )}
      </div>
    </div>
  );
}

function RankingDisplay({ value }: { value: RankingContent }) {
  const rows = (value.items ?? [])
    .filter((it): it is { name: string; value: number } => !!it.name?.trim() && it.value !== undefined)
    .sort((a, b) => (value.order === "asc" ? a.value - b.value : b.value - a.value));
  if (rows.length === 0) return null;
  const decimals = value.decimals ?? 0;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  // 竞争排名:同值同名次(纯函数,渲染期安全)
  const ranked = competitionRank(rows, (r) => r.value);

  return (
    <div>
      {value.title && (
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Trophy className="h-4 w-4 text-[#F5A623]" />
          {value.title}
        </div>
      )}
      <ol className="space-y-1.5">
        {ranked.map((r, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: r.rank <= 3 ? MEDAL_COLORS[r.rank - 1] : "#9ca3af" }}
            >
              {r.rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : r.rank}
            </span>
            <span className="w-32 shrink-0 truncate text-sm font-medium" title={r.name}>
              {r.name}
            </span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((Math.abs(r.value) / max) * 100, 4)}%`,
                  background:
                    r.rank <= 3
                      ? `linear-gradient(90deg, ${MEDAL_COLORS[r.rank - 1]}cc, ${MEDAL_COLORS[r.rank - 1]})`
                      : "#d1d5db",
                }}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {fmtNumber(r.value, decimals, value.unit)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const rankingTool: ToolDef<RankingContent> = {
  type: "ranking",
  label: "排行榜",
  icon: Trophy,
  order: 9,
  description: "录入名称+数值清单,自动排序,前三金银铜",
  makeDefault: () => ({ order: "desc", items: [{}, {}, {}] }),
  Editor: RankingEditor,
  Display: RankingDisplay,
  validate: (v) => {
    const rows = (v.items ?? []).filter((it) => it.name?.trim() && it.value !== undefined);
    if (rows.length === 0) return "排行榜还没有完整的数据行(名称 + 数值)";
    return null;
  },
};
