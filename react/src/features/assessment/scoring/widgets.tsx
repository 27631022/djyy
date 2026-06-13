import { type ReactNode } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { PROP_INPUT } from "./shared";

export function PropRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[12px] font-medium text-[#4B5563]">{label}</span>
        {hint && <span className="text-[10px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={PROP_INPUT}
    />
  );
}

export function OrderSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value === "asc" ? "asc" : "desc"} onChange={(e) => onChange(e.target.value)} className={PROP_INPUT}>
      <option value="desc">越大越好(降序)</option>
      <option value="asc">越小越好(升序)</option>
    </select>
  );
}

export interface TierColumn {
  key: string;
  label: string;
  placeholder?: string;
}

/** 通用「档位」编辑器:每行是一个对象,列由 columns 定义(均为数值)。复用于阶梯赋分/排名阶梯/超额加分。 */
export function TiersEditor({
  rows,
  columns,
  onChange,
  addLabel = "添加一档",
}: {
  rows: Record<string, unknown>[];
  columns: TierColumn[];
  onChange: (rows: Record<string, unknown>[]) => void;
  addLabel?: string;
}) {
  const setCell = (i: number, key: string, raw: string) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: raw === "" ? undefined : Number(raw) } : r)));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {columns.map((c) => (
          <span key={c.key} className="flex-1 text-[10px] text-[#9CA3AF]">
            {c.label}
          </span>
        ))}
        <span className="w-6 flex-shrink-0" />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {columns.map((c) => (
            <input
              key={c.key}
              type="number"
              placeholder={c.placeholder}
              value={typeof r[c.key] === "number" ? String(r[c.key]) : ""}
              onChange={(e) => setCell(i, c.key, e.target.value)}
              className={`${PROP_INPUT} flex-1`}
            />
          ))}
          <button
            type="button"
            title="删除该档"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, {}])}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-[#dce4ef] text-[12px] text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}
