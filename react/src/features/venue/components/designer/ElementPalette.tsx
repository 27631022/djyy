import type { ElementType } from "react";
import {
  Armchair,
  RectangleHorizontal,
  Circle,
  Presentation,
  Mic,
  Flag,
  Square,
  Minus,
  DoorOpen,
  Type,
} from "lucide-react";
import type { VenueElementType } from "../../lib/venueTypes";

interface PaletteItem {
  type: VenueElementType;
  label: string;
  Icon: ElementType;
}

/** 元素面板项 —— 点选即在画布中央添加该类型元素 */
const ITEMS: PaletteItem[] = [
  { type: "seat", label: "座位", Icon: Armchair },
  { type: "table-rect", label: "会议桌", Icon: RectangleHorizontal },
  { type: "table-round", label: "圆桌", Icon: Circle },
  { type: "presidium", label: "主席台", Icon: Presentation },
  { type: "podium", label: "发言席", Icon: Mic },
  { type: "banner", label: "横幅", Icon: Flag },
  { type: "wall", label: "背景墙", Icon: Square },
  { type: "aisle", label: "通道", Icon: Minus },
  { type: "door", label: "门", Icon: DoorOpen },
  { type: "text", label: "文字", Icon: Type },
  // 「区域」不在座次图编辑阶段添加 —— 分区在排座向导第5步「分区与占座」里画
];

export function ElementPalette({ onAdd }: { onAdd: (type: VenueElementType) => void }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
        点选添加元素
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map((it) => (
          <button
            key={it.type}
            onClick={() => onAdd(it.type)}
            className="flex flex-col items-center gap-1.5 py-3 rounded-lg border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-party-soft transition-colors text-[#4B5563] hover:text-[var(--party-primary)]"
            title={`添加${it.label}`}
          >
            <it.Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{it.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-[#9CA3AF] leading-relaxed">
        拖动元素移动(自动吸附网格,按住 Alt 临时关闭吸附)。选中后右侧改属性,角点缩放、顶部圆点旋转。
      </p>
    </div>
  );
}
