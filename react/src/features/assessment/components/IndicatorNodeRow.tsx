import { ChevronRight, CornerDownRight, FileText, GripVertical, Plus, Trash2, UserCog } from "lucide-react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { IndicatorKind, IndicatorNode } from "../api";
import { isLeafNode } from "../treeOps";

const KIND_OPTIONS: { value: IndicatorKind; label: string }[] = [
  { value: "normal", label: "计权" },
  { value: "bonus", label: "加分项" },
  { value: "deduction", label: "减分项" },
];

const KIND_BADGE: Record<IndicatorKind, string> = { normal: "", bonus: "加分", deduction: "减分" };

interface RowProps {
  node: IndicatorNode;
  depth: number;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  record: () => void;
  onPatch: (code: string, patch: Partial<IndicatorNode>) => void;
  onAddChild: (code: string) => void;
  onDelete: (code: string) => void;
  /** 仅第一层可改;改后整棵子树继承 */
  onKindChange: (code: string, kind: IndicatorKind) => void;
}

export function IndicatorNodeRow(props: RowProps) {
  const { node, depth, selectedCode, onSelect, record, onPatch, onAddChild, onDelete, onKindChange } = props;
  const leaf = isLeafNode(node);
  const hasChildren = !!node.children && node.children.length > 0;
  const selected = selectedCode === node.code;
  const incomplete = leaf && (!node.dataSource || !node.scoringType);
  const special = node.kind !== "normal";
  // 末端叶子填分值;减分块填「减分上限」;计权/加分分支只读(下级自动累加)
  const weightEditable = leaf || node.kind === "deduction";
  const weightLabel = !leaf && node.kind === "deduction" ? "上限" : "分";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.code });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={() => onSelect(node.code)}
        title={node.content || undefined}
        className={`rounded-md cursor-pointer py-1 ${
          selected ? "bg-party-soft ring-1 ring-[var(--party-primary)]/40" : "hover:bg-[#F6F8FB]"
        }`}
        style={{ paddingLeft: 4 + depth * 16, paddingRight: 8 }}
      >
        {/* 单行:指标名(居左,简要)+ 内容标记 + 分值(居右)+ 类型/操作。完整「考核内容」鼠标悬停可见。 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="p-0.5 rounded text-[#cbd5e1] hover:text-[#94a3b8] cursor-grab active:cursor-grabbing flex-shrink-0"
            title="拖拽排序(同级)"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          {leaf ? (
            <CornerDownRight className="w-3.5 h-3.5 text-[#cbd5e1] flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#94a3b8] flex-shrink-0" />
          )}
          {depth > 0 && special && (
            <span className="text-[10px] px-1 rounded bg-[#fff0e8] text-[#c2410c] flex-shrink-0">{KIND_BADGE[node.kind]}</span>
          )}
          <input
            value={node.label}
            onFocus={record}
            onChange={(e) => onPatch(node.code, { label: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="指标标题(简要)"
            className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent focus:border-[var(--party-primary)] focus:outline-none text-[14px] text-[#172033] px-0.5"
          />
          {node.content && (
            <span
              onClick={(e) => e.stopPropagation()}
              title={node.content}
              className="flex-shrink-0 text-[#94a3b8] hover:text-[var(--party-primary)]"
            >
              <FileText className="w-3.5 h-3.5" />
            </span>
          )}
          {incomplete && (
            <span className="text-[10px] text-amber-600 flex-shrink-0" title="叶子未配置数据源/计分工具">
              待配
            </span>
          )}
          {!!node.adminUserIds?.length && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-[var(--party-primary)] bg-party-soft px-1 rounded flex-shrink-0"
              title={`本指标已设 ${node.adminUserIds.length} 名管理员`}
            >
              <UserCog className="w-3 h-3" />
              {node.adminUserIds.length}
            </span>
          )}
          {weightEditable ? (
            <input
              type="number"
              value={node.weight ?? 0}
              title={!leaf ? "本块减分上限/封顶(下级减分之和超此值锁死)" : "分值(只在末端指标填)"}
              onFocus={record}
              onChange={(e) => onPatch(node.code, { weight: e.target.value === "" ? 0 : Number(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
              className="w-14 text-right text-[13px] border border-[#e5e7eb] rounded px-1 py-0.5 flex-shrink-0"
            />
          ) : (
            <span className="w-14 text-right text-[13px] text-[#94a3b8] flex-shrink-0" title="下级累加,自动算">
              {node.weight ?? 0}
            </span>
          )}
          <span className="text-[11px] text-[#9CA3AF] flex-shrink-0">{weightLabel}</span>
          {depth === 0 && (
            <select
              value={node.kind}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onKindChange(node.code, e.target.value as IndicatorKind)}
              className="text-[11px] border border-[#e5e7eb] rounded px-1 py-0.5 bg-white flex-shrink-0 text-[#475467]"
              title="计权/加分项/减分项(仅第一层可选,下级继承)"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" title="加子指标" onClick={(e) => { e.stopPropagation(); onAddChild(node.code); }} className="p-1 rounded text-[#94a3b8] hover:text-[var(--party-primary)] hover:bg-party-soft flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={hasChildren ? "请先删除其下级指标" : "删除"}
            disabled={hasChildren}
            onClick={(e) => { e.stopPropagation(); onDelete(node.code); }}
            className={`p-1 rounded flex-shrink-0 ${hasChildren ? "text-[#d1d5db] cursor-not-allowed" : "text-[#94a3b8] hover:text-red-600 hover:bg-red-50"}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {hasChildren && (
        <SortableContext items={node.children!.map((c) => c.code)} strategy={verticalListSortingStrategy}>
          {node.children!.map((c) => (
            <IndicatorNodeRow key={c.code} {...props} node={c} depth={depth + 1} />
          ))}
        </SortableContext>
      )}
    </div>
  );
}
