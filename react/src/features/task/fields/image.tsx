import { ImageIcon } from "lucide-react";
import type { FieldTypeDef, FieldPreviewProps, FieldPropsEditorProps } from "./types";
import { maxFilesLabel, uploadBoxCls } from "./shared";
import { PropRow, NumberInput } from "./widgets";

/** 图片上传(可设 最多个数) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  return (
    <div className={uploadBoxCls(variant)}>
      点击上传图片 {maxFilesLabel(f.maxFiles)}
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  return (
    <PropRow label="最多个数" hint="留空 = 不限">
      <NumberInput value={f.maxFiles} onChange={(v) => patch({ maxFiles: v })} placeholder="不限" />
    </PropRow>
  );
}

export const imageField: FieldTypeDef = {
  type: "image",
  label: "图片",
  icon: ImageIcon,
  order: 7,
  ownProps: ["maxFiles"],
  Preview,
  Properties,
};
