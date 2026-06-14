import { Plus, Redo2, Undo2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { IndicatorKind, IndicatorNode } from "../api";
import { IndicatorNodeRow } from "./IndicatorNodeRow";
import {
  addChild,
  makeNode,
  recomputeWeights,
  removeNode,
  reorderSiblings,
  setKindDeep,
  sumNormalWeights,
  updateNode,
} from "../treeOps";

/**
 * 指标树编辑器(受控)。只填末端叶子权重,上级自动累加(recomputeWeights);同级拖拽排序(dnd-kit)。
 * 父(SchemeEditor)持 useHistory:setNodes=非记录中间态,record=动作前检查点。
 */
export function IndicatorTreeEditor({
  nodes,
  setNodes,
  record,
  selectedCode,
  onSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  baseFullScore,
}: {
  nodes: IndicatorNode[];
  setNodes: (next: IndicatorNode[]) => void;
  record: () => void;
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  baseFullScore: number;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // 结构变更:记录检查点 + 重算上级权重
  const mutate = (next: IndicatorNode[]) => {
    record();
    setNodes(recomputeWeights(next));
  };
  // 文本/权重即时编辑(不记录,onFocus 已 record):权重变了要重算上级
  const onPatch = (code: string, patch: Partial<IndicatorNode>) =>
    setNodes(recomputeWeights(updateNode(nodes, code, patch)));

  const addTop = () => {
    const n = makeNode(nodes);
    mutate([...nodes, n]);
    onSelect(n.code);
  };
  const onAddChild = (code: string) => {
    const n = makeNode(nodes);
    mutate(addChild(nodes, code, n));
    onSelect(n.code);
  };
  const onDelete = (code: string) => {
    mutate(removeNode(nodes, code));
    if (selectedCode === code) onSelect(null);
  };
  const onKindChange = (code: string, kind: IndicatorKind) => mutate(setKindDeep(nodes, code, kind));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      mutate(reorderSiblings(nodes, String(active.id), String(over.id)));
    }
  };

  const rootSum = sumNormalWeights(nodes);
  const sumOk = Math.abs(rootSum - baseFullScore) < 0.01;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#F0F0F0]">
        <button
          type="button"
          onClick={addTop}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[13px] text-white"
          style={{ backgroundColor: "var(--party-primary)" }}
        >
          <Plus className="w-3.5 h-3.5" /> 顶层指标
        </button>
        <div className="flex-1" />
        <span className={`text-[12px] ${sumOk ? "text-[#16a34a]" : "text-amber-600"}`} title="顶层「计权」指标分值之和应等于基础满分">
          计权合计 {rootSum}/{baseFullScore}
        </span>
        <button type="button" onClick={onUndo} disabled={!canUndo} className="p-1 rounded disabled:opacity-30 text-[#475467] hover:bg-[#eef2f7]" title="撤销">
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className="p-1 rounded disabled:opacity-30 text-[#475467] hover:bg-[#eef2f7]" title="重做">
          <Redo2 className="w-4 h-4" />
        </button>
      </div>
      <div
        className="flex-1 overflow-auto p-2"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {nodes.length === 0 ? (
          <div className="text-center text-[13px] text-[#9CA3AF] py-10">点「顶层指标」开始搭建考核指标体系</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={nodes.map((n) => n.code)} strategy={verticalListSortingStrategy}>
              {nodes.map((n) => (
                <IndicatorNodeRow
                  key={n.code}
                  node={n}
                  depth={0}
                  selectedCode={selectedCode}
                  onSelect={onSelect}
                  record={record}
                  onPatch={onPatch}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  onKindChange={onKindChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
