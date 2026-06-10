import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { VenueElement } from "../../lib/venueTypes";
import { getElementColor } from "../../lib/venueUtils";

/**
 * 图层面板。列表按 z 顺序倒序展示(顶层在上)。
 * 提供:选中、显隐、锁定、上移/下移层级、删除。
 */
export function LayerPanel({
  elements,
  selectedIds,
  onSelectionChange,
  onUpdate,
  onDelete,
  onReorder,
}: {
  elements: VenueElement[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<VenueElement>) => void;
  onDelete: (id: string) => void;
  onReorder: (next: VenueElement[]) => void;
}) {
  // 倒序展示:数组末尾 = 顶层 → 列表第一行
  const ordered = elements.map((el, i) => ({ el, i })).reverse();

  function move(realIndex: number, dir: 1 | -1) {
    const j = realIndex + dir;
    if (j < 0 || j >= elements.length) return;
    const next = [...elements];
    [next[realIndex], next[j]] = [next[j], next[realIndex]];
    onReorder(next);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide border-b border-[#F0F0F0] flex-shrink-0">
        图层 ({elements.length})
      </div>
      <div className="flex-1 overflow-auto">
        {ordered.length === 0 && (
          <div className="px-3 py-4 text-xs text-[#9CA3AF]">还没有元素</div>
        )}
        {ordered.map(({ el, i }) => {
          const active = selectedIds.includes(el.id);
          return (
            <div
              key={el.id}
              onClick={() => onSelectionChange([el.id])}
              className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border-b border-[#F7F8FA] ${
                active ? "bg-party-soft" : "hover:bg-[#F7F8FA]"
              }`}
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0 border border-black/10"
                style={{ backgroundColor: getElementColor(el) }}
              />
              <span className={`flex-1 truncate text-xs ${active ? "text-[var(--party-primary)] font-medium" : "text-[#4B5563]"}`}>
                {el.name}
              </span>
              {/* 层级上下移 */}
              <button
                onClick={(e) => { e.stopPropagation(); move(i, 1); }}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)] opacity-0 group-hover:opacity-100"
                title="上移一层"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); move(i, -1); }}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)] opacity-0 group-hover:opacity-100"
                title="下移一层"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(el.id, { visible: !el.visible }); }}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)]"
                title={el.visible ? "隐藏" : "显示"}
              >
                {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(el.id, { locked: !el.locked }); }}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[var(--party-primary)]"
                title={el.locked ? "解锁" : "锁定"}
              >
                {el.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(el.id); }}
                className="p-0.5 rounded text-[#9CA3AF] hover:text-[#EF4444] opacity-0 group-hover:opacity-100"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
