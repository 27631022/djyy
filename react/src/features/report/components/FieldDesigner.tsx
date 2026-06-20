import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Undo2Icon,
  Redo2Icon,
  GripVerticalIcon,
  CopyIcon,
  Trash2Icon,
  Settings2Icon,
  PlusIcon,
} from "lucide-react";
import type { ReportField, ReportFieldType } from "../api";
import { FIELD_TYPE_LIST, getFieldType, fieldTypeLabel } from "../fields";
import { PROP_INPUT } from "../fields/shared";
import { PropRow } from "../fields/widgets";
import { useFieldHistory } from "./designer/useFieldHistory";
import { makeField, cleanForType, nextFieldCode, reindex } from "./designer/fieldUtils";

/**
 * 报送字段设计器 —— 三栏:左 类型 palette(点选添加)/ 中 字段卡画布(拖拽排序 + 就地改名 + 必填 + 复制 + 删除 + 点选)/ 右 属性面板。
 * 受控:渲染 value、变更上抛 onChange;撤销/重做由 useFieldHistory 维护。复用 fields 注册表的 Preview/Properties。
 * 扶贫表单是扁平结构(无分组),用 @dnd-kit 垂直拖拽排序(对齐 task 设计器的拖拽体验)。
 */
export function FieldDesigner({
  value,
  onChange,
  fill = false,
}: {
  value: ReportField[];
  onChange: (fields: ReportField[]) => void;
  fill?: boolean;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(value[0]?.code ?? null);
  const { mutate, undo, redo, canUndo, canRedo } = useFieldHistory(value, onChange);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const fields = [...value].sort((a, b) => a.sortOrder - b.sortOrder);
  const selected = value.find((f) => f.code === selectedCode) ?? null;

  function addField(t: ReportFieldType) {
    const nf = makeField(t, value);
    mutate(reindex([...fields, nf]));
    setSelectedCode(nf.code);
  }
  function patch(code: string, partial: Partial<ReportField>) {
    mutate(value.map((f) => (f.code === code ? cleanForType({ ...f, ...partial }) : f)));
  }
  function remove(code: string) {
    mutate(reindex(value.filter((f) => f.code !== code)));
    if (selectedCode === code) setSelectedCode(null);
  }
  function duplicate(code: string) {
    const idx = fields.findIndex((f) => f.code === code);
    if (idx < 0) return;
    const copy: ReportField = { ...fields[idx], code: nextFieldCode(value), label: `${fields[idx].label} 副本` };
    const next = [...fields];
    next.splice(idx + 1, 0, copy);
    mutate(reindex(next));
    setSelectedCode(copy.code);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.code === String(active.id));
    const to = fields.findIndex((f) => f.code === String(over.id));
    if (from < 0 || to < 0) return;
    mutate(reindex(arrayMove(fields, from, to)));
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className={`flex flex-col overflow-hidden rounded-lg border border-[#dce4ef] bg-white ${fill ? "h-full" : ""}`}
      style={fill ? undefined : { height: 520 }}
    >
      <div className="flex items-center gap-2 border-b border-[#F0F0F0] bg-white px-3 py-1.5">
        <span className="text-[13px] text-[#6B7280]">共 {value.length} 个字段</span>
        <span className="text-[11px] text-[#9CA3AF]">· 拖动左侧手柄排序</span>
        <div className="flex-1" />
        <button type="button" onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)" className="rounded p-1.5 text-[#6B7280] hover:bg-[#F0F0F0] disabled:opacity-30">
          <Undo2Icon className="h-4 w-4" />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)" className="rounded p-1.5 text-[#6B7280] hover:bg-[#F0F0F0] disabled:opacity-30">
          <Redo2Icon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* palette */}
        <div className="w-40 flex-shrink-0 space-y-1 overflow-auto border-r border-[#F0F0F0] bg-[#FBFBFC] p-2">
          <div className="px-1 pb-1 text-[11px] font-medium text-[#9CA3AF]">点选添加字段</div>
          {FIELD_TYPE_LIST.map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.type}
                type="button"
                onClick={() => addField(d.type)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[13px] text-[#374151] hover:border-[var(--party-primary)] hover:bg-white"
              >
                <Icon className="h-4 w-4 text-[var(--party-primary)]" />
                {d.label}
              </button>
            );
          })}
        </div>

        {/* canvas */}
        <div className="min-w-0 flex-1 space-y-2 overflow-auto bg-[#F7F8FA] p-3">
          {fields.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[#9CA3AF]">
              <PlusIcon className="h-7 w-7" />
              <div className="text-[13px]">从左侧点选字段类型添加</div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={fields.map((f) => f.code)} strategy={verticalListSortingStrategy}>
                {fields.map((f) => (
                  <SortableFieldCard
                    key={f.code}
                    field={f}
                    selected={f.code === selectedCode}
                    onSelect={() => setSelectedCode(f.code)}
                    onPatch={(p) => patch(f.code, p)}
                    onDuplicate={() => duplicate(f.code)}
                    onDelete={() => remove(f.code)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* properties */}
        <div className="w-64 flex-shrink-0 overflow-auto border-l border-[#F0F0F0] bg-[#FBFBFC] p-3">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[#9CA3AF]">
              <Settings2Icon className="h-7 w-7" />
              <div className="text-[13px]">点中间的字段卡片,在这里编辑它的属性</div>
            </div>
          ) : (
            <PropertiesBody field={selected} onPatch={patch} />
          )}
        </div>
      </div>
    </div>
  );
}

/** 单个字段卡 —— 可拖拽(grip 手柄)、点选高亮、就地改名、必填/复制/删除、所见即所得预览。 */
function SortableFieldCard({
  field: f,
  selected,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  field: ReportField;
  selected: boolean;
  onSelect: () => void;
  onPatch: (partial: Partial<ReportField>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.code });
  const Def = getFieldType(f.type);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`rounded-lg border bg-white p-2.5 transition-colors ${isDragging ? "opacity-50 shadow-lg" : ""} ${
        selected ? "border-[var(--party-primary)] ring-1 ring-party-primary-20" : "border-[#E5E7EB] hover:border-[#cdd5e2]"
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="拖动排序"
          className="cursor-grab touch-none rounded p-0.5 text-[#C0C6D0] hover:text-[#6B7280] active:cursor-grabbing"
        >
          <GripVerticalIcon className="h-4 w-4" />
        </button>
        <input
          value={f.label}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="字段名"
          className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-[14px] font-medium text-[#172033] hover:border-[#E5E7EB] focus:border-[var(--party-primary)] focus:outline-none"
        />
        <span className="text-[11px] text-[#9CA3AF]">{fieldTypeLabel(f.type)}</span>
        <label className="flex items-center gap-1 text-[11px] text-[#6B7280]" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={f.required} onChange={(e) => onPatch({ required: e.target.checked })} />
          必填
        </label>
        <button type="button" title="复制" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="rounded p-1 text-[#9CA3AF] hover:bg-gray-100">
          <CopyIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="删除" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600">
          <Trash2Icon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Def.Preview field={f} variant="designer" />
      </div>
    </div>
  );
}

function PropertiesBody({ field: f, onPatch }: { field: ReportField; onPatch: (code: string, p: Partial<ReportField>) => void }) {
  const def = getFieldType(f.type);
  const patch = (p: Partial<ReportField>) => onPatch(f.code, p);
  const TypeProperties = def.Properties;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#172033]">
        <Settings2Icon className="h-4 w-4 text-[var(--party-primary)]" />
        字段属性
        <span className="text-[11px] font-normal text-[#9CA3AF]">· {fieldTypeLabel(f.type)}</span>
      </div>
      <PropRow label="类型">
        <select value={f.type} onChange={(e) => patch({ type: e.target.value as ReportFieldType })} className={PROP_INPUT}>
          {FIELD_TYPE_LIST.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
      </PropRow>
      {def.hasPlaceholder && (
        <PropRow label="提示 / 占位">
          <input value={f.placeholder ?? ""} onChange={(e) => patch({ placeholder: e.target.value })} className={PROP_INPUT} />
        </PropRow>
      )}
      {TypeProperties && <TypeProperties field={f} patch={patch} />}
      <PropRow label="说明">
        <input value={f.description ?? ""} onChange={(e) => patch({ description: e.target.value })} className={PROP_INPUT} />
      </PropRow>
    </div>
  );
}
