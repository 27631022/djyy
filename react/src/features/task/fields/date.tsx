import { CalendarIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps, FieldFillProps } from "./types";
import { DESIGNER_CTL, FORM_BOX, FILL_INPUT } from "./shared";

/** 日期 */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form") return <div className={FORM_BOX}>{f.placeholder || "YYYY-MM-DD"}</div>;
  return <input disabled placeholder="yyyy / mm / dd" className={`${DESIGNER_CTL} max-w-[200px]`} />;
}

function FillInput({ value, onChange }: FieldFillProps) {
  return (
    <input
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className={`${FILL_INPUT} max-w-[220px]`}
    />
  );
}

export const dateField: FieldTypeDef = {
  type: "date",
  label: "日期",
  icon: CalendarIcon,
  order: 4,
  hasPlaceholder: true,
  Preview,
  FillInput,
};
