import { useRef, useState } from "react";
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
  GripVerticalIcon,
} from "lucide-react";
import type { DesignerElement, ElementType } from "../../lib/designerTypes";
import { getElementColor } from "../../lib/designerUtils";

interface LayerPanelProps {
  elements: DesignerElement[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onUpdate: (id: string, patch: Partial<DesignerElement>) => void;
  onDelete: (id: string) => void;
  /** 整列替换 — 拖拽 / chevron 上下移动 都通过这个回调更新 */
  onElementsChange: (next: DesignerElement[]) => void;
}

const TYPE_ICONS: Record<ElementType, React.ElementType> = {
  text: TypeIcon,
  rect: SquareIcon,
  circle: CircleIcon,
  line: SquareIcon,
  "decor-border": SquareIcon,
  image: SquareIcon,
  stamp: SquareIcon,
  qrcode: SquareIcon,
};

/* ─── 辅助:在 UI(reversed)坐标系里挪元素,返回新原始数组 ─── */
function moveInReversedOrder(
  elements: DesignerElement[],
  fromUiIdx: number,
  insertAtUi: number,
): DesignerElement[] {
  if (insertAtUi === fromUiIdx || insertAtUi === fromUiIdx + 1) return elements;
  const reversed = [...elements].reverse();
  const [moved] = reversed.splice(fromUiIdx, 1);
  // 抽掉后,若插入点在原来位置右侧,索引要 -1
  const adjusted = insertAtUi > fromUiIdx ? insertAtUi - 1 : insertAtUi;
  reversed.splice(adjusted, 0, moved);
  return [...reversed].reverse();
}

export function LayerPanel({
  elements,
  selectedIds,
  onSelectionChange,
  onUpdate,
  onDelete,
  onElementsChange,
}: LayerPanelProps) {
  // PS 习惯:画布顶层(数组末尾)在 UI 顶部
  const reversed = [...elements].reverse();

  /* ─── 拖拽状态 ─── */
  const fromUiIdxRef = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"above" | "below" | null>(null);

  function clearDragState() {
    fromUiIdxRef.current = null;
    setDragOverId(null);
    setDragPosition(null);
  }

  function handleDragStart(
    e: React.DragEvent<HTMLLIElement>,
    uiIdx: number,
  ) {
    fromUiIdxRef.current = uiIdx;
    e.dataTransfer.effectAllowed = "move";
    // 给个简化的 drag image(占位文本)避免 Chrome 拖整行截图卡顿
    try {
      e.dataTransfer.setData("text/plain", String(uiIdx));
    } catch {
      /* Safari old versions */
    }
  }

  function handleDragOver(
    e: React.DragEvent<HTMLLIElement>,
    targetId: string,
  ) {
    if (fromUiIdxRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos: "above" | "below" = e.clientY < midY ? "above" : "below";
    if (dragOverId !== targetId || dragPosition !== pos) {
      setDragOverId(targetId);
      setDragPosition(pos);
    }
  }

  function handleDrop(
    e: React.DragEvent<HTMLLIElement>,
    targetUiIdx: number,
  ) {
    e.preventDefault();
    const fromUiIdx = fromUiIdxRef.current;
    const pos = dragPosition;
    clearDragState();
    if (fromUiIdx === null || pos === null) return;
    const insertAtUi = pos === "above" ? targetUiIdx : targetUiIdx + 1;
    const next = moveInReversedOrder(elements, fromUiIdx, insertAtUi);
    if (next !== elements) onElementsChange(next);
  }

  /* ─── chevron 兜底:上/下移动一层(reversed 视角) ─── */
  function moveLayer(uiIdx: number, direction: "up" | "down") {
    const targetUiIdx = direction === "up" ? uiIdx - 1 : uiIdx + 2; // insertAt 语义
    const next = moveInReversedOrder(elements, uiIdx, targetUiIdx);
    if (next !== elements) onElementsChange(next);
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[#F0F0F0] flex items-center gap-2 flex-shrink-0">
        <LayersIcon className="w-3.5 h-3.5 text-[#6B7280]" />
        <span className="text-xs font-bold text-[#1A1A1A]">图层</span>
        <span className="text-[10px] text-[#9CA3AF]">({elements.length})</span>
        <span className="ml-auto text-[10px] text-[#9CA3AF]">拖拽排序</span>
      </div>
      <ul
        className="flex-1 overflow-auto"
        onDragLeave={(e) => {
          // 鼠标拖出整个 ul 区域时清掉指示
          if (e.currentTarget === e.target) {
            setDragOverId(null);
            setDragPosition(null);
          }
        }}
      >
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
            const isTop = idx === 0;
            const isBottom = idx === reversed.length - 1;
            const isDragOver = dragOverId === el.id;
            const isAbove = isDragOver && dragPosition === "above";
            const isBelow = isDragOver && dragPosition === "below";

            return (
              <li
                key={el.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, el.id)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={clearDragState}
                className={`group relative flex items-stretch border-b border-[#F7F8FA] cursor-pointer select-none ${
                  isSelected ? "bg-[#FFF7F8]" : "hover:bg-[#F7F8FA]"
                }`}
                onClick={() => onSelectionChange([el.id])}
              >
                {/* 拖拽到此处的指示线 — 蓝色 2px */}
                {isAbove && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#3B82F6] z-10 pointer-events-none" />
                )}
                {isBelow && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] z-10 pointer-events-none" />
                )}

                {/* 色条 — 跟元素颜色一致 */}
                <div
                  className="w-1 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />

                {/* Grip(只是视觉,整行都可拖) */}
                <div className="flex items-center px-1 text-[#D1D5DB] group-hover:text-[#9CA3AF] cursor-grab active:cursor-grabbing">
                  <GripVerticalIcon className="w-3 h-3" />
                </div>

                {/* 图标 + 名 */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5">
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

                {/* 操作按钮 */}
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
                    onClick={() => moveLayer(idx, "up")}
                    disabled={isTop}
                  >
                    <ChevronUpIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn
                    title="下移一层"
                    onClick={() => moveLayer(idx, "down")}
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
