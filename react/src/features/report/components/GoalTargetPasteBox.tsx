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

/**
 * 粘贴导入逐单位目标值。每行「单位名 + 一个或多个数值」,数值按 goals 列顺序对应。
 * onApply 把解析出的 { unitId: { goalKey: 值 } } 交给父组件合并进表格。
 */
export function GoalTargetPasteBox({
  goals,
  units,
  onApply,
}: {
  goals: ReportGoal[]; // perUnit 金额目标(列顺序)
  units: { id: string; name: string }[];
  onApply: (patch: Record<string, Record<string, number>>) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(null);

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
      goals.forEach((g, i) => {
        const v = parsed.values[i];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) vals[g.key] = v;
      });
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
      <p className="mb-2 text-xs text-gray-400">
        每行一个单位:「单位名 + 目标值」(Tab/逗号/空格分隔)。多个目标按列对应:
        <b className="text-gray-500">{goals.map((g) => g.label).join(" / ")}</b>。支持「万」(如 100万)。
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
