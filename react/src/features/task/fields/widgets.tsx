import { PlusIcon, XIcon } from "lucide-react";
import { PROP_INPUT, FILE_ACCEPT_PRESETS } from "./shared";

/**
 * 字段属性编辑器之间共享的 React 控件。
 * (本文件只导出组件 —— 满足 react-refresh;纯常量 / 函数在 shared.ts。)
 */

/** 属性行:标签 + 说明 + 控件 */
export function PropRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

/** 数字输入(空 → undefined) */
export function NumberInput({
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

/** 下拉「自定义选项」编辑器(增删行) */
export function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`选项 ${i + 1}`}
            className={PROP_INPUT}
          />
          <button
            type="button"
            title="删除选项"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-[#dce4ef] text-[12px] text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        添加选项
      </button>
    </div>
  );
}

/** 文件「允许类型」多选 chips */
export function AcceptChips({
  accept,
  onChange,
}: {
  accept: string;
  onChange: (a: string) => void;
}) {
  const set = new Set(
    accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  function toggle(exts: string[]) {
    const all = exts.every((e) => set.has(e));
    const next = new Set(set);
    if (all) exts.forEach((e) => next.delete(e));
    else exts.forEach((e) => next.add(e));
    onChange([...next].join(","));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILE_ACCEPT_PRESETS.map((p) => {
        const on = p.exts.every((e) => set.has(e));
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => toggle(p.exts)}
            className={`px-2 py-1 rounded-full text-[12px] border transition-colors ${
              on
                ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-bold"
                : "border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      {set.size === 0 && (
        <span className="text-[11px] text-[#9CA3AF] self-center">未选 = 任意类型</span>
      )}
    </div>
  );
}
