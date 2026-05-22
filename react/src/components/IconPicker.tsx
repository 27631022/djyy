import { useMemo, useRef, useState, useEffect } from "react";
import * as lucide from "lucide-react";
import { SearchIcon, HelpCircleIcon, XIcon } from "lucide-react";

/**
 * 全 lucide-react 图标搜索 + 实时预览选择器。
 *
 * 用法:
 *   <IconPicker value={iconName} onChange={(name) => setIconName(name)} />
 *
 * value 是 lucide 图标的 PascalCase 名称(如 "BookOpenIcon")。
 */

// 一次性提取所有以 Icon 结尾的导出名,作为可选图标池
const ALL_ICON_NAMES: string[] = Object.keys(lucide).filter(
  (k) => /^[A-Z]/.test(k) && k.endsWith("Icon"),
);

/** 渲染指定名称的 lucide 图标。不存在时回退 HelpCircleIcon */
export function LucideIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Comp = (lucide as unknown as Record<string, React.ElementType | undefined>)[name];
  const Final = (Comp ?? HelpCircleIcon) as React.ElementType;
  return <Final className={className} style={style} />;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  /** 触发器右边的颜色,用于图标预览,默认 var(--party-primary) */
  color?: string;
}

export default function IconPicker({ value, onChange, color = "var(--party-primary)" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ICON_NAMES.slice(0, 200); // 默认显示前 200 个,避免一次性渲染上千个
    return ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 200);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      {/* 触发器:展示当前图标 + 名称 + 下拉箭头 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 border border-[#E9E9E9] rounded-md px-3 py-2 text-sm hover:border-[var(--party-primary)] focus:outline-none transition-colors bg-white"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}
        >
          <LucideIcon name={value} className="w-4 h-4" style={{ color }} />
        </div>
        <span className="flex-1 text-left truncate font-mono text-xs text-[#4B5563]">{value || "选择图标"}</span>
        <span className="text-[#9CA3AF] text-xs">▾</span>
      </button>

      {/* 弹出层 */}
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-white rounded-md shadow-xl border border-[#E9E9E9] overflow-hidden">
          <div className="p-2 border-b border-[#F0F0F0] flex items-center gap-2">
            <SearchIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索图标(如 book、user、calendar...)"
              className="flex-1 text-sm focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="p-0.5 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]"
                title="清空"
                type="button"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
            <span className="text-[10px] text-[#9CA3AF]">{filtered.length} / {ALL_ICON_NAMES.length}</span>
          </div>
          <div
            className="grid grid-cols-8 gap-1 p-2 max-h-72 overflow-y-auto"
            // 滚动容器:固定高 + 网格 8 列,实测能容纳大约 ≥200 个图标的浏览
          >
            {filtered.length === 0 && (
              <div className="col-span-8 text-center text-xs text-[#9CA3AF] py-6">
                未找到 "{query}",换个关键词试试
              </div>
            )}
            {filtered.map((name) => {
              const active = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { onChange(name); setOpen(false); }}
                  title={name}
                  className="aspect-square rounded-md flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: active ? `color-mix(in srgb, ${color} 18%, white)` : "transparent",
                    border: active ? `1px solid ${color}` : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "#F7F8FA";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                >
                  <LucideIcon name={name} className="w-4 h-4" style={{ color: active ? color : "#4B5563" }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
