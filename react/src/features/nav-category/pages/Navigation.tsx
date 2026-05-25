import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutGridIcon, RefreshCwIcon, PlusIcon, EditIcon, TrashIcon, XIcon, SaveIcon,
  PowerIcon, PowerOffIcon, StarIcon, ChevronRightIcon, AlertCircleIcon,
  GripVerticalIcon,
} from "lucide-react";
import {
  navApi,
  type NavCategoryDto,
  type NavItemDto,
  type CreateNavCategoryInput,
  type UpdateNavCategoryInput,
  type CreateNavItemInput,
} from "@/features/nav-category";
import IconPicker, { LucideIcon } from "@/shared/components/IconPicker";

const PARTY = "var(--party-primary)";

export default function NavigationPage() {
  const qc = useQueryClient();
  const navQuery = useQuery({
    queryKey: ["nav-categories", "all"],
    queryFn: () => navApi.listAll(),
  });

  const cats = navQuery.data ?? [];
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<NavCategoryDto | null>(null);
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NavItemDto | null>(null);
  const [createItemOpen, setCreateItemOpen] = useState(false);

  // 默认选第一个分类
  useEffect(() => {
    if (!activeCatId && cats.length > 0) setActiveCatId(cats[0].id);
  }, [cats, activeCatId]);

  const activeCat = useMemo(
    () => cats.find((c) => c.id === activeCatId) ?? null,
    [cats, activeCatId],
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["nav-categories", "all"] });
    // 同时让前台首页的查询失效,这样改了后台前台会重拉
    qc.invalidateQueries({ queryKey: ["nav-categories", "portal"] });
  }

  const totalItems = cats.reduce((sum, c) => sum + c.items.length, 0);
  const activeItems = cats.reduce(
    (sum, c) => sum + c.items.filter((i) => i.active).length,
    0,
  );

  /* ─── 一级分类拖拽排序 ─── */
  const [catDrag, setCatDrag] = useState<string | null>(null);
  const [catDragOver, setCatDragOver] = useState<{ id: string; pos: "above" | "below" } | null>(null);
  const reorderCatsMu = useMutation({
    mutationFn: (orderedIds: string[]) => navApi.reorderCategories(orderedIds),
    onSuccess: () => {
      toast.success("分类顺序已更新");
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "排序保存失败"),
  });
  function clearCatDrag() {
    setCatDrag(null);
    setCatDragOver(null);
  }
  function handleCatDragOver(id: string, e: React.DragEvent) {
    if (!catDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos: "above" | "below" = e.clientY < midY ? "above" : "below";
    if (catDragOver?.id !== id || catDragOver?.pos !== pos) {
      setCatDragOver({ id, pos });
    }
  }
  function handleCatDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!catDrag || !catDragOver || catDrag === catDragOver.id) {
      clearCatDrag();
      return;
    }
    const ids = cats.map((c) => c.id);
    const fromIdx = ids.indexOf(catDrag);
    const targetIdx = ids.indexOf(catDragOver.id);
    if (fromIdx === -1 || targetIdx === -1) {
      clearCatDrag();
      return;
    }
    const insertAt = catDragOver.pos === "above" ? targetIdx : targetIdx + 1;
    const next = [...ids];
    next.splice(fromIdx, 1);
    const adjusted = fromIdx < insertAt ? insertAt - 1 : insertAt;
    next.splice(adjusted, 0, catDrag);
    if (ids.every((id, i) => id === next[i])) {
      clearCatDrag();
      return;
    }
    clearCatDrag();
    reorderCatsMu.mutate(next);
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
          <LayoutGridIcon className="w-4 h-4 text-[var(--party-primary)]" />
          首页导航
        </h1>
        <span className="text-xs text-[#9CA3AF]">
          共 {cats.length} 个分类 · 项目 {activeItems}/{totalItems} 启用
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-[#9CA3AF] hidden md:inline">
          前台首页"全部导航"区域由此驱动
        </span>
        <button
          onClick={refresh}
          className="p-1.5 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
        >
          <RefreshCwIcon className={`w-3.5 h-3.5 ${navQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={() => setCreateCatOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          新建分类
        </button>
      </div>

      {/* Body:左侧分类列表 + 右侧项目表格 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左侧分类 */}
        <aside className="w-64 flex-shrink-0 border-r border-[#E9E9E9] bg-[#FAFAFA] overflow-y-auto">
          {navQuery.isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-[#F0F0F0] rounded-md animate-pulse" />
              ))}
            </div>
          ) : cats.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#9CA3AF]">
              暂无分类,点击右上角"新建分类"
            </div>
          ) : (
            <ul className="py-1">
              {cats.map((cat) => {
                const active = cat.id === activeCatId;
                const isDragging = catDrag === cat.id;
                const isOver = catDragOver?.id === cat.id;
                const dropIndicator =
                  isOver && catDragOver?.pos === "above"
                    ? "inset 0 2px 0 0 #3B82F6"
                    : isOver && catDragOver?.pos === "below"
                      ? "inset 0 -2px 0 0 #3B82F6"
                      : undefined;
                return (
                  <li
                    key={cat.id}
                    draggable
                    onDragStart={(e) => {
                      setCatDrag(cat.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", cat.id);
                    }}
                    onDragOver={(e) => handleCatDragOver(cat.id, e)}
                    onDrop={handleCatDrop}
                    onDragEnd={clearCatDrag}
                    style={{
                      opacity: isDragging ? 0.4 : undefined,
                      boxShadow: dropIndicator,
                    }}
                  >
                    <button
                      onClick={() => setActiveCatId(cat.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors group cursor-grab active:cursor-grabbing"
                      style={{
                        backgroundColor: active ? "white" : "transparent",
                        borderLeft: active ? `3px solid ${cat.color}` : "3px solid transparent",
                      }}
                    >
                      <GripVerticalIcon
                        className="w-3 h-3 flex-shrink-0 text-[#C0C6D0]"
                        aria-hidden
                      />
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `color-mix(in srgb, ${cat.color} 12%, white)` }}
                      >
                        <LucideIcon name={cat.icon} className="w-4 h-4" style={{ color: cat.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[#1A1A1A] truncate">
                            {cat.label}
                          </span>
                          {!cat.active && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-gray-200 text-gray-600">禁</span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#9CA3AF]">
                          {cat.items.length} 项 · #{cat.code}
                        </span>
                      </div>
                      <ChevronRightIcon
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: active ? cat.color : "#D1D5DB" }}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* 右侧项目区 */}
        <main className="flex-1 min-w-0 overflow-auto">
          {!activeCat ? (
            <div className="h-full flex items-center justify-center text-xs text-[#9CA3AF]">
              <div className="text-center">
                <AlertCircleIcon className="w-8 h-8 text-[#D1D5DB] mx-auto mb-2" />
                选择左侧一个分类
              </div>
            </div>
          ) : (
            <CategoryDetail
              cat={activeCat}
              onEditCat={() => setEditingCat(activeCat)}
              onCreateItem={() => setCreateItemOpen(true)}
              onEditItem={setEditingItem}
              onChanged={refresh}
            />
          )}
        </main>
      </div>

      {/* 弹窗:分类 CRUD */}
      {createCatOpen && (
        <CategoryDialog
          mode="create"
          onClose={() => setCreateCatOpen(false)}
          onSuccess={() => { setCreateCatOpen(false); refresh(); }}
        />
      )}
      {editingCat && (
        <CategoryDialog
          mode="edit"
          category={editingCat}
          onClose={() => setEditingCat(null)}
          onSuccess={() => { setEditingCat(null); refresh(); }}
        />
      )}

      {/* 弹窗:项目 CRUD */}
      {createItemOpen && activeCat && (
        <ItemDialog
          mode="create"
          categoryId={activeCat.id}
          categoryColor={activeCat.color}
          onClose={() => setCreateItemOpen(false)}
          onSuccess={() => { setCreateItemOpen(false); refresh(); }}
        />
      )}
      {editingItem && activeCat && (
        <ItemDialog
          mode="edit"
          categoryId={activeCat.id}
          categoryColor={activeCat.color}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={() => { setEditingItem(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   CategoryDetail:右侧项目表格
   ═══════════════════════════════════════ */
function CategoryDetail({
  cat, onEditCat, onCreateItem, onEditItem, onChanged,
}: {
  cat: NavCategoryDto;
  onEditCat: () => void;
  onCreateItem: () => void;
  onEditItem: (item: NavItemDto) => void;
  onChanged: () => void;
}) {
  const deleteItemMut = useMutation({
    mutationFn: (id: string) => navApi.deleteItem(id),
    onSuccess: () => { toast.success("项目已删除"); onChanged(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });
  const toggleItemMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => navApi.updateItem(id, { active }),
    onSuccess: () => onChanged(),
  });

  /* ─── 二级项目拖拽排序(限本分类内) ─── */
  const [itemDrag, setItemDrag] = useState<string | null>(null);
  const [itemDragOver, setItemDragOver] = useState<{ id: string; pos: "above" | "below" } | null>(null);
  const reorderItemsMu = useMutation({
    mutationFn: (orderedIds: string[]) => navApi.reorderItems(cat.id, orderedIds),
    onSuccess: () => {
      toast.success("项目顺序已更新");
      onChanged();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "排序保存失败"),
  });
  function clearItemDrag() {
    setItemDrag(null);
    setItemDragOver(null);
  }
  function handleItemDragOver(id: string, e: React.DragEvent) {
    if (!itemDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos: "above" | "below" = e.clientY < midY ? "above" : "below";
    if (itemDragOver?.id !== id || itemDragOver?.pos !== pos) {
      setItemDragOver({ id, pos });
    }
  }
  function handleItemDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!itemDrag || !itemDragOver || itemDrag === itemDragOver.id) {
      clearItemDrag();
      return;
    }
    const ids = cat.items.map((it) => it.id);
    const fromIdx = ids.indexOf(itemDrag);
    const targetIdx = ids.indexOf(itemDragOver.id);
    if (fromIdx === -1 || targetIdx === -1) {
      clearItemDrag();
      return;
    }
    const insertAt = itemDragOver.pos === "above" ? targetIdx : targetIdx + 1;
    const next = [...ids];
    next.splice(fromIdx, 1);
    const adjusted = fromIdx < insertAt ? insertAt - 1 : insertAt;
    next.splice(adjusted, 0, itemDrag);
    if (ids.every((id, i) => id === next[i])) {
      clearItemDrag();
      return;
    }
    clearItemDrag();
    reorderItemsMu.mutate(next);
  }

  function confirmDelete(item: NavItemDto) {
    if (confirm(`确定删除项目"${item.label}"吗?\n此操作不可撤销。`)) {
      deleteItemMut.mutate(item.id);
    }
  }

  return (
    <div className="p-5">
      {/* 分类 meta */}
      <div className="mb-5 pb-4 border-b border-[#F0F0F0] flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: cat.bgLight }}
        >
          <LucideIcon name={cat.icon} className="w-6 h-6" style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-[#1A1A1A]">{cat.label}</h2>
            {!cat.active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">已禁用</span>
            )}
          </div>
          <p className="text-xs text-[#9CA3AF]">
            code: <span className="font-mono">{cat.code}</span> · 颜色:
            <span className="ml-1 inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm border border-[#E9E9E9]" style={{ backgroundColor: cat.color }} />
              <span className="font-mono">{cat.color}</span>
            </span>
            · 排序 {cat.sortOrder}
          </p>
        </div>
        <button
          onClick={onEditCat}
          className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] text-[#4B5563] hover:bg-[#F7F8FA] flex items-center gap-1.5"
        >
          <EditIcon className="w-3.5 h-3.5" />
          编辑分类
        </button>
      </div>

      {/* 项目列表头 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#4B5563]">项目列表 · {cat.items.length} 条</h3>
        <button
          onClick={onCreateItem}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white"
          style={{ backgroundColor: PARTY }}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          新建项目
        </button>
      </div>

      {/* 项目表格 */}
      <div className="border border-[#E9E9E9] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFA] border-b border-[#E9E9E9]">
            <tr className="text-left">
              <th className="px-2 py-2 text-xs font-semibold text-[#6B7280] w-10 text-center" title="拖拽以重排序">序</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] w-12">图标</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280]">名称</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] hidden md:table-cell">描述</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] w-16">常用</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] w-16">状态</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] w-28 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {cat.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-[#9CA3AF]">
                  暂无项目,点击右上角"新建项目"
                </td>
              </tr>
            )}
            {cat.items.map((it) => {
              const isDragging = itemDrag === it.id;
              const isOver = itemDragOver?.id === it.id;
              const dropIndicator =
                isOver && itemDragOver?.pos === "above"
                  ? "inset 0 2px 0 0 #3B82F6"
                  : isOver && itemDragOver?.pos === "below"
                    ? "inset 0 -2px 0 0 #3B82F6"
                    : undefined;
              return (
                <tr
                  key={it.id}
                  draggable
                  onDragStart={(e) => {
                    setItemDrag(it.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", it.id);
                  }}
                  onDragOver={(e) => handleItemDragOver(it.id, e)}
                  onDrop={handleItemDrop}
                  onDragEnd={clearItemDrag}
                  className="border-t border-[#F0F0F0] hover:bg-[#FAFAFA]"
                  style={{
                    opacity: isDragging ? 0.4 : undefined,
                    boxShadow: dropIndicator,
                  }}
                >
                  <td className="px-2 py-2 w-10">
                    <div
                      className="flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing text-[#9CA3AF]"
                      title="拖拽以重排序"
                    >
                      <GripVerticalIcon className="w-3 h-3" />
                      <span className="text-[10px] font-mono">{it.sortOrder}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `color-mix(in srgb, ${it.color} 12%, white)` }}
                    >
                      <LucideIcon name={it.icon} className="w-4 h-4" style={{ color: it.color }} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#1A1A1A]">{it.label}</div>
                    {it.url && (
                      <div className="text-[10px] text-[#9CA3AF] font-mono truncate max-w-[200px]">{it.url}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#6B7280] hidden md:table-cell">
                    <div className="line-clamp-1 max-w-[300px]">{it.desc ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    {it.common ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 font-bold">
                        <StarIcon className="w-2.5 h-2.5" /> 常用
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#C0C6D0]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleItemMut.mutate({ id: it.id, active: !it.active })}
                      title={it.active ? "禁用" : "启用"}
                      className="p-1 rounded hover:bg-[#F7F8FA]"
                    >
                      {it.active ? (
                        <PowerIcon className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <PowerOffIcon className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onEditItem(it)}
                      className="p-1 rounded hover:bg-[#F7F8FA] text-[#4B5563]"
                      title="编辑"
                    >
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => confirmDelete(it)}
                      className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 ml-0.5"
                      title="删除"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   CategoryDialog:分类新建 / 编辑
   ═══════════════════════════════════════ */
function CategoryDialog({
  mode, category, onClose, onSuccess,
}: {
  mode: "create" | "edit";
  category?: NavCategoryDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CreateNavCategoryInput>(
    category
      ? {
          code: category.code,
          label: category.label,
          color: category.color,
          bgLight: category.bgLight,
          icon: category.icon,
          sortOrder: category.sortOrder,
          active: category.active,
        }
      : {
          code: "",
          label: "",
          color: "#C8001E",
          bgLight: "#FFF5F5",
          icon: "FolderIcon",
          sortOrder: 0,
          active: true,
        },
  );

  const createMut = useMutation({
    mutationFn: (data: CreateNavCategoryInput) => navApi.createCategory(data),
    onSuccess: () => { toast.success("分类已创建"); onSuccess(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  const updateMut = useMutation({
    // code 在编辑模式下不可改 —— mutationFn 类型用 UpdateNavCategoryInput(不含 code),
    // 后端 ValidationPipe whitelist 会拒收多余字段,这里 TS 也帮忙挡一道
    mutationFn: (data: UpdateNavCategoryInput) =>
      navApi.updateCategory(category!.id, data),
    onSuccess: () => { toast.success("分类已更新"); onSuccess(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const deleteMut = useMutation({
    mutationFn: () => navApi.deleteCategory(category!.id),
    onSuccess: () => { toast.success("分类已删除"); onSuccess(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  function submit() {
    if (!form.label) {
      toast.error("显示名称必填");
      return;
    }
    if (mode === "create") {
      if (!form.code) {
        toast.error("标识码必填");
        return;
      }
      createMut.mutate(form);
    } else {
      // 编辑分类时把 code 剥掉再发,后端 UpdateNavCategoryDto 不接受这个字段
      const { code: _code, ...updateData } = form;
      updateMut.mutate(updateData);
    }
  }

  function tryDelete() {
    if (!category) return;
    if (!confirm(`确定删除分类"${category.label}"吗?\n该分类下的 ${category.items.length} 个项目也会一并删除,不可撤销。`)) return;
    deleteMut.mutate();
  }

  const submitting = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;

  return (
    <DialogShell title={mode === "create" ? "新建分类" : "编辑分类"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="标识码 (code)" required hint="程序内唯一标识,创建后不可改">
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="party-affairs"
            disabled={mode === "edit"}
            className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--party-primary)] disabled:bg-[#FAFAFA] disabled:text-[#9CA3AF]"
          />
        </Field>

        <Field label="显示名称" required>
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="党务办理"
            className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
          />
        </Field>

        <Field label="图标">
          <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} color={form.color} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="主色调">
            <ColorInput value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />
          </Field>
          <Field label="淡色背景">
            <ColorInput value={form.bgLight} onChange={(v) => setForm((f) => ({ ...f, bgLight: v }))} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="排序权重" hint="数字小靠前">
            <input
              type="number"
              value={form.sortOrder ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>
          <Field label="启用">
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span className="text-sm">{form.active ? "已启用" : "已禁用"}</span>
            </label>
          </Field>
        </div>
      </div>

      <DialogFooter>
        {mode === "edit" && (
          <button
            onClick={tryDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs rounded-md text-red-600 hover:bg-red-50 mr-auto disabled:opacity-40"
          >
            {deleting ? "删除中..." : "删除分类"}
          </button>
        )}
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] text-[#4B5563] hover:bg-[#F7F8FA]"
        >
          取消
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 text-xs rounded-md text-white flex items-center gap-1 disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-3.5 h-3.5" />
          {submitting ? "保存中..." : "保存"}
        </button>
      </DialogFooter>
    </DialogShell>
  );
}

/* ═══════════════════════════════════════
   ItemDialog:项目新建 / 编辑
   ═══════════════════════════════════════ */
function ItemDialog({
  mode, categoryId, categoryColor, item, onClose, onSuccess,
}: {
  mode: "create" | "edit";
  categoryId: string;
  categoryColor: string;
  item?: NavItemDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CreateNavItemInput>(
    item
      ? {
          icon: item.icon,
          label: item.label,
          color: item.color,
          url: item.url ?? "",
          desc: item.desc ?? "",
          common: item.common,
          likes: item.likes,
          views: item.views,
          sortOrder: item.sortOrder,
          active: item.active,
        }
      : {
          icon: "FileIcon",
          label: "",
          color: categoryColor,
          url: "",
          desc: "",
          common: false,
          likes: 0,
          views: 0,
          sortOrder: 0,
          active: true,
        },
  );

  const createMut = useMutation({
    mutationFn: (data: CreateNavItemInput) => navApi.createItem(categoryId, data),
    onSuccess: () => { toast.success("项目已创建"); onSuccess(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "创建失败"),
  });

  const updateMut = useMutation({
    mutationFn: (data: CreateNavItemInput) => navApi.updateItem(item!.id, data),
    onSuccess: () => { toast.success("项目已更新"); onSuccess(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  function submit() {
    if (!form.label) { toast.error("名称必填"); return; }
    if (mode === "create") createMut.mutate(form);
    else updateMut.mutate(form);
  }

  const submitting = createMut.isPending || updateMut.isPending;

  return (
    <DialogShell title={mode === "create" ? "新建项目" : "编辑项目"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="显示名称" required>
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="党费缴纳"
            className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
          />
        </Field>

        <Field label="图标">
          <IconPicker value={form.icon} onChange={(v) => setForm((f) => ({ ...f, icon: v }))} color={form.color} />
        </Field>

        <Field label="项目色">
          <ColorInput value={form.color} onChange={(v) => setForm((f) => ({ ...f, color: v }))} />
        </Field>

        <Field label="跳转 URL" hint="留空则点击仅 console.log。支持站内 /plugins/xxx 或外链 https://...">
          <input
            value={form.url ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="/plugins/dues  或  https://study.gov.cn"
            className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--party-primary)]"
          />
        </Field>

        <Field label="一行描述" hint="出现在卡片 hover 或某些视图下">
          <input
            value={form.desc ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))}
            placeholder="在线完成党费缴纳登记..."
            className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="排序">
            <input
              type="number"
              value={form.sortOrder ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>
          <Field label="点赞">
            <input
              type="number"
              value={form.likes ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, likes: Number(e.target.value) }))}
              className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>
          <Field label="浏览">
            <input
              type="number"
              value={form.views ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, views: Number(e.target.value) }))}
              className="w-full border border-[#E9E9E9] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.common ?? false}
              onChange={(e) => setForm((f) => ({ ...f, common: e.target.checked }))}
            />
            <span className="text-sm">常用项 (首页打"常用"标 + 入快捷条)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active ?? true}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            <span className="text-sm">启用</span>
          </label>
        </div>
      </div>

      <DialogFooter>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] text-[#4B5563] hover:bg-[#F7F8FA]"
        >
          取消
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 text-xs rounded-md text-white flex items-center gap-1 disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          <SaveIcon className="w-3.5 h-3.5" />
          {submitting ? "保存中..." : "保存"}
        </button>
      </DialogFooter>
    </DialogShell>
  );
}

/* ═══════════════════════════════════════
   通用 UI 小件
   ═══════════════════════════════════════ */
function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E9E9E9] flex-shrink-0">
          <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[#F0F0F0]">
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-[#1A1A1A] mb-1">
        {label}
        {required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
      </div>
      {children}
      {hint && <div className="text-[10px] text-[#9CA3AF] mt-1">{hint}</div>}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value.startsWith("#") ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded border border-[#E9E9E9] cursor-pointer p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#C8001E 或 rgb(...)"
        className="flex-1 border border-[#E9E9E9] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--party-primary)]"
      />
    </div>
  );
}
