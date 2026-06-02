import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TaskField } from "../../api";
import { FieldCard } from "./FieldCard";

type DictLite = { id: string; code: string; name: string };

/** 中:可拖拽排序的字段画布(所见即所得)。空态为放置引导区。 */
export function FieldCanvas({
  fields,
  selectedCode,
  dicts,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  fields: TaskField[];
  selectedCode: string | null;
  dicts: DictLite[];
  onSelect: (code: string) => void;
  onPatch: (code: string, partial: Partial<TaskField>) => void;
  onDuplicate: (code: string) => void;
  onDelete: (code: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="flex-1 min-w-0 p-4 overflow-auto">
        <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-1.5 text-sm text-[#9CA3AF] border-2 border-dashed border-[#E5E7EB] rounded-lg">
          <span>从左侧选择字段类型,点一下加进来</span>
          <span className="text-[12px]">支持拖拽排序 · 点标题改名 · 悬浮设置</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-0 p-4 overflow-auto bg-[#FAFBFC]">
      <SortableContext items={fields.map((f) => f.code)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 max-w-2xl mx-auto">
          {fields.map((f) => (
            <FieldCard
              key={f.code}
              field={f}
              selected={selectedCode === f.code}
              dicts={dicts}
              onSelect={() => onSelect(f.code)}
              onPatch={(p) => onPatch(f.code, p)}
              onDuplicate={() => onDuplicate(f.code)}
              onDelete={() => onDelete(f.code)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
