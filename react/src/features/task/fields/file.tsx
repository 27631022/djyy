import { PaperclipIcon } from "lucide-react";
import type {
  FieldTypeDef,
  FieldPreviewProps,
  FieldPropsEditorProps,
  FieldFillProps,
} from "./types";
import {
  DEFAULT_FILE_ACCEPT,
  acceptLabel,
  maxFilesLabel,
  uploadBoxCls,
} from "./shared";
import { PropRow, NumberInput, AcceptChips, FileFillInput } from "./widgets";

/** 文件上传(可设 最多个数 + 允许类型) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  const accept = variant === "designer" && f.accept ? ` · ${acceptLabel(f.accept)}` : "";
  return (
    <div className={uploadBoxCls(variant)}>
      点击上传文件 {maxFilesLabel(f.maxFiles)}
      {accept}
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  return (
    <div className="space-y-3">
      <PropRow label="最多个数" hint="留空 = 不限">
        <NumberInput value={f.maxFiles} onChange={(v) => patch({ maxFiles: v })} placeholder="不限" />
      </PropRow>
      <PropRow label="允许的文件类型" hint="点选,可多选">
        <AcceptChips accept={f.accept ?? ""} onChange={(a) => patch({ accept: a })} />
      </PropRow>
    </div>
  );
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  return <FileFillInput field={f} value={value} onChange={onChange} accept={f.accept} />;
}

export const fileField: FieldTypeDef = {
  type: "file",
  label: "文件",
  icon: PaperclipIcon,
  order: 6,
  ownProps: ["maxFiles", "accept"],
  makeDefaults: () => ({ accept: DEFAULT_FILE_ACCEPT }),
  Preview,
  Properties,
  FillInput,
};
