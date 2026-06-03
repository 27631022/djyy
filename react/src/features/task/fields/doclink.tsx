import { Link2Icon, CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
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
  const link = f.link?.trim();
  // 只认 http(s) 链接,避免空 / 占位 / 相对路径点进去是空白页
  const valid = !!link && /^https?:\/\//i.test(link);
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {valid ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-party-soft text-[var(--party-primary)] text-[13px] font-medium no-underline hover:brightness-95"
        >
          <ExternalLinkIcon className="w-3.5 h-3.5" />
          打开在线文档
        </a>
      ) : (
        <span className="text-[13px] text-[#9CA3AF]">未配置有效链接(请联系派发人)</span>
      )}
      {/* 复选框 → 确认按钮 */}
      <button
        type="button"
        onClick={() => onChange(!done)}
        className={
          done
            ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
        }
      >
        <CheckCircle2Icon className="w-4 h-4" />
        {done ? "已确认完成" : "确认已完成填写"}
      </button>
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
