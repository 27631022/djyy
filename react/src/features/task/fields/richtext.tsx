import { FileTextIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps } from "./types";
import { FORM_BOX } from "./shared";

/** 富文本(P4 接内置编辑器,这里只示意) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form")
    return <div className={`${FORM_BOX} h-12`}>{f.placeholder || "富文本编辑器…"}</div>;
  return (
    <div className="border border-[#E5E7EB] rounded-md overflow-hidden bg-white">
      <div className="flex gap-1.5 px-2 py-1 border-b border-[#F0F0F0] text-[#C0C6D0] text-xs">
        <b>B</b>
        <i>I</i>
        <span>•</span>
        <span>≡</span>
      </div>
      <div className="px-2.5 py-2 h-12 text-[13px] text-[#9CA3AF]">{f.placeholder || "富文本内容…"}</div>
    </div>
  );
}

export const richtextField: FieldTypeDef = {
  type: "richtext",
  label: "富文本",
  icon: FileTextIcon,
  order: 8,
  hasPlaceholder: true,
  Preview,
};
