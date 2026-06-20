import { TypeIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps, FieldFillProps } from "./types";
import { DESIGNER_CTL, FORM_BOX, FILL_INPUT } from "./shared";

/** 单行文本 */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form") return <div className={FORM_BOX}>{f.placeholder || "请输入"}</div>;
  return <input disabled placeholder={f.placeholder || "请输入"} className={DESIGNER_CTL} />;
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  return (
    <input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={f.placeholder || "请输入"}
      className={FILL_INPUT}
    />
  );
}

export const textField: FieldTypeDef = {
  type: "text",
  label: "单行文本",
  icon: TypeIcon,
  order: 1,
  hasPlaceholder: true,
  Preview,
  FillInput,
};
