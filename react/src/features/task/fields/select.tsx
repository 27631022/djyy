import { ListIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps, FieldPropsEditorProps } from "./types";
import { DESIGNER_CTL, FORM_BOX } from "./shared";
import { PropRow, OptionsEditor } from "./widgets";

/** 下拉选择(自定义选项,不关联字典) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  const opts = f.options ?? [];
  if (variant === "form")
    return (
      <div className={`${FORM_BOX} flex items-center justify-between`}>
        <span>{f.placeholder || opts[0] || "请选择"}</span>
        <span className="text-[12px]">{opts.length ? `${opts.length} 项` : ""} ▾</span>
      </div>
    );
  return (
    <div className={`${DESIGNER_CTL} max-w-[260px] flex items-center justify-between text-[#9CA3AF]`}>
      <span>{f.placeholder || opts[0] || "请选择"}</span>
      <span className="text-[11px]">{opts.length ? `${opts.length} 项可选` : "未设选项"} ▾</span>
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  return (
    <PropRow label="下拉选项" hint="自定义内容,可增删">
      <OptionsEditor options={f.options ?? []} onChange={(opts) => patch({ options: opts })} />
    </PropRow>
  );
}

export const selectField: FieldTypeDef = {
  type: "select",
  label: "下拉选择",
  icon: ListIcon,
  order: 5,
  hasPlaceholder: true,
  ownProps: ["options"],
  makeDefaults: () => ({ options: ["选项一", "选项二"] }),
  Preview,
  Properties,
  validate: (f) =>
    f.options && f.options.some((o) => o.trim())
      ? null
      : "是下拉字段,请在右侧「下拉选项」里至少填一个选项",
};
