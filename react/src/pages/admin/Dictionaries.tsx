import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookTextIcon, PlusIcon, SearchIcon, XIcon, TrashIcon,
  AlertCircleIcon, RefreshCwIcon, LockIcon, KeyIcon, EditIcon, CheckIcon,
  PowerIcon, PowerOffIcon,
} from "lucide-react";
import {
  dictionariesApi,
  buildDictTree,
  type DictionaryListItem,
  type DictionaryDetail,
  type DictItem,
  type CreateDictionaryInput,
  type CreateDictItemInput,
  type UpdateDictItemInput,
} from "../../api/dictionaries";
import {
  FolderIcon, FolderPlusIcon,
} from "lucide-react";
import { matchesPinyin, highlightMatch } from "../../lib/pinyinSearch";

const PARTY = "rgb(200, 0, 30)";
const PARTY_BG = "rgb(255, 240, 242)";
const ADMIN = "rgb(26, 107, 200)";

/* ═══════════════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════════════ */

export default function DictionariesPage() {
  const qc = useQueryClient();
  const dictsQuery = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => dictionariesApi.list(true),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (dictsQuery.data && dictsQuery.data.length > 0 && !selectedId) {
      setSelectedId(dictsQuery.data[0].id);
    }
  }, [dictsQuery.data, selectedId]);

  const filtered = useMemo(() => {
    if (!dictsQuery.data) return [];
    if (!search.trim()) return dictsQuery.data;
    return dictsQuery.data.filter(
      (d) => matchesPinyin(d.name, search) || matchesPinyin(d.code, search),
    );
  }, [dictsQuery.data, search]);

  const builtinList = filtered.filter((r) => r.builtin);
  const customList  = filtered.filter((r) => !r.builtin);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["dictionaries"] });
    qc.invalidateQueries({ queryKey: ["dictionary-detail"] });
  }

  return (
    <div className="h-full flex bg-white">
      {/* ════ 左侧:字典列表 ════ */}
      <aside className="w-72 flex-shrink-0 border-r border-[#E9E9E9] flex flex-col">
        <div className="px-3 py-2.5 border-b border-[#F0F0F0] flex items-center gap-2">
          <BookTextIcon className="w-4 h-4 text-[#C8001E]" />
          <span className="text-sm font-bold text-[#1A1A1A] flex-1">数据字典</span>
          <button
            onClick={refreshAll}
            className="p-1 rounded hover:bg-[#F7F8FA] text-[#6B7280]"
            title="刷新"
          >
            <RefreshCwIcon className="w-3 h-3" />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: PARTY }}
          >
            <PlusIcon className="w-3 h-3" />
            新建
          </button>
        </div>

        <div className="px-3 py-2 border-b border-[#F0F0F0]">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="搜索 (支持拼音)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[#C8001E] w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {dictsQuery.isLoading ? (
            <div className="p-4 text-xs text-[#9CA3AF] text-center">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-[#9CA3AF] text-center">无匹配字典</div>
          ) : (
            <>
              {builtinList.length > 0 && (
                <DictGroup
                  title="内置字典"
                  icon={LockIcon}
                  count={builtinList.length}
                  items={builtinList}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  searchQuery={search}
                />
              )}
              {customList.length > 0 && (
                <DictGroup
                  title="自定义字典"
                  icon={KeyIcon}
                  count={customList.length}
                  items={customList}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  searchQuery={search}
                />
              )}
            </>
          )}
        </div>
      </aside>

      {/* ════ 右侧:详情 ════ */}
      <main className="flex-1 min-w-0 flex flex-col">
        {selectedId ? (
          <DictionaryDetailView
            dictId={selectedId}
            onChanged={() => qc.invalidateQueries({ queryKey: ["dictionaries"] })}
            onDeleted={() => {
              setSelectedId(null);
              qc.invalidateQueries({ queryKey: ["dictionaries"] });
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[#9CA3AF]">
            从左侧选择一个字典查看 / 编辑
          </div>
        )}
      </main>

      {createOpen && (
        <CreateDictDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(d) => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ["dictionaries"] });
            setSelectedId(d.id);
          }}
        />
      )}
    </div>
  );
}

