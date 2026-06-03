import { HashIcon } from "lucide-react";
import type {
  FieldTypeDef,
  FieldPreviewProps,
  FieldPropsEditorProps,
  FieldFillProps,
} from "./types";
import { DESIGNER_CTL, FORM_BOX, PROP_INPUT, FILL_INPUT } from "./shared";
import { PropRow, NumberInput } from "./widgets";

/** 数字(可设 最小/最大/单位/小数位) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form") return <div className={FORM_BOX}>{f.placeholder || "请输入"}</div>;
  return (
    <div className="flex items-center gap-1.5">
      <input
        disabled
        placeholder={f.placeholder || "请输入数字"}
        className={`${DESIGNER_CTL} max-w-[200px]`}
      />
      {f.unit && <span className="text-[13px] text-[#6B7280]">{f.unit}</span>}
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PropRow label="最小值">
        <NumberInput value={f.min} onChange={(v) => patch({ min: v })} />
      </PropRow>
      <PropRow label="最大值">
        <NumberInput value={f.max} onChange={(v) => patch({ max: v })} />
      </PropRow>
      <PropRow label="单位">
        <input
          value={f.unit ?? ""}
          onChange={(e) => patch({ unit: e.target.value })}
          placeholder="如 人"
          className={PROP_INPUT}
        />
      </PropRow>
      <PropRow label="小数位">
        <NumberInput value={f.decimals} onChange={(v) => patch({ decimals: v })} />
      </PropRow>
    </div>
  );
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value === "" || value === null || value === undefined ? "" : String(value)}
        min={f.min}
        max={f.max}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={f.placeholder || "请输入数字"}
        className={`${FILL_INPUT} max-w-[220px]`}
      />
      {f.unit && <span className="text-sm text-[#6B7280]">{f.unit}</span>}
    </div>
  );
}

export const numberField: FieldTypeDef = {
  type: "number",
  label: "数字",
  icon: HashIcon,
  order: 3,
  hasPlaceholder: true,
  ownProps: ["min", "max", "unit", "decimals"],
  Preview,
  Properties,
  FillInput,
};
