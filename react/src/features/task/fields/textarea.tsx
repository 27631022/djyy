import { AlignLeftIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps, FieldFillProps } from "./types";
import { DESIGNER_CTL, FORM_BOX, FILL_INPUT } from "./shared";

/** 多行文本 */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form")
    return <div className={`${FORM_BOX} h-12`}>{f.placeholder || "多行文本…"}</div>;
  return <div className={`${DESIGNER_CTL} h-14 text-[#9CA3AF]`}>{f.placeholder || "多行文本…"}</div>;
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  return (
    <textarea
      rows={3}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={f.placeholder || "请输入"}
      className={FILL_INPUT}
    />
  );
}

export const textareaField: FieldTypeDef = {
  type: "textarea",
  label: "多行文本",
  icon: AlignLeftIcon,
  order: 2,
  hasPlaceholder: true,
  Preview,
  FillInput,
};