function DictGroup({
  title, icon: Icon, count, items, selectedId, onSelect, searchQuery,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  items: DictionaryListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F8FA] text-[10px] font-medium text-[#6B7280] sticky top-0">
        <Icon className="w-3 h-3" />
        <span>{title}</span>
        <span className="ml-auto text-[#9CA3AF]">{count}</span>
      </div>
      {items.map((d) => {
        const active = d.id === selectedId;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            className="w-full px-3 py-2 text-left border-b border-[#F0F0F0] hover:bg-[#FFF0F2] transition-colors flex items-center gap-2"
            style={{ backgroundColor: active ? PARTY_BG : undefined }}
          >
            <div
              className="w-1 h-8 rounded-full flex-shrink-0 transition-colors"
              style={{ backgroundColor: active ? PARTY : "transparent" }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#1A1A1A] flex items-center gap-1.5">
                <span className="truncate">
                  <HighlightedText text={d.name} query={searchQuery} />
                </span>
                {!d.active && (
                  <span className="text-[9px] px-1 py-px rounded bg-gray-100 text-gray-500">禁用</span>
                )}
              </div>
              <div className="text-[10px] text-[#9CA3AF] truncate font-mono">{d.code}</div>
            </div>
            <div className="text-[10px] text-[#9CA3AF]">{d.itemCount}</div>
          </button>
        );
      })}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {highlightMatch(text, query).map((s, i) =>
        s.highlight ? (
          <mark key={i} className="bg-yellow-200 text-[#1A1A1A] rounded px-0.5">{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Detail
   ═══════════════════════════════════════════════════════════════ */

function DictionaryDetailView({
  dictId, onChanged, onDeleted,
}: {
  dictId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["dictionary-detail", dictId],
    queryFn: () => dictionariesApi.get(dictId, true),
  });

  function afterMutate() {
    qc.invalidateQueries({ queryKey: ["dictionary-detail", dictId] });
    onChanged();
  }

  const dict = detailQuery.data;
  if (!dict) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[#9CA3AF]">
        {detailQuery.isLoading ? "加载中…" : "字典不存在"}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <DictHeader dict={dict} onChanged={afterMutate} onDeleted={onDeleted} />
      <ItemsList dict={dict} onChanged={afterMutate} />
    </div>
  );
}

/* ─── Header ─── */
function DictHeader({
  dict, onChanged, onDeleted,
}: {
  dict: DictionaryDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dict.name);
  const [description, setDescription] = useState(dict.description ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(dict.name);
    setDescription(dict.description ?? "");
    setEditing(false);
    setError(null);
  }, [dict.id]);

  const dirty = name !== dict.name || description !== (dict.description ?? "");

  const save = useMutation({
    mutationFn: () => dictionariesApi.update(dict.id, { name, description: description || undefined }),
    onSuccess: () => { setEditing(false); setError(null); onChanged(); },
    onError: extractError(setError),
  });

  const remove = useMutation({
    mutationFn: () => dictionariesApi.remove(dict.id),
    onSuccess: () => onDeleted(),
    onError: extractError(setError),
  });

  return (
    <div className="flex-shrink-0 px-5 py-4 border-b border-[#E9E9E9]">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: PARTY_BG }}>
          <BookTextIcon className="w-5 h-5" style={{ color: PARTY }} />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="字典名"
                className="text-base font-bold w-full px-2 py-1 border border-[#E9E9E9] rounded focus:outline-none focus:border-[#C8001E]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="字典描述"
                rows={2}
                className="text-xs w-full px-2 py-1 border border-[#E9E9E9] rounded focus:outline-none focus:border-[#C8001E] resize-none"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#1A1A1A]">{dict.name}</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F7F8FA] text-[#6B7280] font-mono">
                  {dict.code}
                </span>
                {dict.builtin ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-0.5">
                    <LockIcon className="w-2.5 h-2.5" /> 内置
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: PARTY_BG, color: PARTY }}>
                    自定义
                  </span>
                )}
              </div>
              <div className="text-xs text-[#6B7280] mt-1 leading-snug">
                {dict.description || <span className="text-[#D1D5DB] italic">无描述</span>}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-2.5 py-1 text-xs border border-[#E9E9E9] rounded hover:bg-[#F7F8FA]"
              >
                取消
              </button>
              <button
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
                className="px-3 py-1 text-xs text-white rounded disabled:opacity-50"
                style={{ backgroundColor: PARTY }}
              >
                {save.isPending ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 text-xs border border-[#E9E9E9] rounded hover:bg-[#F7F8FA]"
              >
                <EditIcon className="w-3 h-3 inline mr-1" />
                编辑
              </button>
              {!dict.builtin && (
                <button
                  onClick={() => {
                    if (confirm(`确定删除字典 "${dict.name}" 吗?其下 ${dict.items.length} 个项也会一并删除。此操作无法撤销。`)) {
                      remove.mutate();
                    }
                  }}
                  disabled={remove.isPending}
                  className="p-1.5 rounded text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="删除字典"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

/* ─── 项目列表 (2 级树形) ─── */
function ItemsList({ dict, onChanged }: { dict: DictionaryDetail; onChanged: () => void }) {
  const [addOpen, setAddOpen] = useState<null | { parentId: string | null }>(null);
  const [editingItem, setEditingItem] = useState<DictItem | null>(null);

  const tree = useMemo(() => buildDictTree(dict.items), [dict.items]);
  const totalItems = dict.items.length;
  const categoryCount = tree.categories.filter((c) => c.children.length > 0).length;
  const childCount = tree.categories.reduce((sum, c) => sum + c.children.length, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 px-5 py-2.5 border-b border-[#E9E9E9] flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-[#1A1A1A]">
          字典项 ({totalItems})
          {tree.hasCategories && (
            <span className="ml-2 text-[10px] font-normal text-[#9CA3AF]">
              {categoryCount} 个分类 · {childCount} 个二级项
            </span>
          )}
        </span>
        <span className="text-[10px] text-[#9CA3AF] flex-1 min-w-0">
          支持 2 级分类(分类下挂职务等具体值)。禁用项不在下拉中显示但保留数据
        </span>
        <button
          onClick={() => setAddOpen({ parentId: null })}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border"
          style={{ borderColor: ADMIN, color: ADMIN }}
        >
          <FolderPlusIcon className="w-3 h-3" />
          新增分类
        </button>
        <button
          onClick={() => setAddOpen({ parentId: tree.categories[0]?.id ?? null })}
          disabled={tree.categories.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
          title={tree.categories.length === 0 ? "请先新增分类" : ""}
        >
          <PlusIcon className="w-3 h-3" />
          新增项
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {totalItems === 0 ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">
            此字典暂无任何项目,点击右上"新增分类"开始
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#F7F8FA] z-10">
              <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
                <th className="px-4 py-2 font-medium w-16 text-right">排序</th>
                <th className="px-4 py-2 font-medium w-48">代码</th>
                <th className="px-4 py-2 font-medium">显示文字</th>
                <th className="px-4 py-2 font-medium">描述</th>
                <th className="px-4 py-2 font-medium w-20">状态</th>
                <th className="px-4 py-2 font-medium w-32 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tree.categories.map((cat) => (
                <Fragment key={cat.id}>
                  <ItemRow
                    item={cat}
                    isCategory
                    onEdit={() => setEditingItem(cat)}
                    onAddChild={() => setAddOpen({ parentId: cat.id })}
                    dictId={dict.id}
                    onChanged={onChanged}
                  />
                  {cat.children.map((ch) => (
                    <ItemRow
                      key={ch.id}
                      item={ch}
                      isCategory={false}
                      onEdit={() => setEditingItem(ch)}
                      dictId={dict.id}
                      onChanged={onChanged}
                    />
                  ))}
                </Fragment>
              ))}
              {tree.orphans.length > 0 && (
                <Fragment>
                  <tr><td colSpan={6} className="px-4 py-1.5 bg-amber-50 text-[10px] text-amber-700">
                    ⚠ 以下项目的父级不存在 (孤立数据,请编辑指定分类或删除)
                  </td></tr>
                  {tree.orphans.map((o) => (
                    <ItemRow
                      key={o.id}
                      item={o}
                      isCategory={false}
                      onEdit={() => setEditingItem(o)}
                      dictId={dict.id}
                      onChanged={onChanged}
                    />
                  ))}
                </Fragment>
              )}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <ItemDialog
          dictId={dict.id}
          mode="create"
          existingCodes={dict.items.map((i) => i.code)}
          categories={tree.categories}
          defaultParentId={addOpen.parentId}
          onClose={() => setAddOpen(null)}
          onSaved={() => {
            setAddOpen(null);
            onChanged();
          }}
        />
      )}
      {editingItem && (
        <ItemDialog
          dictId={dict.id}
          mode="edit"
          item={editingItem}
          existingCodes={dict.items.filter((i) => i.id !== editingItem.id).map((i) => i.code)}
          categories={tree.categories.filter((c) => c.id !== editingItem.id)}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ─── 单行 ─── */
function ItemRow({
  item, isCategory, onEdit, onAddChild, dictId, onChanged,
}: {
  item: DictItem;
  isCategory: boolean;
  onEdit: () => void;
  onAddChild?: () => void;
  dictId: string;
  onChanged: () => void;
}) {
  return (
    <tr
      className="border-b border-[#F0F0F0] hover:bg-[#FAFBFC]"
      style={isCategory ? { backgroundColor: "#FAFBFC" } : undefined}
    >
      <td className="px-4 py-2 text-xs text-[#9CA3AF] text-right">{item.sortOrder}</td>
      <td className="px-4 py-2 text-xs font-mono text-[#4B5563]">
        {!isCategory && <span className="text-[#D1D5DB] mr-1">└</span>}
        {item.code}
      </td>
      <td className="px-4 py-2 text-[13px] text-[#1A1A1A]">
        <div className="flex items-center gap-1.5">
          {isCategory ? (
            <FolderIcon className="w-3.5 h-3.5" style={{ color: ADMIN }} />
          ) : (
            <span className="w-3.5" />
          )}
          <span
            className={isCategory ? "font-bold" : "font-medium"}
            style={isCategory ? { color: ADMIN } : undefined}
          >
            {item.label}
          </span>
          {isCategory && (
            <span className="text-[9px] px-1 py-px rounded bg-[#EEF4FF]" style={{ color: ADMIN }}>
              分类
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-[11px] text-[#6B7280] truncate max-w-xs">
        {item.description || <span className="text-[#D1D5DB]">—</span>}
      </td>
      <td className="px-4 py-2">
        {item.active ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
            <PowerIcon className="w-2.5 h-2.5" /> 启用
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            <PowerOffIcon className="w-2.5 h-2.5" /> 禁用
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {isCategory && onAddChild && (
          <button
            onClick={onAddChild}
            className="p-1 rounded hover:bg-[#EEF4FF] text-[#6B7280]"
            style={{ color: ADMIN }}
            title="在此分类下新增项"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-1 rounded hover:bg-[#F7F8FA] text-[#6B7280] ml-0.5"
          title="编辑"
        >
          <EditIcon className="w-3.5 h-3.5" />
        </button>
        <DeleteItemButton dictId={dictId} item={item} onDeleted={onChanged} />
      </td>
    </tr>
  );
}

function DeleteItemButton({
  dictId, item, onDeleted,
}: {
  dictId: string;
  item: DictItem;
  onDeleted: () => void;
}) {
  const remove = useMutation({
    mutationFn: () => dictionariesApi.removeItem(dictId, item.id),
    onSuccess: onDeleted,
  });
  return (
    <button
      onClick={() => {
        if (confirm(`确定删除 "${item.label}" 吗?`)) remove.mutate();
      }}
      disabled={remove.isPending}
      className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 disabled:opacity-50 ml-1"
      title="删除"
    >
      <TrashIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/* ─── 字典项 新建/编辑 对话框 ─── */
function ItemDialog({
  dictId, mode, item, existingCodes, categories, defaultParentId, onClose, onSaved,
}: {
  dictId: string;
  mode: "create" | "edit";
  item?: DictItem;
  existingCodes: string[];
  categories: DictItem[];        // 可用分类 (新建时全部 / 编辑时排除自己)
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? 0);
  const [active, setActive] = useState(item?.active ?? true);
  const [parentId, setParentId] = useState<string | null>(
    item?.parentId ?? (defaultParentId !== undefined ? defaultParentId : null),
  );
  const [error, setError] = useState<string | null>(null);

  // 编辑分类(自身被作为父级引用)时不允许降级
  const isUsedCategory = mode === "edit" && item?.parentId === null &&
    categories.length >= 0 && false; // 简化:让后端校验,UI 提示即可

  const save = useMutation({
    mutationFn: () => {
      if (mode === "create") {
        const input: CreateDictItemInput = {
          code: code.trim(),
          label: label.trim(),
          description: description.trim() || undefined,
          sortOrder,
          active,
          parentId,
        };
        return dictionariesApi.createItem(dictId, input);
      } else {
        const input: UpdateDictItemInput = {
          label: label.trim(),
          description: description.trim() || undefined,
          sortOrder,
          active,
          parentId,
        };
        return dictionariesApi.updateItem(dictId, item!.id, input);
      }
    },
    onSuccess: onSaved,
    onError: extractError(setError),
  });

  const codeDup = mode === "create" && existingCodes.includes(code.trim());
  const canSubmit = label.trim().length >= 1 && (mode === "edit" || (/^[a-z0-9_]+$/i.test(code) && !codeDup));

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canSubmit && !save.isPending && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      save.mutate();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-md bg-white rounded-xl shadow-2xl pointer-events-auto"
          onKeyDown={handleKeyDown}
        >
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A]">
              {mode === "create"
                ? (parentId === null ? "新增分类" : "新增字典项")
                : `编辑 "${item?.label}"`}
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <Field label="层级">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setParentId(null)}
                  disabled={isUsedCategory}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: parentId === null ? ADMIN : "#E9E9E9",
                    backgroundColor: parentId === null ? "#EEF4FF" : "white",
                    color: parentId === null ? ADMIN : "#4B5563",
                  }}
                >
                  <FolderIcon className="w-3 h-3 inline mr-1" />
                  作为分类(根级)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setParentId(parentId ?? categories[0]?.id ?? null)
                  }
                  disabled={categories.length === 0}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: parentId !== null ? PARTY : "#E9E9E9",
                    backgroundColor: parentId !== null ? PARTY_BG : "white",
                    color: parentId !== null ? PARTY : "#4B5563",
                  }}
                >
                  作为分类下的项
                </button>
              </div>
            </Field>
            {parentId !== null && (
              <Field label="归属分类 *">
                <select
                  value={parentId ?? ""}
                  onChange={(e) => setParentId(e.target.value || null)}
                  className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
                >
                  {categories.length === 0 ? (
                    <option value="">(无可用分类,请先新增)</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  )}
                </select>
              </Field>
            )}
            <Field label="代码 *" hint={mode === "edit" ? "代码不可修改" : "字母数字下划线,组内唯一"}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={mode === "edit"}
                placeholder={parentId === null ? "如 mgmt" : "如 manager"}
                className="w-full px-2.5 py-1.5 text-sm font-mono border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E] disabled:bg-[#F7F8FA]"
              />
              {codeDup && <p className="text-[10px] text-red-600 mt-1">代码已被其它项占用</p>}
            </Field>
            <Field label="显示文字 *">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={parentId === null ? "如 管理类" : "如 经理"}
                autoFocus
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
              />
            </Field>
            <Field label="描述">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="排序">
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
                />
              </Field>
              <Field label="状态">
                <label className="flex items-center gap-2 text-sm h-[34px]">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  启用
                </label>
              </Field>
            </div>
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#F0F0F0] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              取消
            </button>
            <button
              disabled={!canSubmit || save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
              style={{ backgroundColor: PARTY }}
              title="回车保存"
            >
              <CheckIcon className="w-3 h-3 inline mr-0.5" />
              {save.isPending ? "保存中…" : "保存"} <span className="text-[9px] opacity-70">↵</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── 新建字典对话框 ─── */
function CreateDictDialog({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (d: DictionaryDetail) => void;
}) {
  const [form, setForm] = useState<CreateDictionaryInput>({ code: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      dictionariesApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
      }),
    onSuccess: (d) => onCreated(d),
    onError: extractError(setError),
  });

  const canSubmit = /^[a-z][a-z0-9_]{1,59}$/.test(form.code) && form.name.trim().length >= 1;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl pointer-events-auto">
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
              <BookTextIcon className="w-4 h-4 text-[#C8001E]" />
              新建字典
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <Field label="字典代码 *" hint="小写字母数字下划线,首位字母,如 contract_type">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="如 contract_type"
                className="w-full px-2.5 py-1.5 text-sm font-mono border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
              />
            </Field>
            <Field label="显示名 *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 合同类型"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E]"
              />
            </Field>
            <Field label="描述">
              <textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="说明这个字典用于哪些场景"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[#C8001E] resize-none"
              />
            </Field>
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
                <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#F0F0F0] flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              取消
            </button>
            <button
              disabled={!canSubmit || create.isPending}
              onClick={() => create.mutate()}
              className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
              style={{ backgroundColor: PARTY }}
            >
              {create.isPending ? "创建中…" : "创建"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── 辅助 ─── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs font-medium text-[#4B5563]">{label}</span>
        {hint && <span className="text-[10px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function extractError(setError: (s: string | null) => void) {
  return (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
    const msg = err.response?.data?.message;
    setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "操作失败");
  };
}
