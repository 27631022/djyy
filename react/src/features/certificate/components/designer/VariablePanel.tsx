import { HashIcon } from "lucide-react";
import type { DesignerElement, VariableField } from "../../lib/designerTypes";
import { createTextElement } from "../../lib/designerUtils";

interface VariablePanelProps {
  variables: VariableField[];
  canvasWidth: number;
  canvasHeight: number;
  onAdd: (el: DesignerElement) => void;
}

/**
 * 变量字段面板 —— 点击预设变量,在画布中心创建一个绑定了 variableKey 的占位文本。
 * 发证时(Phase D 后)预览/导出会把 {{label}} 替换为实际值。
 */
export function VariablePanel({
  variables,
  canvasWidth,
  canvasHeight,
  onAdd,
}: VariablePanelProps) {
  function addVariable(v: VariableField) {
    // 放画布中心,默认尺寸 280×60(让长名字够展示)
    const width = 280;
    const height = 60;
    const el = createTextElement({
      name: `变量·${v.label}`,
      text: v.defaultValue,
      variableKey: v.key,
      x: Math.round((canvasWidth - width) / 2),
      y: Math.round((canvasHeight - height) / 2),
      width,
      height,
      fontSize: 28,
      fontWeight: "bold",
      color: "#C8001E",
      textAlign: "center",
    });
    onAdd(el);
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[#9CA3AF] mb-2 leading-relaxed">
        点击在画布中心生成占位符文本,发证时会被替换为实际值
      </p>
      <ul className="flex flex-col gap-1">
        {variables.map((v) => (
          <li key={v.key}>
            <button
              onClick={() => addVariable(v)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-left transition-colors group"
            >
              <HashIcon className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[var(--party-primary)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[#1A1A1A] truncate">
                  {v.label}
                </div>
                <div className="text-[10px] text-[#9CA3AF] truncate font-mono">
                  {v.key} · {v.sampleValue}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
