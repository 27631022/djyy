import {
  TypeIcon,
  SquareIcon,
  CircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  LayersIcon,
} from "lucide-react";
import type { DesignerElement, ElementType } from "../../lib/designerTypes";
import { getElementColor } from "../../lib/designerUtils";

interface LayerPanelProps {
  elements: DesignerElement[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<DesignerElement>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}

const TYPE_ICONS: Record<ElementType, React.ElementType> = {
  text: TypeIcon,
  rect: SquareIcon,
  circle: CircleIcon,
  // Phase 3 加 5 个
  line: SquareIcon,
  "decor-border": SquareIcon,
  image: SquareIcon,
  stamp: SquareIcon,
  qrcode: SquareIcon,
};

export function LayerPanel({
  elements,
  selectedIds,
  onSelectionChange,
  onUpdate,
  onDelete,
  onReorder,
}: LayerPanelProps) {
  // PS 习惯:画布顶层(数组末尾)在 UI 顶部
  const reversed = [...elements].reverse();

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[#F0F0F0] flex items-center gap-2 flex-shrink-0">
        <LayersIcon className="w-3.5 h-3.5 text-[#6B7280]" />
        <span className="text-xs font-bold text-[#1A1A1A]">图层</span>
        <span className="text-[10px] text-[#9CA3AF]">({elements.length})</span>
      </div>
      <ul className="flex-1 overflow-auto">
        {reversed.length === 0 ? (
          <li className="px-3 py-6 text-center text-[11px] text-[#9CA3AF]">
            还没有元素 ·{" "}
            <br />
            从上方"元素 / 变量"添加
          </li>
        ) : (
          reversed.map((el, idx) => {
            const isSelected = selectedIds.includes(el.id);
            const color = getElementColor(el);
            const Icon = TYPE_ICONS[el.type] ?? SquareIcon;
            // idx 是 reversed 的索引;0 = 最顶层
            const isTop = idx === 0;
            const isBottom = idx === reversed.length - 1;

            return (
              <li
                key={el.id}
                className={`group relative flex items-stretch border-b border-[#F7F8FA] cursor-pointer ${
                  isSelected ? "bg-[#FFF7F8]" : "hover:bg-[#F7F8FA]"
                }`}
                onClick={() => onSelectionChange([el.id])}
              >
                {/* 色条 — 跟元素颜色一致 */}
                <div
                  className="w-1 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />

                {/* 图标 + 名 */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5">
                  <Icon
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: el.visible ? "#6B7280" : "#D1D5DB" }}
                  />
                  <span
                    className={`text-xs truncate ${
                      isSelected
                        ? "text-[var(--party-primary)] font-medium"
                        : el.visible
                          ? "text-[#1A1A1A]"
                          : "text-[#9CA3AF]"
                    }`}
                    title={el.name}
                  >
                    {el.name}
                  </span>
                </div>

                {/* 操作按钮(默认显示部分,hover 显示全部) */}
                <div className="flex items-center pr-1 gap-0">
                  <IconBtn
                    title={el.visible ? "隐藏" : "显示"}
                    onClick={() => onUpdate(el.id, { visible: !el.visible })}
                    visibleAlways
                  >
                    {el.visible ? (
                      <EyeIcon className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOffIcon className="w-3.5 h-3.5 text-[#D1D5DB]" />
                    )}
                  </IconBtn>
                  <IconBtn
                    title={el.locked ? "解锁" : "锁定"}
                    onClick={() => onUpdate(el.id, { locked: !el.locked })}
                  >
                    {el.locked ? (
                      <LockIcon className="w-3.5 h-3.5 text-[#F5A623]" />
                    ) : (
                      <UnlockIcon className="w-3.5 h-3.5" />
                    )}
                  </IconBtn>
                  <IconBtn
                    title="上移一层"
                    onClick={() => onReorder(el.id, "up")}
                    disabled={isTop}
                  >
                    <ChevronUpIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn
                    title="下移一层"
                    onClick={() => onReorder(el.id, "down")}
                    disabled={isBottom}
                  >
                    <ChevronDownIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn
                    title="删除"
                    onClick={() => onDelete(el.id)}
                    danger
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
  visibleAlways,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  /** 默认 hover 才出现;visibleAlways 始终显示 */
  visibleAlways?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      title={title}
      disabled={disabled}
      className={`p-1 rounded transition-opacity ${
        visibleAlways ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      } ${
        disabled
          ? "text-[#D1D5DB] cursor-not-allowed"
          : danger
            ? "text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#FEE2E2]"
            : "text-[#6B7280] hover:bg-[#F0F0F0]"
      }`}
    >
      {children}
    </button>
  );
}
