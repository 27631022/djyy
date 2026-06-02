import { TypeIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps } from "./types";
import { DESIGNER_CTL, FORM_BOX } from "./shared";

/** 单行文本 */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form") return <div className={FORM_BOX}>{f.placeholder || "请输入"}</div>;
  return <input disabled placeholder={f.placeholder || "请输入"} className={DESIGNER_CTL} />;
}

export const textField: FieldTypeDef = {
  type: "text",
  label: "单行文本",
  icon: TypeIcon,
  order: 1,
  hasPlaceholder: true,
  Preview,
};
