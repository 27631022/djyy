import { TypeIcon, SquareIcon, CircleIcon } from "lucide-react";
import type { DesignerElement } from "../../lib/designerTypes";
import {
  createCircleElement,
  createRectElement,
  createTextElement,
} from "../../lib/designerUtils";

interface ElementPanelProps {
  onAdd: (el: DesignerElement) => void;
}

/** Phase B 只暴露 text/rect/circle 三个;Phase D 会扩展到 8 种 */
const ELEMENT_BUTTONS = [
  { type: "text" as const, label: "文本", icon: TypeIcon, create: createTextElement },
  { type: "rect" as const, label: "矩形", icon: SquareIcon, create: createRectElement },
  { type: "circle" as const, label: "圆形", icon: CircleIcon, create: createCircleElement },
];

export function ElementPanel({ onAdd }: ElementPanelProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-bold text-[#6B7280] mb-2">添加元素</div>
      <div className="grid grid-cols-2 gap-2">
        {ELEMENT_BUTTONS.map((b) => (
          <button
            key={b.type}
            onClick={() => onAdd(b.create())}
            className="flex flex-col items-center gap-1 py-3 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-[#6B7280] hover:text-[var(--party-primary)] transition-colors"
            title={`添加${b.label}`}
          >
            <b.icon className="w-5 h-5" />
            <span className="text-[11px]">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[#9CA3AF] mt-3 leading-relaxed">
        点击添加元素 → 鼠标拖动移动 →
        <br />
        右侧面板可调属性
      </p>
      <p className="text-[10px] text-[#9CA3AF] mt-3 leading-relaxed">
        Phase D 会再加 5 类元素(线/装饰边框/图片/印章/二维码)和变量字段拖拽
      </p>
    </div>
  );
}
