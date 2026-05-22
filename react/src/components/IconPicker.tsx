import { useMemo, useState, useEffect } from "react";
import * as lucide from "lucide-react";
import { SearchIcon, HelpCircleIcon, XIcon } from "lucide-react";
import { ICON_ZH } from "./icon-zh";
import {
  CATEGORIES,
  type CategoryId,
  groupByCategory,
} from "./icon-categories";

/**
 * 全 lucide-react 图标搜索 + 实时预览选择器(分类版)。
 *
 * 用法:
 *   <IconPicker value={iconName} onChange={(name) => setIconName(name)} />
 *
 * value 是 lucide 图标的 PascalCase 名称(如 "BookOpenIcon")。
 *
 * 交互:
 *   - 触发器点开弹出**居中对话框**(z-60,盖在父 Dialog 之上)
 *   - 左侧 22 个中文分类(常用 + 20 大类 + 其他)
 *   - 右上搜索框 —— 输文字时切换为"搜索模式",忽略分类筛选
 *   - 滚到底自动加载下一批 200 个
 *   - hover tooltip 显示"中文名(英文 ID)",便于记录到 DB
 */

// lucide-react 里以 Icon 结尾但 **不是** 单个图标的导出,直接渲染会崩:
//   - Icon:动态图标基组件,需要 iconNode prop
//   - LucideIcon:Icon 的别名(部分版本作为运行时值导出)
const NOT_AN_ICON = new Set(["Icon", "LucideIcon"]);

const ALL_ICON_NAMES: string[] = Object.keys(lucide).filter(
  (k) => /^[A-Z]/.test(k) && k.endsWith("Icon") && !NOT_AN_ICON.has(k),
);

const PAGE_SIZE = 200;

// 预先分组,组件每次打开复用结果,避免重复计算
const GROUPED = groupByCategory(ALL_ICON_NAMES);

/** 取一个图标的中文显示名(空格分隔关键词的第一个) */
function zhDisplay(name: string): string {
  const zh = ICON_ZH[name];
  if (!zh) return "";
  return zh.split(/\s+/)[0] || "";
}

