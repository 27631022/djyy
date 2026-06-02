import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Undo2Icon, Redo2Icon } from "lucide-react";
import { dictionariesApi } from "@/features/dictionary";
import type { TaskField, TaskFieldType } from "../api";
import { FieldPalette } from "./designer/FieldPalette";
import { FieldCanvas } from "./designer/FieldCanvas";
import { useFieldHistory } from "./designer/useFieldHistory";
import { makeField, cleanForType, nextFieldCode, reindex } from "./designer/fieldDesignerUtils";

/**
 * 字段设计器 —— WYSIWYG 拖拽搭建器(左类型面板 / 中所见即所得画布 / 卡片就地改名 + ⚙ 设置)。
 * 受控:渲染 value、变更上抛 onChange;撤销/重做由 useFieldHistory 维护。字段 code 自动生成,用户不填代码。
 */
export function FieldDesigner({
  value,
  onChange,
  fill = false,
}: {
  value: TaskField[];
  onChange: (fields: TaskField[]) => void;
  /** true:充满父容器高度(向导第二步用);false:固定 460 高(模板页用) */
  fill?: boolean;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(value[0]?.code ?? null);
  const { mutate, undo, redo, canUndo, canRedo } = useFieldHistory(value, onChange);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dictsQuery = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => dictionariesApi.list(),
    staleTime: 60_000,
  });
  const dicts = (dictsQuery.data ?? []).map((d) => ({ id: d.id, code: d.code, name: d.name }));

  function addField(t: TaskFieldType) {
    const nf = makeField(t, value);
    mutate(reindex([...value, nf]));
    setSelectedCode(nf.code);
  }
  function patch(code: string, partial: Partial<TaskField>) {
    mutate(value.map((f) => (f.code === code ? cleanForType({ ...f, ...partial }) : f)));
  }
  function duplicate(code: string) {
    const idx = value.findIndex((f) => f.code === code);
    if (idx < 0) return;
    const copy: TaskField = {
      ...value[idx],
      code: nextFieldCode(value),
      label: `${value[idx].label} 副本`,
    };
    const next = [...value];
    next.splice(idx + 1, 0, copy);
    mutate(reindex(next));
    setSelectedCode(copy.code);
  }
  function remove(code: string) {
    mutate(reindex(value.filter((f) => f.code !== code)));
    if (selectedCode === code) setSelectedCode(null);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((f) => f.code === active.id);
    const newIndex = value.findIndex((f) => f.code === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    mutate(reindex(arrayMove(value, oldIndex, newIndex)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    const t = e.target as HTMLElement;
    // 输入框内交给浏览器原生撤销(改字),其余位置才撤销字段操作
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className={`flex flex-col border border-[#dce4ef] rounded-lg overflow-hidden bg-white ${
        fill ? "h-full" : ""
      }`}
      style={fill ? undefined : { height: 460 }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#F0F0F0] bg-white">
        <span className="text-[13px] text-[#6B7280]">共 {value.length} 个字段</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#6B7280] disabled:opacity-30"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2Icon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          className="p-1.5 rounded hover:bg-[#F0F0F0] text-[#6B7280] disabled:opacity-30"
          title="重做 (Ctrl+Shift+Z)"
        >
          <Redo2Icon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <FieldPalette onAdd={addField} />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <FieldCanvas
            fields={value}
            selectedCode={selectedCode}
            dicts={dicts}
            onSelect={(c) => setSelectedCode(c)}
            onPatch={patch}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </DndContext>
      </div>
    </div>
  );
}
