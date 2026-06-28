import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, XIcon, LockIcon } from "lucide-react";
import { CARD_META, SIZE_CLASS, SIZE_LABEL, type WbCard } from "./wbLayout";

const PARTY = "var(--party-primary)";
// 磨砂玻璃质感:半透明白 + backdrop-blur + 浅高光边 + 柔和投影
const CARD =
  "rounded-2xl border border-white/60 bg-white/55 backdrop-blur-xl shadow-[0_8px_30px_rgba(28,42,68,0.10)]";
// 统一卡片高度:所有卡等高瓦片(尺寸只决定宽度),内容超出卡内滚动 → 拖拽编排时行底整齐
const CARD_HEIGHT = "h-[272px]";

/**
 * 单卡外框(参考 app-platform-home 卡片样式)。
 * locked(管理员卡对非管理员)→ 无移除/不可拖、显示「管理员」标。编辑态才出拖拽/尺寸/移除。
 */
export function WbCardFrame({
  card,
  editing,
  locked,
  onRemove,
  onCycleSize,
  children,
}: {
  card: WbCard;
  editing: boolean;
  locked: boolean;
  onRemove: () => void;
  onCycleSize: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !editing || locked,
  });
  const meta = CARD_META[card.type];
  const Icon = meta.icon;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${SIZE_CLASS[card.size]} ${CARD_HEIGHT} ${isDragging ? "opacity-60 z-10" : ""}`}
    >
      <div
        className={`h-full ${CARD} flex flex-col ${
          editing && !locked ? "ring-1 ring-[var(--party-primary)]/20" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: PARTY }} />
          <span className="text-[14px] font-bold text-[#172033]">{meta.title}</span>
          {locked && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#9CA3AF]">
              <LockIcon className="w-3 h-3" />
              管理员
            </span>
          )}
          <div className="flex-1" />
          {editing && !locked && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onCycleSize}
                title={`尺寸:${SIZE_LABEL[card.size]}(点击切换)`}
                className="px-1.5 py-0.5 rounded text-[11px] text-[#667085] hover:bg-[#F2F3F5] border border-[#e2e8f0]"
              >
                {SIZE_LABEL[card.size]}
              </button>
              <button
                type="button"
                onClick={onRemove}
                title="移除"
                className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                {...attributes}
                {...listeners}
                title="拖动排序"
                className="p-1 rounded text-[#C0C6D0] hover:text-[#667085] cursor-grab active:cursor-grabbing touch-none"
              >
                <GripVerticalIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