/** 渲染指定名称的 lucide 图标。不存在 / 非真图标时回退 HelpCircleIcon */
export function LucideIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Comp = NOT_AN_ICON.has(name)
    ? undefined
    : (lucide as unknown as Record<string, React.ElementType | undefined>)[name];
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

  return (
    <>
      {/* 触发器 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 border border-[#E9E9E9] rounded-md px-3 py-2 text-sm hover:border-[var(--party-primary)] focus:outline-none transition-colors bg-white"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}
        >
          <LucideIcon name={value} className="w-4 h-4" style={{ color }} />
        </div>
        <span className="flex-1 text-left truncate text-xs text-[#4B5563]">
          {value ? (
            zhDisplay(value) ? (
              <>
                <span className="text-[#1F2937]">{zhDisplay(value)}</span>
                <span className="text-[#9CA3AF] ml-1.5 font-mono text-[10px]">{value}</span>
              </>
            ) : (
              <span className="font-mono">{value}</span>
            )
          ) : (
            "选择图标"
          )}
        </span>
        <span className="text-[#9CA3AF] text-xs">▾</span>
      </button>

      {/* 弹出对话框 */}
      {open && (
        <PickerDialog
          value={value}
          onChange={(n) => {
            onChange(n);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          color={color}
        />
      )}
    </>
  );
}

/* ────────── 对话框 ────────── */

interface DialogProps {
  value: string;
  onChange: (name: string) => void;
  onClose: () => void;
  color: string;
}

function PickerDialog({ value, onChange, onClose, color }: DialogProps) {
  const [query, setQuery] = useState("");
  const [catId, setCatId] = useState<CategoryId>(value ? guessCategory(value) : "fav");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // 搜索框改了就重置已展示数(渲染时同步,不用 useEffect)
  const [prevQuery, setPrevQuery] = useState(query);
  const [prevCatId, setPrevCatId] = useState(catId);
  if (query !== prevQuery || catId !== prevCatId) {
    setPrevQuery(query);
    setPrevCatId(catId);
    setDisplayCount(PAGE_SIZE);
  }

  // 当前展示的图标全集(基于搜索 OR 分类)
  const sourceList = useMemo(() => {
    const q = query.trim();
    if (q) {
      // 搜索模式:跨分类匹配中英文
      const qLower = q.toLowerCase();
      return ALL_ICON_NAMES.filter((n) => {
        if (n.toLowerCase().includes(qLower)) return true;
        const zh = ICON_ZH[n];
        return !!zh && zh.includes(q);
      });
    }
    // 分类模式
    return GROUPED.get(catId) ?? [];
  }, [query, catId]);

  const filtered = sourceList.slice(0, displayCount);
  const hasMore = filtered.length < sourceList.length;
  const isSearching = query.trim().length > 0;

  // 滚到底自动加载
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setDisplayCount((c) => Math.min(c + PAGE_SIZE, sourceList.length));
    }
  };

  // Esc 关闭
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-[820px] h-[560px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0F0]">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">选择图标</h3>
            <span className="text-[11px] text-[#9CA3AF]">
              共 {ALL_ICON_NAMES.length} 个
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
            type="button"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧分类栏 */}
          <div className="w-[148px] border-r border-[#F0F0F0] overflow-y-auto bg-[#FAFBFC]">
            {CATEGORIES.map((cat) => {
              const count = GROUPED.get(cat.id)?.length ?? 0;
              const active = !isSearching && cat.id === catId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCatId(cat.id);
                    setQuery("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-l-2 ${
                    active
                      ? "bg-white text-[var(--party-primary)] font-medium"
                      : "border-l-transparent text-[#4B5563] hover:bg-white"
                  }`}
                  style={
                    active
                      ? { borderLeftColor: "var(--party-primary)" }
                      : undefined
                  }
                >
                  <LucideIcon
                    name={cat.icon}
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{
                      color: active ? "var(--party-primary)" : "#6B7280",
                    }}
                  />
                  <span className="flex-1 truncate">{cat.label}</span>
                  <span className="text-[10px] text-[#9CA3AF] tabular-nums">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 搜索框 */}
            <div className="px-3 py-2 border-b border-[#F0F0F0] flex items-center gap-2 bg-white">
              <SearchIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isSearching
                    ? `已跨分类搜索 "${query}"...`
                    : "输入关键词跨分类搜索 (英文 book / 中文 书 都可以)"
                }
                className="flex-1 text-sm focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-0.5 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]"
                  title="清空搜索"
                  type="button"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
              <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">
                {filtered.length} / {sourceList.length}
              </span>
            </div>

            {/* 图标网格 */}
            <div
              className="flex-1 grid grid-cols-10 gap-1 p-3 overflow-y-auto content-start"
              onScroll={onScroll}
            >
              {filtered.length === 0 && (
                <div className="col-span-10 text-center text-xs text-[#9CA3AF] py-12">
                  {isSearching
                    ? `未找到 "${query}",换个关键词试试`
                    : "该分类暂无图标"}
                </div>
              )}
              {filtered.map((name) => {
                const active = name === value;
                const zh = zhDisplay(name);
                const tooltip = zh ? `${zh}(${name})` : name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange(name)}
                    title={tooltip}
                    className="aspect-square rounded-md flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: active
                        ? `color-mix(in srgb, ${color} 18%, white)`
                        : "transparent",
                      border: active
                        ? `1px solid ${color}`
                        : "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "#F7F8FA";
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "transparent";
                    }}
                  >
                    <LucideIcon
                      name={name}
                      className="w-4 h-4"
                      style={{ color: active ? color : "#4B5563" }}
                    />
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={() =>
                    setDisplayCount((c) =>
                      Math.min(c + PAGE_SIZE, sourceList.length),
                    )
                  }
                  className="col-span-10 text-xs text-[var(--party-primary)] hover:underline py-2"
                >
                  加载更多({sourceList.length - filtered.length} 个剩余)
                </button>
              )}
            </div>

            {/* 底部:当前选中预览 */}
            <div className="border-t border-[#F0F0F0] px-3 py-2 flex items-center gap-2 bg-[#FAFBFC]">
              {value ? (
                <>
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
                    }}
                  >
                    <LucideIcon
                      name={value}
                      className="w-4 h-4"
                      style={{ color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="text-[#1F2937]">{zhDisplay(value) || "(无中文名)"}</div>
                    <div className="text-[10px] text-[#9CA3AF] font-mono truncate">
                      {value}
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-xs text-[#9CA3AF]">尚未选择</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────── 工具:猜测当前 value 属于哪个分类(用作打开时默认 tab) ────────── */

function guessCategory(name: string): CategoryId {
  for (const [catId, list] of GROUPED.entries()) {
    if (list.includes(name)) return catId;
  }
  return "fav";
}
