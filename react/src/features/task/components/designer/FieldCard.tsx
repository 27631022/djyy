import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { type TaskField } from "../../api";
import { getFieldType } from "../../fields";

/**
 * 单个字段「所见即所得」卡片 —— 可拖拽(含跨分组)、点选高亮、就地改名、悬浮操作。
 * 深度属性已移到右栏 PropertiesPanel(点选本卡即在右栏编辑)。
 * 控件预览委托给该类型在注册表里的 Preview。
 */
export function FieldCard({
  field: f,
  selected,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  field: TaskField;
  selected: boolean;
  onSelect: () => void;
  onPatch: (partial: Partial<TaskField>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.code,
  });
  const def = getFieldType(f.type);
  const Icon = def.icon;
  const Preview = def.Preview;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`group rounded-lg border bg-white px-3 py-2.5 cursor-pointer ${
        isDragging ? "opacity-50 shadow-lg" : ""
      } ${
        selected
          ? "border-[var(--party-primary)] ring-1 ring-[var(--party-primary)]"
          : "border-[#E9E9E9] hover:border-[#D1D5DB]"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-[#C0C6D0] hover:text-[#6B7280] touch-none"
          title="拖动排序 / 拖到其它分组"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </button>
        <Icon className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
        <input
          value={f.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="点击输入字段名"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[#1A1A1A] border-b border-transparent focus:border-[var(--party-primary)] focus:outline-none py-0.5"
        />
        {f.required && <span className="text-[var(--party-primary)] text-sm">*</span>}

        <div
          className={`flex items-center gap-1.5 flex-shrink-0 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center gap-1 text-[11px] text-[#6B7280] cursor-pointer">
            <Switch
              checked={f.required}
              onCheckedChange={(v) => onPatch({ required: v })}
              className="scale-90"
            />
            必填
          </label>
          <IconBtn title="复制" onClick={onDuplicate}>
            <CopyIcon className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="删除" danger onClick={onDelete}>
            <Trash2Icon className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* 所见即所得:真实控件预览(只读)—— 由该类型注册表的 Preview 渲染 */}
      <div className="mt-2 pl-6">
        <Preview field={f} variant="designer" />
        {f.description && <p className="text-[11px] text-[#9CA3AF] mt-1">{f.description}</p>}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1 rounded ${
        danger ? "text-[#9CA3AF] hover:text-red-600 hover:bg-red-50" : "text-[#6B7280] hover:bg-[#F0F0F0]"
      }`}
    >
      {children}
    </button>
  );
}
