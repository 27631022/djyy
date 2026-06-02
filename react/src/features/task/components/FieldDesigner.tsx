import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Undo2Icon, Redo2Icon } from "lucide-react";
import type { TaskField, TaskFieldType } from "../api";
import { FieldPalette } from "./designer/FieldPalette";
import { FieldCanvas } from "./designer/FieldCanvas";
import { PropertiesPanel } from "./designer/PropertiesPanel";
import { useFieldHistory } from "./designer/useFieldHistory";
import {
  makeField,
  nextFieldCode,
  cleanForType,
  reindex,
  buildContainers,
  flattenContainers,
  newGroupId,
  UNGROUPED,
} from "./designer/fieldDesignerUtils";

/**
 * 字段设计器 —— 三栏:左 类型 palette + 添加分组 / 中 分组容器画布(所见即所得、可跨组拖拽)/ 右 属性面板。
 * 受控:渲染 value、变更上抛 onChange;撤销/重做由 useFieldHistory 维护;分组为画布容器结构(不再按字段填分组名)。
 */
export function FieldDesigner({
  value,
  onChange,
  fill = false,
}: {
  value: TaskField[];
  onChange: (fields: TaskField[]) => void;
  fill?: boolean;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(value[0]?.code ?? null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [emptyGroups, setEmptyGroups] = useState<{ id: string; label: string }[]>([]);
  const { mutate, undo, redo, canUndo, canRedo } = useFieldHistory(value, onChange);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const containers = buildContainers(value, emptyGroups);
  const selectedField = value.find((f) => f.code === selectedCode) ?? null;
  const activeGroupLabel =
    activeGroup ? (containers.find((c) => c.id === activeGroup)?.label || "新分组") : null;

  function addField(t: TaskFieldType) {
    const cs = buildContainers(value, emptyGroups);
    const nf = makeField(t, value);
    const target = cs.find((c) => c.id === (activeGroup ?? UNGROUPED)) ?? cs[0];
    if (target.id !== UNGROUPED) {
      nf.group = target.id;
      nf.groupLabel = target.label || target.id;
      setEmptyGroups((eg) => eg.filter((x) => x.id !== target.id));
    }
    target.fields.push(nf);
    mutate(flattenContainers(cs));
    setSelectedCode(nf.code);
  }

  function addGroup() {
    const name = window.prompt("分组名称(如 报送党员数据):");
    if (!name || !name.trim()) return;
    const id = newGroupId();
    setEmptyGroups((eg) => [...eg, { id, label: name.trim() }]);
    setActiveGroup(id);
  }

  function renameGroup(id: string, label: string) {
    if (value.some((f) => f.group === id)) {
      mutate(value.map((f) => (f.group === id ? { ...f, groupLabel: label } : f)));
    }
    setEmptyGroups((eg) => eg.map((x) => (x.id === id ? { ...x, label } : x)));
  }

  function deleteGroup(id: string) {
    if (value.some((f) => f.group === id)) {
      mutate(value.map((f) => (f.group === id ? { ...f, group: undefined, groupLabel: undefined } : f)));
    }
    setEmptyGroups((eg) => eg.filter((x) => x.id !== id));
    if (activeGroup === id) setActiveGroup(null);
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
    mutate(value.filter((f) => f.code !== code));
    if (selectedCode === code) setSelectedCode(null);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeCode = String(active.id);
    const overId = String(over.id);
    const cs = buildContainers(value, emptyGroups);

    let from = -1;
    let fromIdx = -1;
    cs.forEach((c, ci) => {
      const i = c.fields.findIndex((f) => f.code === activeCode);
      if (i >= 0) {
        from = ci;
        fromIdx = i;
      }
    });
    if (from < 0) return;

    let to = cs.findIndex((c) => c.id === overId);
    let toIdx = 0;
    if (to >= 0) {
      toIdx = cs[to].fields.length; // 落在容器空白处 → 末尾
    } else {
      cs.forEach((c, ci) => {
        const i = c.fields.findIndex((f) => f.code === overId);
        if (i >= 0) {
          to = ci;
          toIdx = i;
        }
      });
    }
    if (to < 0) return;
    if (from === to && fromIdx === toIdx) return;

    const [moved] = cs[from].fields.splice(fromIdx, 1);
    let insertIdx = toIdx;
    if (from === to && fromIdx < insertIdx) insertIdx -= 1;
    cs[to].fields.splice(insertIdx, 0, moved);

    const targetId = cs[to].id;
    if (targetId !== UNGROUPED) setEmptyGroups((eg) => eg.filter((x) => x.id !== targetId));
    mutate(flattenContainers(cs));
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
      className={`flex flex-col border border-[#dce4ef] rounded-lg overflow-hidden bg-white ${
        fill ? "h-full" : ""
      }`}
      style={fill ? undefined : { height: 520 }}
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
        <FieldPalette onAdd={addField} onAddGroup={addGroup} activeGroupLabel={activeGroupLabel} />
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <FieldCanvas
            containers={containers}
            activeGroup={activeGroup}
            selectedCode={selectedCode}
            onActivateGroup={setActiveGroup}
            onSelect={setSelectedCode}
            onPatch={patch}
            onDuplicate={duplicate}
            onDelete={remove}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
          />
        </DndContext>
        <div className="w-64 flex-shrink-0 border-l border-[#F0F0F0] bg-[#FBFBFC] p-3 overflow-auto">
          <PropertiesPanel field={selectedField} onPatch={patch} />
        </div>
      </div>
    </div>
  );
}
