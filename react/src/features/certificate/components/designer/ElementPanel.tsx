import {
  TypeIcon,
  SquareIcon,
  CircleIcon,
  MinusIcon,
  ImageIcon,
  QrCodeIcon,
  StampIcon,
  FrameIcon,
} from "lucide-react";
import type { DesignerElement } from "../../lib/designerTypes";
import {
  createCircleElement,
  createDecorBorderElement,
  createImageElement,
  createLineElement,
  createQRCodeElement,
  createRectElement,
  createStampElement,
  createTextElement,
} from "../../lib/designerUtils";

interface ElementPanelProps {
  onAdd: (el: DesignerElement) => void;
}

const ELEMENTS = [
  { label: "文本", icon: TypeIcon, create: createTextElement },
  { label: "矩形", icon: SquareIcon, create: createRectElement },
  { label: "圆形", icon: CircleIcon, create: createCircleElement },
  { label: "线", icon: MinusIcon, create: createLineElement },
  { label: "装饰边框", icon: FrameIcon, create: createDecorBorderElement },
  { label: "图片", icon: ImageIcon, create: createImageElement },
  { label: "印章", icon: StampIcon, create: createStampElement },
  { label: "二维码", icon: QrCodeIcon, create: createQRCodeElement },
] as const;

export function ElementPanel({ onAdd }: ElementPanelProps) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
        添加元素
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ELEMENTS.map((b) => (
          <button
            key={b.label}
            onClick={() => onAdd(b.create())}
            className="flex flex-col items-center gap-1 py-2.5 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-[#6B7280] hover:text-[var(--party-primary)] transition-colors"
            title={`添加${b.label}`}
          >
            <b.icon className="w-4 h-4" />
            <span className="text-[11px]">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[#9CA3AF] mt-3 leading-relaxed">
        点击按钮添加到画布中央 → 拖动调整位置 → 拖角 / 边 缩放 → 顶部圆点旋转
      </p>
    </div>
  );
}
