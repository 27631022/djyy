import { FolderPlusIcon } from "lucide-react";
import { type TaskFieldType } from "../../api";
import { FIELD_TYPE_LIST } from "../../fields";

/** 左:字段类型 palette + 添加分组。点类型把字段加到「当前分组」(未选则加到未分组)。 */
export function FieldPalette({
  onAdd,
  onAddGroup,
  activeGroupLabel,
}: {
  onAdd: (t: TaskFieldType) => void;
  onAddGroup: () => void;
  /** 新字段将加入的分组名;null = 未分组 */
  activeGroupLabel: string | null;
}) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-[#F0F0F0] bg-[#FBFBFC] p-2 overflow-auto flex flex-col">
      <div className="text-[13px] font-semibold text-[#4B5563] px-1 mb-2">字段类型</div>
      <div className="grid grid-cols-2 gap-1.5">
        {FIELD_TYPE_LIST.map((def) => {
          const Icon = def.icon;
          return (
            <button
              key={def.type}
              type="button"
              onClick={() => onAdd(def.type)}
              className="flex flex-col items-center gap-1 py-2.5 rounded-md border border-[#E9E9E9] bg-white hover:border-[var(--party-primary)] hover:bg-party-soft text-[12px] text-[#4B5563] transition-colors"
            >
              <Icon className="w-4 h-4" />
              {def.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-[#E9E9E9]">
        <button
          type="button"
          onClick={onAddGroup}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-[#246BFE]/50 bg-[#eef4ff] text-[#1d4ed8] text-[12px] font-bold hover:border-[#246BFE]"
        >
          <FolderPlusIcon className="w-4 h-4" />
          添加分组
        </button>
        <p className="text-[11px] text-[#9CA3AF] mt-2 px-1 leading-relaxed">
          点字段类型加到
          <span className="font-bold text-[var(--party-primary)]">
            {activeGroupLabel ? `「${activeGroupLabel}」` : "未分组"}
          </span>
          。点中间分组标题可切换;字段可拖到别的分组。
        </p>
      </div>
    </div>
  );
}
