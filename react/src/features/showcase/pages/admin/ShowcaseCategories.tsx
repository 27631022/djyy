import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderTreeIcon, GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import IconPicker, { LucideIcon } from "@/shared/components/IconPicker";
import { showcaseApi, showcaseErrMsg, type ShowcaseCategory } from "../../api";

type DialogState = { mode: "create" } | { mode: "edit"; cat: ShowcaseCategory } | null;

const CAT_KEY = ["showcase", "categories"] as const;

/** 后台 · 晒场分类管理(六榜,扁平):增改删 + dnd-kit 拖拽排序(照 KnowledgeCategories 范式)。 */
export default function ShowcaseCategories() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: CAT_KEY, queryFn: showcaseApi.listCategories });
  const [dialog, setDialog] = useState<DialogState>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const del = useMutation({
    mutationFn: (id: string) => showcaseApi.deleteCategory(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: CAT_KEY });
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "删除失败")),
  });

  const reorder = useMutation({
    mutationFn: (items: Array<{ id: string; sortOrder: number }>) => showcaseApi.reorderCategories(items),
    // 乐观更新在 onDragEnd 里 setQueryData;失败回滚 + 提示
    onError: (e) => {
      toast.error(showcaseErrMsg(e, "排序失败"));
      qc.invalidateQueries({ queryKey: CAT_KEY });
    },
  });

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const data = qc.getQueryData<ShowcaseCategory[]>(CAT_KEY);
    if (!data) return;
    const ids = data.map((c) => c.id);
    const next = arrayMove(data, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    qc.setQueryData(CAT_KEY, next);
    reorder.mutate(next.map((c, i) => ({ id: c.id, sortOrder: i })));
  }

  const cats = list.data ?? [];

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <FolderTreeIcon className="h-5 w-5 text-[var(--party-primary)]" />
        <h1 className="text-xl font-bold text-gray-900">晒场分类管理</h1>
      </div>
      <p className="mb-4 text-sm text-gray-400">
        六大先锋榜(业绩/安全/实事/幸福/风貌/人物)等分类,顺序即晒场门户的分类 tab 顺序;有晒台的分类不可删。
      </p>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <GripVerticalIcon className="h-3.5 w-3.5" /> 拖动手柄可排序
          </span>
          <Button size="sm" className="ml-auto" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon className="mr-1 h-4 w-4" /> 新建分类
          </Button>
        </div>
        {list.isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
        ) : cats.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">还没有分类</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-gray-50">
                {cats.map((c) => (
                  <SortableRow
                    key={c.id}
                    cat={c}
                    onEdit={() => setDialog({ mode: "edit", cat: c })}
                    onDelete={() => {
                      if (window.confirm(`确定删除分类「${c.name}」?(有晒台时不可删)`)) del.mutate(c.id);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {dialog && (
        <CategoryDialog
          key={dialog.mode === "edit" ? dialog.cat.id : "new"}
          state={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function SortableRow({
  cat,
  onEdit,
  onDelete,
}: {
  cat: ShowcaseCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg bg-white px-2 py-2.5 hover:bg-gray-50 ${
        isDragging ? "opacity-60 shadow" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        title="拖拽排序"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>
      {cat.icon && <LucideIcon name={cat.icon} className="h-4 w-4 text-[var(--party-primary)]" />}
      <span className="flex-1 truncate font-medium text-gray-800">
        {cat.name}
        {cat.description && <span className="ml-2 text-xs font-normal text-gray-400">{cat.description}</span>}
      </span>
      <span className="text-xs text-gray-400">{cat.stageCount} 个晒台</span>
      <Button size="sm" variant="ghost" className="text-gray-400" onClick={onEdit}>
        <PencilIcon className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="text-gray-300 hover:text-red-500" onClick={onDelete}>
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function CategoryDialog({ state, onClose }: { state: NonNullable<DialogState>; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = state.mode === "edit" ? state.cat : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "Trophy");

  const save = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), description: description.trim() || undefined, icon };
      return editing ? showcaseApi.updateCategory(editing.id, data) : showcaseApi.createCategory(data);
    },
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: CAT_KEY });
      onClose();
    },
    onError: (e) => toast.error(showcaseErrMsg(e, "保存失败")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑分类「${editing.name}」` : "新建晒场分类"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-gray-400">名称 *</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:创新先锋榜" autoFocus />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-400">说明(可选)</div>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明,鼠标悬停分类 tab 时显示" />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-400">图标</div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
