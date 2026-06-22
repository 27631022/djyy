import { useState } from "react";
import { ClipboardPasteIcon } from "lucide-react";
import { type ReportGoal } from "../api";

/** 全角→半角(数字/标点/空格),规避全角失效;不出现全角字形(eslint no-irregular-whitespace)。 */
function toHalfWidth(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code === 0x3000) out += " ";
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0);
    else out += ch;
  }
  return out;
}

/** 是否「纯数值 token」(可带千分位逗号 / 万 / 元 / ¥),区别于单位名。 */
const VALUE_RE = /^[\d.,]+\s*[万]?\s*[元¥]?$/;
/** 解析一个数值 token:去千分位/货币符,带「万」则 ×10000。 */
function parseValue(tok: string): number | null {
  const wan = tok.includes("万");
  const cleaned = tok.replace(/[,¥元万\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return wan ? n * 10000 : n;
}

/** 一行 → { 单位名, 数值[] }。分隔:Tab / 顿号、/ 分号 / 竖线 / 空白 / 非数字间逗号(保「1,000」)。 */
function parseLine(line: string): { name: string; values: number[] } | null {
  const s = toHalfWidth(line)
    .replace(/[\t、;|]+/g, " ")
    .replace(/(?<!\d),|,(?!\d)/g, " ") // 逗号仅当两侧都是数字(千分位)才保留,否则视为分隔符
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const tokens = s.split(" ");
  const nameParts: string[] = [];
  const values: number[] = [];
  for (const t of tokens) {
    if (VALUE_RE.test(t)) {
      const v = parseValue(t);
      if (v != null) values.push(v);
      else nameParts.push(t);
    } else {
      nameParts.push(t);
    }
  }
  return { name: nameParts.join(""), values };
}

/** 单位名匹配:精确 → 互相包含。 */
function matchUnit(units: { id: string; name: string }[], name: string): { id: string; name: string } | null {
  if (!name) return null;
  return (
    units.find((u) => u.name === name) ??
    units.find((u) => u.name.includes(name) || name.includes(u.name)) ??
    null
  );
}

const ALL = "__all__";

/**
 * 粘贴导入逐单位目标值。
 * - 默认「导入到某一个目标」:每行「单位名 + 一个数值」→ 该目标(多目标时最常用,不用在一行塞齐所有值)。
 * - 可切「全部目标(按列顺序)」:每行「单位名 + 各目标值」,数值按 goals 列顺序对应。
 * onApply 把解析出的 { unitId: { goalKey: 值 } } 交给父组件合并进表格。
 */
export function GoalTargetPasteBox({
  goals,
  units,
  onApply,
}: {
  goals: ReportGoal[]; // 需逐单位目标值的目标(达到≥/不超过≤)
  units: { id: string; name: string }[];
  onApply: (patch: Record<string, Record<string, number>>) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const [mode, setMode] = useState<string>(() => goals[0]?.key ?? ALL);
  // 渲染期派生有效选择(goals 变化时不残留失效 key)
  const sel = mode === ALL || goals.some((g) => g.key === mode) ? mode : goals[0]?.key ?? ALL;
  const single = sel !== ALL;
  const selLabel = goals.find((g) => g.key === sel)?.label ?? "";

  const apply = () => {
    const patch: Record<string, Record<string, number>> = {};
    const unmatched: string[] = [];
    let matched = 0;
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseLine(line);
      if (!parsed || (!parsed.name && parsed.values.length === 0)) continue;
      const u = matchUnit(units, parsed.name);
      if (!u) {
        if (parsed.name) unmatched.push(parsed.name);
        continue;
      }
      const vals: Record<string, number> = {};
      if (single) {
        // 单目标:取本行第一个数值 → 选中的目标
        const v = parsed.values[0];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) vals[sel] = v;
      } else {
        // 全部目标:按列顺序对应
        goals.forEach((g, i) => {
          const v = parsed.values[i];
          if (typeof v === "number" && Number.isFinite(v) && v >= 0) vals[g.key] = v;
        });
      }
      if (Object.keys(vals).length) {
        patch[u.id] = { ...(patch[u.id] ?? {}), ...vals };
        matched++;
      }
    }
    if (matched) onApply(patch);
    setResult({ matched, unmatched });
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <ClipboardPasteIcon className="h-4 w-4 text-[var(--party-primary)]" />
        粘贴导入
      </div>

      {goals.length > 1 && (
        <label className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-500">
          导入到
          <select
            value={sel}
            onChange={(e) => {
              setMode(e.target.value);
              setResult(null);
            }}
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-[var(--party-primary)] focus:outline-none"
          >
            {goals.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label || g.key}
              </option>
            ))}
            <option value={ALL}>全部目标(每行按列顺序填多个值)</option>
          </select>
        </label>
      )}

      <p className="mb-2 text-xs text-gray-400">
        {single ? (
          <>
            每行「单位名 + 目标值」(Tab/逗号/空格分隔),导入到<b className="text-gray-500">{selLabel}</b>。支持「万」(如 100万)。
          </>
        ) : (
          <>
            每行「单位名 + 各目标值」,数值按列对应:<b className="text-gray-500">{goals.map((g) => g.label).join(" / ")}</b>。支持「万」。
          </>
        )}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={`从 Excel 直接粘贴,如:\n塔运司\t100\n新疆某公司\t80\n…`}
        className="w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 font-mono text-xs focus:border-[var(--party-primary)] focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={apply}
          disabled={!text.trim()}
          className="rounded-md bg-[var(--party-primary)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          解析并填入左表
        </button>
        {result && (
          <span className="text-xs text-gray-500">
            已填 <b className="text-emerald-600">{result.matched}</b> 个单位
            {result.unmatched.length > 0 && (
              <span className="text-amber-600"> · 未匹配 {result.unmatched.length}:{result.unmatched.slice(0, 5).join("、")}{result.unmatched.length > 5 ? "…" : ""}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
