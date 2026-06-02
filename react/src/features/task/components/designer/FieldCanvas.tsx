import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FolderIcon, Trash2Icon } from "lucide-react";
import type { TaskField } from "../../api";
import { FieldCard } from "./FieldCard";
import { UNGROUPED, type DesignerContainer } from "./fieldDesignerUtils";

/** 中:分组容器画布。每个分组是一个可拖入的容器;未分组在最上方。 */
export function FieldCanvas({
  containers,
  activeGroup,
  selectedCode,
  onActivateGroup,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onRenameGroup,
  onDeleteGroup,
}: {
  containers: DesignerContainer[];
  activeGroup: string | null;
  selectedCode: string | null;
  onActivateGroup: (id: string | null) => void;
  onSelect: (code: string) => void;
  onPatch: (code: string, partial: Partial<TaskField>) => void;
  onDuplicate: (code: string) => void;
  onDelete: (code: string) => void;
  onRenameGroup: (id: string, label: string) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const total = containers.reduce((s, c) => s + c.fields.length, 0);
  if (total === 0 && containers.length === 1) {
    return (
      <div className="flex-1 min-w-0 p-4 overflow-auto bg-[#FAFBFC]">
        <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-1.5 text-sm text-[#9CA3AF] border-2 border-dashed border-[#E5E7EB] rounded-lg">
          <span>从左侧点字段类型添加,或先「添加分组」</span>
          <span className="text-[12px]">点字段卡在右侧改属性 · 拖动可排序 / 换组</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-0 p-4 overflow-auto bg-[#FAFBFC] space-y-3">
      {containers.map((c) => (
        <GroupSection
          key={c.id}
          container={c}
          active={activeGroup === (c.id === UNGROUPED ? null : c.id)}
          selectedCode={selectedCode}
          onActivate={onActivateGroup}
          onSelect={onSelect}
          onPatch={onPatch}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
        />
      ))}
    </div>
  );
}

function GroupSection({
  container: c,
  active,
  selectedCode,
  onActivate,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
  onRenameGroup,
  onDeleteGroup,
}: {
  container: DesignerContainer;
  active: boolean;
  selectedCode: string | null;
  onActivate: (id: string | null) => void;
  onSelect: (code: string) => void;
  onPatch: (code: string, partial: Partial<TaskField>) => void;
  onDuplicate: (code: string) => void;
  onDelete: (code: string) => void;
  onRenameGroup: (id: string, label: string) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const isUngrouped = c.id === UNGROUPED;
  const { setNodeRef, isOver } = useDroppable({ id: c.id });

  return (
    <div
      onClick={() => onActivate(isUngrouped ? null : c.id)}
      className={`rounded-lg border transition-colors ${
        active
          ? "border-[var(--party-primary)] bg-party-soft/40"
          : isUngrouped
            ? "border-[#E9E9E9] bg-white"
            : "border-[#dbe6f5] bg-[#f7faff]"
      }`}
    >
      {isUngrouped ? (
        <div className="px-3 pt-2.5 pb-1 text-[12px] font-bold text-[#667085]">
          未分组字段
          <span className="ml-1.5 text-[11px] font-normal text-[#9CA3AF]">({c.fields.length})</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e6eefb]">
          <FolderIcon className="w-4 h-4 text-[#246BFE] flex-shrink-0" />
          <input
            value={c.label}
            onChange={(e) => onRenameGroup(c.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="分组名(如 报送党员数据)"
            className="flex-1 min-w-0 bg-transparent text-[14px] font-bold text-[#172033] border-b border-transparent focus:border-[#246BFE] focus:outline-none py-0.5"
          />
          <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{c.fields.length} 字段</span>
          {active && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--party-primary)] text-white flex-shrink-0">
              添加目标
            </span>
          )}
          <button
            type="button"
            title="删除分组(组内字段移到未分组)"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteGroup(c.id);
            }}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <SortableContext items={c.fields.map((f) => f.code)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`p-2 space-y-2 min-h-[56px] rounded-b-lg ${isOver ? "bg-party-soft/60" : ""}`}
        >
          {c.fields.map((f) => (
            <FieldCard
              key={f.code}
              field={f}
              selected={selectedCode === f.code}
              onSelect={() => onSelect(f.code)}
              onPatch={(p) => onPatch(f.code, p)}
              onDuplicate={() => onDuplicate(f.code)}
              onDelete={() => onDelete(f.code)}
            />
          ))}
          {c.fields.length === 0 && (
            <div className="text-[12px] text-[#9CA3AF] text-center py-3 border border-dashed border-[#E5E7EB] rounded-md">
              {isUngrouped ? "从左侧添加字段" : "点左侧字段类型加入本组,或把字段拖进来"}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
