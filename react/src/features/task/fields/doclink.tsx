import { Link2Icon } from "lucide-react";
import type {
  FieldTypeDef,
  FieldPreviewProps,
  FieldPropsEditorProps,
  FieldFillProps,
} from "./types";
import { DESIGNER_CTL, FORM_BOX, PROP_INPUT } from "./shared";
import { PropRow } from "./widgets";

/** 在线文档(给一个链接,填报时点「填写」打开) */
function Preview({ field: f, variant = "designer" }: FieldPreviewProps) {
  if (variant === "form")
    return (
      <div className="flex items-center gap-1.5">
        <div className={`${FORM_BOX} flex-1 truncate ${f.link ? "text-[#1A6BC8]" : ""}`}>
          {f.link || "未设置链接"}
        </div>
        <span className="px-2 py-1.5 rounded-md text-[12px] bg-party-soft text-[var(--party-primary)] whitespace-nowrap">
          填写
        </span>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5 max-w-[360px]">
      <div
        className={`${DESIGNER_CTL} flex-1 truncate ${f.link ? "text-[#1A6BC8]" : "text-[#9CA3AF]"}`}
        title={f.link || ""}
      >
        {f.link || "未设置链接(在右侧填「链接地址」)"}
      </div>
      <span className="px-2.5 py-1.5 rounded-md text-[13px] bg-party-soft text-[var(--party-primary)] font-medium whitespace-nowrap">
        填写
      </span>
    </div>
  );
}

function Properties({ field: f, patch }: FieldPropsEditorProps) {
  return (
    <PropRow label="链接地址" hint="填报时点「填写」打开此链接">
      <input
        value={f.link ?? ""}
        onChange={(e) => patch({ link: e.target.value })}
        placeholder="https://…"
        className={PROP_INPUT}
      />
    </PropRow>
  );
}

function FillInput({ field: f, value, onChange }: FieldFillProps) {
  const done = value === true;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {f.link ? (
        <a
          href={f.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-party-soft text-[var(--party-primary)] text-[13px] font-medium hover:underline"
        >
          打开在线文档填写 ↗
        </a>
      ) : (
        <span className="text-[13px] text-[#9CA3AF]">未设置链接</span>
      )}
      <label className="inline-flex items-center gap-1.5 text-[13px] cursor-pointer">
        <input type="checkbox" checked={done} onChange={(e) => onChange(e.target.checked)} />
        已完成在线填写
      </label>
    </div>
  );
}

export const doclinkField: FieldTypeDef = {
  type: "doclink",
  label: "在线文档",
  icon: Link2Icon,
  order: 9,
  ownProps: ["link"],
  Preview,
  Properties,
  FillInput,
};
