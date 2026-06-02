import { CalendarIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps } from "./types";
import { DESIGNER_CTL, FORM_BOX } from "./shared";

/** 日期 */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form") return <div className={FORM_BOX}>{f.placeholder || "YYYY-MM-DD"}</div>;
  return <input disabled placeholder="yyyy / mm / dd" className={`${DESIGNER_CTL} max-w-[200px]`} />;
}

export const dateField: FieldTypeDef = {
  type: "date",
  label: "日期",
  icon: CalendarIcon,
  order: 4,
  hasPlaceholder: true,
  Preview,
};
