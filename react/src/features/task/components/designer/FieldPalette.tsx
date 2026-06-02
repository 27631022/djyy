import { TASK_FIELD_TYPE_LABEL, type TaskFieldType } from "../../api";
import { FIELD_TYPE_ICONS } from "../fieldTypeIcons";

const TYPE_ORDER: TaskFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "file",
  "image",
  "richtext",
  "doclink",
];

/** 左:字段类型面板。点一下把该类型字段加到画布末尾。 */
export function FieldPalette({ onAdd }: { onAdd: (t: TaskFieldType) => void }) {
  return (
    <div className="w-40 flex-shrink-0 border-r border-[#F0F0F0] bg-[#FBFBFC] p-2 overflow-auto">
      <div className="text-[13px] font-semibold text-[#4B5563] px-1 mb-2">字段类型</div>
      <div className="grid grid-cols-2 gap-1.5">
        {TYPE_ORDER.map((t) => {
          const Icon = FIELD_TYPE_ICONS[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onAdd(t)}
              className="flex flex-col items-center gap-1 py-2.5 rounded-md border border-[#E9E9E9] bg-white hover:border-[var(--party-primary)] hover:bg-party-soft text-[12px] text-[#4B5563] transition-colors"
            >
              <Icon className="w-4 h-4" />
              {TASK_FIELD_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[#9CA3AF] mt-3 px-1 leading-relaxed">
        点一下加到右侧;拖动卡片排序;点标题就地改名。
      </p>
    </div>
  );
}
