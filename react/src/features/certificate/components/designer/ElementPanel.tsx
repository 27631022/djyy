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

/** Phase B 暴露 text/rect/circle 三个;Step 3 会扩展到 8 种 */
const ELEMENT_BUTTONS = [
  { type: "text", label: "文本", icon: TypeIcon, create: createTextElement },
  { type: "rect", label: "矩形", icon: SquareIcon, create: createRectElement },
  { type: "circle", label: "圆形", icon: CircleIcon, create: createCircleElement },
] as const;

const COMING_SOON: { label: string; tip: string }[] = [
  { label: "线", tip: "直线/分隔线" },
  { label: "装饰边框", tip: "证书外框" },
  { label: "图片", tip: "上传插入" },
  { label: "印章", tip: "圆形印章" },
  { label: "二维码", tip: "扫码验证" },
];

export function ElementPanel({ onAdd }: ElementPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
          基础元素
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ELEMENT_BUTTONS.map((b) => (
            <button
              key={b.type}
              onClick={() => onAdd(b.create())}
              className="flex flex-col items-center gap-1 py-2.5 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-[#6B7280] hover:text-[var(--party-primary)] transition-colors"
              title={`添加${b.label}`}
            >
              <b.icon className="w-4 h-4" />
              <span className="text-[11px]">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
          即将上线 (Step 3)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {COMING_SOON.map((c) => (
            <div
              key={c.label}
              className="flex flex-col items-center gap-1 py-2.5 rounded border border-dashed border-[#E9E9E9] text-[#C8C8C8] cursor-not-allowed"
              title={c.tip}
            >
              <span className="text-[11px]">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
