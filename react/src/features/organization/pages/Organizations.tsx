import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  Edit2Icon,
  Trash2Icon,
  RefreshCwIcon,
  XIcon,
  CheckIcon,
  AlertTriangleIcon,
  FlagIcon,
  BuildingIcon,
  SparklesIcon,
  UsersIcon,
  UserPlusIcon,
  Loader2Icon,
  GripVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import {
  organizationsApi,
  ORG_TYPE_LABELS,
  ORG_TYPE_COLORS,
  PARTY_TYPE_OPTIONS,
  ADMIN_TYPE_OPTIONS,
  type OrgTreeNode,
  type OrgType,
  type OrgKind,
  type OrgLink,
  type OrgMember,
  type CreateOrgInput,
  type UpdateOrgInput,
  type MovePosition,
} from "@/features/organization";
import { usersApi } from "@/features/user";
import { matchesPinyin, highlightMatch } from "@/shared/lib/pinyinSearch";
import { toast } from "sonner";

interface EditingState {
  mode: "create" | "edit";
  kind: OrgKind;
  parentId?: string | null;
  parentName?: string;
  target?: OrgTreeNode;
}

interface DragState {
  draggedId: string | null;
  draggedKind: OrgKind | null;
  /** 鼠标当前 hover 在哪个节点的哪个相对位置 */
  hover: { id: string; position: MovePosition } | null;
}

const KIND_META: Record<OrgKind, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  party: { label: "党组织", icon: FlagIcon,     color: "var(--party-primary)", bg: "rgb(255, 245, 245)" },
  admin: { label: "行政机构", icon: BuildingIcon, color: "rgb(26, 107, 200)", bg: "rgb(238, 244, 255)" },
};

/** axios / Error 错误体 → 人话(NestJS 校验 message 可能是 string[]) */
function errMsgOf(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string } | null;
  const msg = err?.response?.data?.message ?? err?.message ?? fallback;
  return Array.isArray(msg) ? msg.join("\n") : msg;
}

export default function OrganizationsPage() {
  const [kind, setKind] = useState<OrgKind>("admin");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [confirmDel, setConfirmDel] = useState<OrgTreeNode | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [drag, setDrag] = useState<DragState>({ draggedId: null, draggedKind: null, hover: null });
  const [moving, setMoving] = useState(false);
  const [search, setSearch] = useState("");

  /* ── 树加载:按「参数 key」存结果,loading = 已加载 key ≠ 当前请求 key(渲染期派生,
        免 effect 内同步 setLoading);reload = tick+1 触发重拉 ── */
  const [loadTick, setLoadTick] = useState(0);
  const [loadedTree, setLoadedTree] = useState<{ key: string; tree: OrgTreeNode[] } | null>(null);
  const reqKey = `${kind}|${showInactive}|${loadTick}`;
  const tree = useMemo(() => loadedTree?.tree ?? [], [loadedTree]);
  const loading = loadedTree?.key !== reqKey;

  useEffect(() => {
    let alive = true;
    organizationsApi
      .tree(kind, showInactive)
      .then((t) => {
        if (!alive) return;
        setLoadedTree({ key: reqKey, tree: t });
        setError(null);
        // 默认展开全部有子节点的层级
        const ids = new Set<string>();
        const walk = (n: OrgTreeNode) => {
          if (n.children.length > 0) {
            ids.add(n.id);
            n.children.forEach(walk);
          }
        };
        t.forEach(walk);
        setExpanded(ids);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(errMsgOf(e, "加载失败"));
        setLoadedTree({ key: reqKey, tree: [] });
      });
    return () => {
      alive = false;
    };
  }, [kind, showInactive, reqKey]);

  /** 重拉当前参数的树(写操作成功后调用) */
  function reload() {
    setLoadTick((t) => t + 1);
  }

  const flatCount = useMemo(() => {
    const count = (nodes: OrgTreeNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + count(n.children), 0);
    return count(tree);
  }, [tree]);

  /** 按搜索过滤树:保留命中节点 + 所有祖先,删去无关分支 */
  const filteredTree = useMemo(() => {
    const q = search.trim();
    if (!q) return tree;

    const filter = (node: OrgTreeNode): OrgTreeNode | null => {
      const selfHit = matchesPinyin(node.name, q);
      const filteredChildren = node.children
        .map(filter)
        .filter((c): c is OrgTreeNode => c !== null);
      if (selfHit || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    };
    return tree.map(filter).filter((n): n is OrgTreeNode => n !== null);
  }, [tree, search]);

  const matchCount = useMemo(() => {
    if (!search.trim()) return 0;
    let n = 0;
    const walk = (node: OrgTreeNode) => {
      if (matchesPinyin(node.name, search)) n++;
      node.children.forEach(walk);
    };
    tree.forEach(walk);
    return n;
  }, [tree, search]);

  /** 搜索时强制展开所有可见节点;无搜索时用用户控制的 expanded */
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expanded;
    const ids = new Set<string>(expanded);
    const collect = (n: OrgTreeNode) => {
      if (n.children.length > 0) {
        ids.add(n.id);
        n.children.forEach(collect);
      }
    };
    filteredTree.forEach(collect);
    return ids;
  }, [filteredTree, search, expanded]);

  const inactiveCount = useMemo(() => {
    const walk = (nodes: OrgTreeNode[]): number =>
      nodes.reduce((acc, n) => acc + (n.active ? 0 : 1) + walk(n.children), 0);
    return walk(tree);
  }, [tree]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(payload: CreateOrgInput | UpdateOrgInput) {
    if (!editing) return;
    try {
      if (editing.mode === "create") {
        await organizationsApi.create({
          ...(payload as CreateOrgInput),
          kind: editing.kind,
          parentId: editing.parentId ?? null,
        });
      } else if (editing.target) {
        await organizationsApi.update(editing.target.id, payload);
      }
      setEditing(null);
      reload();
    } catch (e: unknown) {
      alert(errMsgOf(e, "保存失败"));
    }
  }

  async function handleDelete(hard: boolean) {
    if (!confirmDel) return;
    try {
      await organizationsApi.remove(confirmDel.id, hard);
      setConfirmDel(null);
      reload();
    } catch (e: unknown) {
      alert(errMsgOf(e, "删除失败"));
    }
  }

  /** 恢复已停用 (软删除的反向操作) */
  async function handleRestore(node: OrgTreeNode) {
    try {
      await organizationsApi.update(node.id, { active: true });
      reload();
    } catch (e: unknown) {
      alert(errMsgOf(e, "恢复失败"));
    }
  }

  /* ─── 拖拽事件 ─── */
  function onDragStart(node: OrgTreeNode) {
    setDrag({ draggedId: node.id, draggedKind: node.kind, hover: null });
  }
  function onDragEnd() {
    setDrag({ draggedId: null, draggedKind: null, hover: null });
  }
  function onDragOverRow(e: React.DragEvent, node: OrgTreeNode) {
    if (!drag.draggedId || drag.draggedId === node.id) return;
    if (drag.draggedKind && drag.draggedKind !== node.kind) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let position: MovePosition;
    if (y < h * 0.25) position = "before";
    else if (y > h * 0.75) position = "after";
    else position = "inside";
    setDrag((s) => ({ ...s, hover: { id: node.id, position } }));
  }
  function onDragLeaveRow(node: OrgTreeNode) {
    setDrag((s) => (s.hover?.id === node.id ? { ...s, hover: null } : s));
  }
  async function onDropRow(node: OrgTreeNode) {
    const src = drag.draggedId;
    const hover = drag.hover;
    setDrag({ draggedId: null, draggedKind: null, hover: null });
    if (!src || !hover || hover.id !== node.id) return;
    if (src === node.id) return;
    setMoving(true);
    try {
      await organizationsApi.move(src, hover.id, hover.position);
      reload();
    } catch (e: unknown) {
      alert(errMsgOf(e, "移动失败"));
    } finally {
      setMoving(false);
    }
  }

  const meta = KIND_META[kind];

  return (
    <div className="p-6 max-w-[1200px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">组织管理</h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            可拖拽节点调整排序 / 上下级关系。党组织和行政机构两套并行,不能跨树拖拽。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
              showInactive
                ? "bg-orange-50 text-orange-600 border-orange-200"
                : "text-[#6B7280] border-[#E9E9E9] hover:border-[#F5A0A8]"
            }`}
            title={showInactive ? "正在显示已停用组织" : "切换显示已停用组织"}
          >
            {showInactive ? <EyeIcon className="w-3.5 h-3.5" /> : <EyeOffIcon className="w-3.5 h-3.5" />}
            {showInactive ? "正在显示已停用" : "显示已停用"}
            {showInactive && inactiveCount > 0 && (
              <span className="text-[10px] font-bold bg-orange-200 text-orange-700 px-1 rounded">
                {inactiveCount}
              </span>
            )}
          </button>
          <button
            onClick={reload}
            disabled={loading || moving}
            className="flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[var(--party-primary)] px-3 py-1.5 rounded-md border border-[#E9E9E9] hover:border-[#F5A0A8] transition-colors"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${loading || moving ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button
            onClick={() => setEditing({ mode: "create", kind, parentId: null })}
            className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-md font-medium transition-colors"
            style={{ backgroundColor: meta.color }}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            新建{meta.label}根节点
          </button>
        </div>
      </div>

      {/* Kind Tabs + Search */}
      <div className="flex items-center mb-4 gap-3">
        <div className="flex gap-2">
          {(["admin", "party"] as OrgKind[]).map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            const active = k === kind;
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-2"
                style={{
                  backgroundColor: active ? m.bg : "white",
                  borderColor: active ? m.color : "#E9E9E9",
                  color: active ? m.color : "#6B7280",
                }}
              >
                <Icon className="w-4 h-4" />
                {m.label}
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    backgroundColor: active ? m.color : "#F0F0F0",
                    color: active ? "white" : "#9CA3AF",
                  }}
                >
                  {active ? flatCount : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {/* 搜索框 — 中文 / 拼音 / 首字母 */}
        <div className="relative ml-auto w-72">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
            placeholder="搜索组织(中文 / dangwei / dw)"
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-[#E9E9E9] bg-white focus:outline-none focus:border-[var(--party-primary)] focus:ring-2 focus:ring-party-primary-10 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-[#F0F0F0] text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors"
              title="清空 (Esc)"
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
          {search && (
            <div className="absolute -bottom-5 left-2 text-[10px] text-[#9CA3AF]">
              命中 <span className="font-semibold text-[var(--party-primary)]">{matchCount}</span> 个组织
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠ {error}
        </div>
      )}

      {/* Tree */}
      <div className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden relative">
        {moving && (
          <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
            <div className="text-xs text-[#6B7280] flex items-center gap-2">
              <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" /> 移动中...
            </div>
          </div>
        )}
        {loading && tree.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9CA3AF]">加载中...</div>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9CA3AF]">
            暂无{meta.label},点击右上角新建
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9CA3AF]">
            未找到与「<span className="text-[var(--party-primary)] font-semibold">{search}</span>」匹配的组织
          </div>
        ) : (
          <div className="py-1">
            {filteredTree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                expanded={effectiveExpanded}
                drag={drag}
                searchQuery={search}
                onToggle={toggle}
                onAddChild={(parent) =>
                  setEditing({
                    mode: "create",
                    kind: parent.kind,
                    parentId: parent.id,
                    parentName: parent.name,
                  })
                }
                onEdit={(n) => setEditing({ mode: "edit", kind: n.kind, target: n })}
                onDelete={(n) => setConfirmDel(n)}
                onRestore={handleRestore}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOverRow={onDragOverRow}
                onDragLeaveRow={onDragLeaveRow}
                onDropRow={onDropRow}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <OrgFormModal
          editing={editing}
          tree={tree}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          onMembersChanged={reload}
        />
      )}

      {confirmDel && (
        <DeleteConfirmModal
          target={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

/* ─── Tree node row ─── */
function TreeNode({
  node, depth, expanded, drag, searchQuery,
  onToggle, onAddChild, onEdit, onDelete, onRestore,
  onDragStart, onDragEnd, onDragOverRow, onDragLeaveRow, onDropRow,
}: {
  node: OrgTreeNode;
  depth: number;
  expanded: Set<string>;
  drag: DragState;
  searchQuery: string;
  onToggle: (id: string) => void;
  onAddChild: (n: OrgTreeNode) => void;
  onEdit: (n: OrgTreeNode) => void;
  onDelete: (n: OrgTreeNode) => void;
  onRestore: (n: OrgTreeNode) => void;
  onDragStart: (n: OrgTreeNode) => void;
  onDragEnd: () => void;
  onDragOverRow: (e: React.DragEvent, n: OrgTreeNode) => void;
  onDragLeaveRow: (n: OrgTreeNode) => void;
  onDropRow: (n: OrgTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const color = ORG_TYPE_COLORS[node.type as OrgType] ?? "#6B7280";
  const isDragged = drag.draggedId === node.id;
  const hoverHere = drag.hover?.id === node.id ? drag.hover.position : null;
  const nameSegments = highlightMatch(node.name, searchQuery);
  const isMatch = searchQuery.trim() && matchesPinyin(node.name, searchQuery);

  return (
    <>
      <div
        draggable
        onDragStart={() => onDragStart(node)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOverRow(e, node)}
        onDragLeave={() => onDragLeaveRow(node)}
        onDrop={() => onDropRow(node)}
        className="relative flex items-center gap-2 py-2 px-3 hover:bg-[#FAFBFC] border-b border-[#F5F5F5] group"
        style={{
          paddingLeft: `${12 + depth * 24}px`,
          opacity: isDragged ? 0.4 : 1,
          backgroundColor: hoverHere === "inside" ? "rgba(200,0,30,0.06)" : undefined,
          cursor: drag.draggedId ? "grabbing" : undefined,
        }}
      >
        {/* 拖入指示线:上方 */}
        {hoverHere === "before" && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-[var(--party-primary)] pointer-events-none" />
        )}
        {/* 拖入指示线:下方 */}
        {hoverHere === "after" && (
          <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-[var(--party-primary)] pointer-events-none" />
        )}

        {/* 拖拽手柄 */}
        <GripVerticalIcon className="w-3 h-3 text-[#C0C6D0] cursor-grab flex-shrink-0" />

        {/* 折叠按钮 */}
        <button
          onClick={() => hasChildren && onToggle(node.id)}
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            hasChildren ? "hover:bg-[#F0F0F0] text-[#6B7280]" : "text-transparent"
          }`}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />
          ) : (
            <span className="w-1 h-1 rounded-full bg-[#D1D5DB]" />
          )}
        </button>

        {/* 类型徽标 — 只对党组织显示 */}
        {node.kind === "party" && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {ORG_TYPE_LABELS[node.type as OrgType] ?? node.type}
          </span>
        )}

        {/* 虚拟徽标 */}
        {node.isVirtual && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">
            <SparklesIcon className="w-2.5 h-2.5" />
            虚拟
          </span>
        )}
        {/* 部门徽标 */}
        {node.isDept && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 flex-shrink-0">
            <BuildingIcon className="w-2.5 h-2.5" />
            部门
          </span>
        )}

        {/* 名称 (含搜索高亮) */}
        <span
          onClick={() => node.active && onEdit(node)}
          title={node.active ? "点击编辑属性 / 设置对口" : undefined}
          className={`text-sm flex-1 min-w-0 truncate ${node.active ? "text-[#1A1A1A] cursor-pointer hover:text-[var(--party-primary)] hover:underline decoration-dotted underline-offset-2" : "text-[#9CA3AF] line-through"} ${isMatch ? "font-semibold" : ""}`}
        >
          {nameSegments.map((seg, i) =>
            seg.highlight ? (
              <mark key={i} className="bg-yellow-200 text-[#1A1A1A] rounded-sm px-0.5">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </span>

        {/* 已停用徽标 */}
        {!node.active && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex-shrink-0">
            已停用
          </span>
        )}

        <span className="text-[10px] text-[#C0C6D0] font-mono flex-shrink-0">{node.code}</span>

        {/* 成员数 */}
        <span
          className="flex items-center gap-1 text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "#F7F8FA", color: "#6B7280" }}
          title={`直接成员 ${node.directMembers} 人 · 含下级共 ${node.transitiveMembers} 人`}
        >
          <UsersIcon className="w-3 h-3" />
          <span className="font-semibold" style={{ color: node.directMembers > 0 ? "#1A1A1A" : "#C0C6D0" }}>
            {node.directMembers}
          </span>
          {node.transitiveMembers > node.directMembers && (
            <span className="text-[#9CA3AF]">/ {node.transitiveMembers}</span>
          )}
        </span>

        {/* 行动按钮 */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
          {!node.active && (
            <button
              onClick={() => onRestore(node)}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-green-50 text-green-600"
              title="恢复"
            >
              <RotateCcwIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {node.active && (
            <>
              <button
                onClick={() => onAddChild(node)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F0F0F0] text-[#6B7280]"
                title="新建子组织"
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onEdit(node)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F0F0F0] text-[#6B7280]"
                title="编辑"
              >
                <Edit2Icon className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(node)}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-50 text-red-500"
            title="删除"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <>
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              drag={drag}
              searchQuery={searchQuery}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onRestore={onRestore}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverRow={onDragOverRow}
              onDragLeaveRow={onDragLeaveRow}
              onDropRow={onDropRow}
            />
          ))}
        </>
      )}
    </>
  );
}

/* ─── Form modal ─── */
function OrgFormModal({
  editing, tree, onCancel, onSave, onMembersChanged,
}: {
  editing: EditingState;
  tree: OrgTreeNode[];
  onCancel: () => void;
  onSave: (input: CreateOrgInput | UpdateOrgInput) => void;
  onMembersChanged: () => void;
}) {
  const isEdit = editing.mode === "edit";
  const init = editing.target;
  const kindMeta = KIND_META[editing.kind];
  const isParty = editing.kind === "party";
  const isAdmin = editing.kind === "admin";
  // 行政机构编辑态:抽屉内分「基本属性 / 成员」两个 tab(成员改动即时生效)
  const showMembers = isAdmin && isEdit && !!init;
  // 关联机构 tab:党组织↔行政机构(N:M;党委/党总支当前 1:1),编辑态双向手动维护
  const showLinks = isEdit && !!init;
  const hasTabs = showMembers || showLinks;
  const [activeTab, setActiveTab] = useState<"basic" | "members" | "links">("basic");
  const TYPE_OPTIONS = isParty ? PARTY_TYPE_OPTIONS : ADMIN_TYPE_OPTIONS;
  const defaultType: OrgType = isParty ? "branch" : "level2";

  const [form, setForm] = useState({
    name: init?.name ?? "",
    fullName: init?.fullName ?? "",
    code: init?.code ?? "",
    type: (init?.type ?? defaultType) as OrgType,
    isVirtual: init?.isVirtual ?? false,
    isDept: init?.isDept ?? false,
    active: init?.active ?? true,
  });
  // 对口上级机构(行政机构属性,多对多 / 专业线,存 meta.counterpartParentOrgIds)
  const [counterparts, setCounterparts] = useState<string[]>(readCounterparts(init?.meta));
  // 部门负责人(平级确认用,存 meta.ownerUserId);候选 = 本部门成员
  const [ownerUserId, setOwnerUserId] = useState<string>(readOwner(init?.meta));
  const ownerCandidatesQuery = useQuery({
    queryKey: ["org-members", init?.id],
    queryFn: () => organizationsApi.members(init?.id as string, true),
    enabled: !!init?.id && isAdmin && form.isDept,
  });
  // 「下级承接部门」默认折叠(可能几十个);点击展开 + 多时可筛选
  const [showDownstream, setShowDownstream] = useState(false);
  const [dsFilter, setDsFilter] = useState("");

  // 对下 = 把「对口上级」指向本机构的下级机构(带上所属单位,区分同名部门)
  const flat = flattenOrgs(tree);
  const parentByChild = new Map<string, OrgTreeNode>();
  const indexParents = (n: OrgTreeNode) =>
    n.children.forEach((c) => {
      parentByChild.set(c.id, n);
      indexParents(c);
    });
  tree.forEach(indexParents);
  /** 某机构所属「单位」名(最近的非虚拟、非部门祖先;兜底取直接父级) */
  const unitNameOf = (id: string): string => {
    let cur = parentByChild.get(id);
    const direct = cur;
    while (cur) {
      if (!cur.isVirtual && !cur.isDept) return cur.name;
      cur = parentByChild.get(cur.id);
    }
    return direct?.name ?? "";
  };
  // 按组织树顺序排(flat 即树的前序遍历,已按各级 sortOrder),便于对照机构树筛查
  const orderIndex = new Map(flat.map((o, i) => [o.id, i]));
  const downstream = (init ? flat.filter((o) => readCounterparts(o.meta).includes(init.id)) : [])
    .map((o) => ({ ...o, unit: unitNameOf(o.id) }))
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  const dsq = dsFilter.trim();
  const filteredDownstream = dsq
    ? downstream.filter((o) => o.name.includes(dsq) || o.unit.includes(dsq))
    : downstream;

  const valid = form.name.trim().length > 0 && form.code.trim().length > 0;

  function handleSubmit() {
    if (!valid) return;
    const payload: Record<string, unknown> = { ...form };
    payload.fullName = form.fullName.trim() || null; // 空全称存 null,不落空串
    if (isAdmin) payload.meta = buildMeta(init?.meta, counterparts, form.isDept ? ownerUserId : ""); // 行政机构带对口 + 部门负责人
    onSave(payload);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Enter (非 textarea / shift+enter) 触发保存;Esc 取消
    if (e.key === "Enter" && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCancel}>
      <div
        className="bg-white shadow-2xl w-[480px] max-w-[92vw] h-screen flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div
          className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-[#E9E9E9]"
          style={{ borderTopColor: kindMeta.color, borderTopWidth: 3, borderTopStyle: "solid" }}
        >
          <div className="flex items-center gap-2">
            <kindMeta.icon className="w-4 h-4" style={{ color: kindMeta.color }} />
            <h3 className="text-base font-bold text-[#1A1A1A]">
              {isEdit ? "编辑" : "新建"}{kindMeta.label}
            </h3>
          </div>
          <button onClick={onCancel} className="text-[#9CA3AF] hover:text-[#1A1A1A]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {hasTabs && (
          <div className="flex-shrink-0 flex gap-1 px-5 pt-2 border-b border-[#E9E9E9]">
            {(() => {
              const tabs: ["basic" | "members" | "links", string][] = [["basic", "基本属性"]];
              if (showMembers) tabs.push(["members", "成员"]);
              if (showLinks) tabs.push(["links", "关联机构"]);
              return tabs.map(([id, label]) => {
                const on = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                    style={{
                      borderColor: on ? kindMeta.color : "transparent",
                      color: on ? kindMeta.color : "#6B7280",
                    }}
                  >
                    {label}
                  </button>
                );
              });
            })()}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          {(!hasTabs || activeTab === "basic") && (
          <div className="flex-1 overflow-auto p-5 flex flex-col gap-3.5">
          {editing.mode === "create" && (
            <p className="text-xs text-[#6B7280] bg-[#F7F8FA] px-3 py-2 rounded">
              {editing.parentId
                ? <>挂载到:<span className="text-[#1A1A1A] font-semibold">{editing.parentName}</span></>
                : `作为${kindMeta.label}根节点(无上级)`}
            </p>
          )}

          <Field label={isParty ? "名称(简称)" : "名称"} required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={editing.kind === "party" ? "如:第一党支部·机关综合处" : "如:财务审计处"}
              className="w-full px-3 py-2 text-sm rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>

          <Field label="全称">
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder={editing.kind === "party" ? "如:中共××有限公司××分公司委员会" : "如:××有限公司财务审计处"}
              className="w-full px-3 py-2 text-sm rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1 leading-snug">
              日常组织树显示「名称(简称)」;全称用于证书 / 公文 / 印章等正式场合,可留空。
            </p>
          </Field>

          <Field label="编码" required>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder={editing.kind === "party" ? "PARTY-BR-11" : "ADMIN-NEW"}
              className="w-full px-3 py-2 text-sm rounded-md border border-[#E9E9E9] font-mono focus:outline-none focus:border-[var(--party-primary)]"
            />
          </Field>

          <Field label={isParty ? "类型" : "单位层级"} required>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as OrgType })}
              className="w-full px-3 py-2 text-sm rounded-md border border-[#E9E9E9] bg-white focus:outline-none focus:border-[var(--party-primary)]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {!isParty && (
              <p className="text-[10px] text-[#9CA3AF] mt-1 leading-snug">
                一级=公司 · 二级=分公司 / 总部部门 · 三级=配送中心 / 车队 / 二级部门 · 四级=项目部 / 班组
              </p>
            )}
          </Field>

          <Field label="性质">
            <label className="flex items-start gap-2 px-3 py-2.5 rounded-md border border-[#E9E9E9] hover:border-violet-300 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={form.isVirtual}
                onChange={(e) => setForm({ ...form, isVirtual: e.target.checked })}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <SparklesIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span className="font-medium text-[#1A1A1A]">虚拟组织</span>
                </div>
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                  专班 / 项目组 / 突击队等临时性组织。成员可跨实体组织灵活进出。
                </p>
              </div>
            </label>
            {isAdmin && (
              <label className="flex items-start gap-2 px-3 py-2.5 mt-2 rounded-md border border-[#E9E9E9] hover:border-teal-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDept}
                  onChange={(e) => setForm({ ...form, isDept: e.target.checked })}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    <BuildingIcon className="w-3.5 h-3.5" style={{ color: "rgb(13,148,136)" }} />
                    <span className="font-medium text-[#1A1A1A]">部门</span>
                  </div>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                    勾上 = 单位内部职能部门(综合办公室 / 科室等),与「几级单位」正交。配对口责任部门时只能选「部门」。
                  </p>
                </div>
              </label>
            )}
          </Field>

          {isEdit && (
            <Field label="状态">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                启用
              </label>
            </Field>
          )}

          {isAdmin && (
            <Field label="对口上级机构">
              <OrgCounterpartField
                tree={tree}
                value={counterparts}
                onChange={setCounterparts}
                excludeId={init?.id}
              />
              <p className="text-[10px] text-[#9CA3AF] mt-1 leading-snug">
                可多选(专业线):本部门对口承接这些机关部门派来的任务。点「选择」搜索点选,可设多个上级(接收认领下一步开放)。
              </p>
            </Field>
          )}

          {isAdmin && isEdit && form.isDept && (
            <Field label="负责人">
              <select
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]"
              >
                <option value="">(未指定)</option>
                {(ownerCandidatesQuery.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}（{m.username}）
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#9CA3AF] mt-1 leading-snug">
                部门负责人 —— 跨部门(机关↔机关)互派任务时,需<b>双方负责人</b>确认同意才生效(平级确认)。
              </p>
            </Field>
          )}

          {isAdmin && isEdit && downstream.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowDownstream((v) => !v)}
                className="flex items-center gap-1.5 w-full text-[13px] font-medium text-[#374151] hover:text-[#1d4ed8]"
              >
                {showDownstream ? (
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                )}
                下级承接部门
                <span className="text-[11px] px-1.5 py-px rounded-full bg-[#eef4ff] text-[#1d4ed8]">
                  {downstream.length}
                </span>
                {!showDownstream && (
                  <span className="text-[11px] text-[#9CA3AF] font-normal ml-auto">点击展开</span>
                )}
              </button>
              {showDownstream && (
                <div className="space-y-1.5">
                  {downstream.length > 12 && (
                    <input
                      value={dsFilter}
                      onChange={(e) => setDsFilter(e.target.value)}
                      placeholder="筛选单位 / 部门"
                      className="w-full text-[12px] rounded-md border border-[#dce4ef] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-party-primary-20"
                    />
                  )}
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-auto p-0.5">
                    {filteredDownstream.map((o) => (
                      <span
                        key={o.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#eef4ff] text-[#1d4ed8] text-xs"
                        title={`${o.unit ? o.unit + " / " : ""}${o.name}`}
                      >
                        <BuildingIcon className="w-3 h-3 flex-shrink-0" />
                        {o.unit ? (
                          <>
                            <span className="font-semibold">{o.unit}</span>
                            <span className="opacity-60">·{o.name}</span>
                          </>
                        ) : (
                          <span className="font-semibold">{o.name}</span>
                        )}
                      </span>
                    ))}
                    {filteredDownstream.length === 0 && (
                      <span className="text-[12px] text-[#9CA3AF] px-1">无匹配</span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#9CA3AF]">
                    你派给这些单位的任务,由对应部门接收办理。只读,改在各部门自己的「对口上级」。
                  </p>
                </div>
              )}
            </div>
          )}
          </div>
          )}

          {showMembers && init && activeTab === "members" && (
            <div
              className="flex-1 min-h-0 flex flex-col"
              onKeyDown={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
            >
              <OrgMembersPanel
                orgId={init.id}
                orgName={form.name || init.name}
                onChanged={onMembersChanged}
              />
            </div>
          )}

          {showLinks && init && activeTab === "links" && (
            <div
              className="flex-1 min-h-0 flex flex-col"
              onKeyDown={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
            >
              <OrgLinksPanel orgId={init.id} orgKind={editing.kind} onChanged={onMembersChanged} />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E9E9E9]">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-[#6B7280] hover:text-[#1A1A1A] rounded-md"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50"
            style={{ backgroundColor: kindMeta.color }}
            title="回车保存,Esc 取消"
          >
            <CheckIcon className="w-3.5 h-3.5 inline mr-1" />
            保存 <span className="text-[10px] opacity-70 ml-1">↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#4B5563] font-medium">
        {label}
        {required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── 党组织↔行政机构 关联(编辑抽屉「关联机构」tab;手动维护 N:M,党委/党总支当前 1:1)─── */
function linkErrMsg(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const m = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (typeof m === "string") return m;
  }
  return e instanceof Error ? e.message : "操作失败";
}

function OrgLinksPanel({
  orgId,
  orgKind,
  onChanged,
}: {
  orgId: string;
  orgKind: OrgKind;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const otherKind: OrgKind = orgKind === "party" ? "admin" : "party";
  const otherLabel = otherKind === "admin" ? "行政机构" : "党组织";
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const linksQuery = useQuery({ queryKey: ["org-links", orgId], queryFn: () => organizationsApi.links(orgId) });
  const treeQuery = useQuery({
    queryKey: ["organizations", "tree", otherKind],
    queryFn: () => organizationsApi.tree(otherKind),
    staleTime: 60_000,
  });

  const options = useMemo(() => {
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (ns: OrgTreeNode[], d: number) =>
      ns.forEach((n) => {
        out.push({ id: n.id, name: n.name, depth: d });
        walk(n.children, d + 1);
      });
    walk(treeQuery.data ?? [], 0);
    return out;
  }, [treeQuery.data]);

  const add = useMutation({
    mutationFn: (otherOrgId: string) => organizationsApi.addLink(orgId, otherOrgId),
    onSuccess: () => {
      setPick("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["org-links", orgId] });
      onChanged();
    },
    onError: (e) => setErr(linkErrMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (linkId: string) => organizationsApi.removeLink(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-links", orgId] });
      onChanged();
    },
    onError: (e) => setErr(linkErrMsg(e)),
  });

  const links: OrgLink[] = linksQuery.data ?? [];

  return (
    <div className="flex-1 overflow-auto p-5 flex flex-col gap-3">
      <p className="text-xs text-[#6B7280] bg-[#F7F8FA] px-3 py-2 rounded">
        关联对应的{otherLabel}。考核取业务数据时据此换算（{orgKind === "party" ? "党委 → 行政单位" : "行政单位 → 党组织"}）。党委 / 党总支通常 1:1。
      </p>

      <div>
        <h4 className="text-xs font-semibold text-[#4B5563] mb-2">已关联的{otherLabel}</h4>
        {links.length === 0 ? (
          <p className="text-xs text-[#9CA3AF] py-3 text-center bg-[#FAFBFC] rounded">尚未关联</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {links.map((l) => (
              <div key={l.linkId} className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#EEF0F3]">
                <BuildingIcon className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
                <span className="flex-1 text-sm text-[#1A1A1A] truncate">{l.org.name}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate(l.linkId)}
                  className="text-[#9CA3AF] hover:text-red-600 p-1 rounded"
                  title="解除关联"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-[#1A1A1A] mb-2">添加关联</h4>
        <div className="flex items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="flex-1 px-2.5 py-2 text-sm rounded-md border border-[#E9E9E9] bg-white focus:outline-none focus:border-[var(--party-primary)]"
          >
            <option value="">— 选择{otherLabel} —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {"　".repeat(o.depth) + o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick || add.isPending}
            onClick={() => add.mutate(pick)}
            className="px-3 py-2 text-sm text-white rounded-md font-medium disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            <PlusIcon className="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        {err && <p className="text-xs text-red-600 mt-1.5">{err}</p>}
      </div>
    </div>
  );
}

/* ─── 对口属性(存组织 meta.counterpartParentOrgIds —— 多对多 / 专业线)─── */
/** 读 meta 里的「对口上级机构」id 列表(兼容早期单值 counterpartParentOrgId) */
function readCounterparts(metaStr: string | null | undefined): string[] {
  if (!metaStr) return [];
  try {
    const o = JSON.parse(metaStr) as Record<string, unknown>;
    const arr = o?.counterpartParentOrgIds;
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
    if (typeof o?.counterpartParentOrgId === "string") return [o.counterpartParentOrgId];
    return [];
  } catch {
    return [];
  }
}
/** 读 meta 里的「部门负责人」用户 id(平级确认用;空串=未指定) */
function readOwner(metaStr: string | null | undefined): string {
  if (!metaStr) return "";
  try {
    const o = JSON.parse(metaStr) as Record<string, unknown>;
    return typeof o?.ownerUserId === "string" ? o.ownerUserId : "";
  } catch {
    return "";
  }
}
/** 合并 meta:写入 / 清除 counterpartParentOrgIds + ownerUserId(并清掉早期单值键),保留其它键 */
function buildMeta(
  existing: string | null | undefined,
  ids: string[],
  ownerUserId?: string,
): string {
  let obj: Record<string, unknown> = {};
  if (existing) {
    try {
      obj = (JSON.parse(existing) as Record<string, unknown>) || {};
    } catch {
      obj = {};
    }
  }
  delete obj.counterpartParentOrgId; // 早期单值键统一迁到数组
  if (ids.length) obj.counterpartParentOrgIds = ids;
  else delete obj.counterpartParentOrgIds;
  if (ownerUserId) obj.ownerUserId = ownerUserId;
  else delete obj.ownerUserId;
  return JSON.stringify(obj);
}
interface FlatOrgLite {
  id: string;
  name: string;
  meta: string | null;
}
function flattenOrgs(nodes: OrgTreeNode[]): FlatOrgLite[] {
  const out: FlatOrgLite[] = [];
  const walk = (n: OrgTreeNode) => {
    out.push({ id: n.id, name: n.name, meta: n.meta });
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/* ─── 对口上级机构多选(职务设置式弹窗:左分类 / 右点选卡片 / 顶部拼音搜索)─── */
interface OrgPickItem {
  id: string;
  name: string;
}
interface OrgPickCat {
  id: string;
  label: string;
  items: OrgPickItem[];
}
/** 把组织树按「虚拟机构(公司机关 / 基层单位…)」分组,每组列其下全部非虚拟机构(供点选);无虚拟壳则兜底一组「全部机构」 */
function buildOrgCategories(tree: OrgTreeNode[]): OrgPickCat[] {
  const cats: OrgPickCat[] = [];
  const desc = (n: OrgTreeNode): OrgPickItem[] => {
    const out: OrgPickItem[] = [];
    const w = (x: OrgTreeNode) => {
      if (!x.isVirtual) out.push({ id: x.id, name: x.name });
      x.children.forEach(w);
    };
    n.children.forEach(w);
    return out;
  };
  const walk = (n: OrgTreeNode) => {
    if (n.isVirtual && n.children.length > 0) {
      const items = desc(n);
      if (items.length) cats.push({ id: n.id, label: n.name, items });
    }
    n.children.forEach(walk);
  };
  tree.forEach(walk);
  if (cats.length === 0) {
    const all: OrgPickItem[] = [];
    const w = (x: OrgTreeNode) => {
      if (!x.isVirtual) all.push({ id: x.id, name: x.name });
      x.children.forEach(w);
    };
    tree.forEach(w);
    cats.push({ id: "__all__", label: "全部机构", items: all });
  }
  return cats;
}

/** 字段:已选 chips + 「选择」按钮 → 打开多选弹窗 */
function OrgCounterpartField({
  tree, value, onChange, excludeId,
}: {
  tree: OrgTreeNode[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const flat = flattenOrgs(tree);
  const nameOf = (id: string) => flat.find((o) => o.id === id)?.name ?? "(已删除)";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-party-soft text-[var(--party-primary)] text-xs"
          >
            {nameOf(id)}
            <button
              type="button"
              title="移除"
              onClick={() => onChange(value.filter((x) => x !== id))}
              className="rounded hover:bg-white/60"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-[#dce4ef] text-xs text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
        >
          <PlusIcon className="w-3 h-3" />
          {value.length ? "增减" : "选择对口上级机构"}
        </button>
      </div>
      {open && (
        <OrgCounterpartDialog
          tree={tree}
          selectedIds={value}
          excludeId={excludeId}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** 多选弹窗:左分类 / 右点选卡片(可多选,选中打勾)/ 顶部拼音搜索 / 底部完成 */
function OrgCounterpartDialog({
  tree, selectedIds, excludeId, onChange, onClose,
}: {
  tree: OrgTreeNode[];
  selectedIds: string[];
  excludeId?: string;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const cats = buildOrgCategories(tree);
  const allItems = cats.flatMap((c) => c.items);
  const [catId, setCatId] = useState<string | null>(cats[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const searchActive = search.trim().length > 0;
  const curCat = cats.find((c) => c.id === catId);
  const base = searchActive ? allItems : curCat?.items ?? [];
  const seen = new Set<string>();
  const visible = base.filter((it) => {
    if (it.id === excludeId || seen.has(it.id)) return false;
    if (searchActive && !matchesPinyin(it.name, search)) return false;
    seen.add(it.id);
    return true;
  });
  const selSet = new Set(selectedIds);
  const toggle = (id: string) =>
    onChange(selSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl h-[480px] bg-white rounded-xl shadow-2xl pointer-events-auto flex flex-col"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-5 py-3 border-b border-[#E9E9E9] flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">选择对口上级机构</h2>
            <span className="text-[10px] text-[#9CA3AF]">可多选 · 已选 {selectedIds.length}</span>
            <div className="flex-1" />
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
              <input
                autoFocus
                placeholder="搜索 (中文 / 拼音)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)] w-48"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#F7F8FA]"
                >
                  <XIcon className="w-3 h-3 text-[#9CA3AF]" />
                </button>
              )}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 flex">
            {!searchActive && cats.length > 1 && (
              <aside className="w-40 flex-shrink-0 border-r border-[#E9E9E9] overflow-auto py-1.5">
                {cats.map((c) => {
                  const active = c.id === catId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCatId(c.id)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-1.5 transition-colors ${
                        active ? "bg-party-soft text-[var(--party-primary)]" : "text-[#4B5563] hover:bg-[#F7F8FA]"
                      }`}
                    >
                      <div
                        className={`w-0.5 h-5 rounded-full ${active ? "bg-[var(--party-primary)]" : "bg-transparent"}`}
                      />
                      <span className="flex-1 min-w-0 text-xs font-medium truncate">{c.label}</span>
                      <span className="text-[10px] text-[#9CA3AF]">{c.items.length}</span>
                    </button>
                  );
                })}
              </aside>
            )}
            <div className="flex-1 min-w-0 overflow-auto p-4">
              {visible.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[#9CA3AF]">
                  {searchActive ? "无匹配机构" : "此分类下没有可选项"}
                </div>
              ) : (
                <>
                  {searchActive && (
                    <div className="text-[10px] text-[#9CA3AF] mb-2">跨分类搜索 · 命中 {visible.length} 项</div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {visible.map((it) => {
                      const sel = selSet.has(it.id);
                      return (
                        <button
                          key={it.id}
                          onClick={() => toggle(it.id)}
                          className={`text-left px-3 py-2 rounded-md border transition-all hover:shadow-sm flex items-center gap-1.5 ${
                            sel ? "border-[var(--party-primary)] bg-party-soft" : "border-[#E9E9E9] bg-white"
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded grid place-items-center flex-shrink-0 border ${
                              sel ? "border-[var(--party-primary)] bg-[var(--party-primary)]" : "border-[#D1D5DB] bg-white"
                            }`}
                          >
                            {sel && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                          </span>
                          <span
                            className={`text-xs font-medium truncate ${sel ? "text-[var(--party-primary)]" : "text-[#1A1A1A]"}`}
                          >
                            {it.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-[#E9E9E9] flex items-center gap-2">
            <span className="text-[10px] text-[#9CA3AF] flex-1">已选 {selectedIds.length} 个对口上级机构</span>
            <button
              onClick={() => onChange([])}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              清空
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-white"
              style={{ backgroundColor: "var(--party-primary)" }}
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DeleteConfirmModal({
  target, onCancel, onConfirm,
}: {
  target: OrgTreeNode;
  onCancel: () => void;
  onConfirm: (hard: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[400px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangleIcon className="w-5 h-5 text-orange-500" />
            <h3 className="text-base font-bold text-[#1A1A1A]">删除组织</h3>
          </div>
          <p className="text-sm text-[#4B5563] mb-1">
            确认删除「<span className="font-semibold text-[#1A1A1A]">{target.name}</span>」?
          </p>
          <p className="text-xs text-[#9CA3AF] mb-4">
            软删除会保留记录但停用,可在"显示已停用"模式下恢复;硬删除需先清空子节点和成员。
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E9E9E9]">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm text-[#6B7280] hover:text-[#1A1A1A] rounded-md">
            取消
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="px-4 py-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-md font-medium"
          >
            软删除(停用)
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="px-4 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md font-medium"
          >
            硬删除
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 机构成员分栏(编辑行政机构时右侧栏:看 / 加 / 移成员,改动即时生效)─── */
const ADMIN_BLUE = "rgb(26,107,200)";
const ADMIN_BLUE_BG = "rgb(238,244,255)";

function OrgMembersPanel({
  orgId, orgName, onChanged,
}: {
  orgId: string;
  orgName: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const membersQuery = useQuery({
    queryKey: ["org-direct-members", orgId],
    queryFn: () => organizationsApi.members(orgId, false),
  });
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [position, setPosition] = useState(""); // 职务(可选),加成员时带上
  const [search, setSearch] = useState("");
  const [newForm, setNewForm] = useState({ username: "", name: "", phone: "" });
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["org-direct-members", orgId] });
    qc.invalidateQueries({ queryKey: ["users"] });
    onChanged(); // 刷新组织树成员计数
  }
  function fail(e: unknown) {
    const m = e as { response?: { data?: { message?: string | string[] } }; message?: string };
    const msg = m.response?.data?.message;
    setErr(Array.isArray(msg) ? msg.join("; ") : (msg ?? m.message ?? "操作失败"));
  }

  const removeMut = useMutation({
    mutationFn: (userId: string) => usersApi.removeMembership(userId, orgId),
    onSuccess: () => { setErr(null); refresh(); toast.success("已移出本机构"); },
    onError: fail,
  });
  const addExistingMut = useMutation({
    mutationFn: (userId: string) =>
      usersApi.addMembership(userId, { orgId, position: position.trim() || undefined }),
    onSuccess: () => { setErr(null); refresh(); toast.success("已加入本机构"); },
    onError: fail,
  });
  const createMut = useMutation({
    mutationFn: async () => {
      const u = await usersApi.create({
        username: newForm.username.trim(),
        name: newForm.name.trim(),
        phone: newForm.phone.trim() || undefined,
      });
      await usersApi.addMembership(u.id, { orgId, position: position.trim() || undefined });
      return u;
    },
    onSuccess: () => {
      setErr(null);
      setNewForm({ username: "", name: "", phone: "" });
      refresh();
      toast.success("已创建并加入本机构");
    },
    onError: fail,
  });

  const searchQ = useQuery({
    queryKey: ["user-search-for-org", search],
    queryFn: () => usersApi.list({ search: search.trim(), take: 20 }),
    enabled: search.trim().length >= 1,
  });
  const candidates = (searchQ.data?.items ?? []).filter((u) => !memberIds.has(u.id));

  const canCreate = newForm.username.trim().length >= 2 && newForm.name.trim().length >= 1;
  const busy = addExistingMut.isPending || createMut.isPending || removeMut.isPending;

  const inputCls =
    "w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[rgb(26,107,200)]";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#FCFDFE]">
      {/* 栏头 */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[#E9E9E9] bg-[#FAFBFC]">
        <UsersIcon className="w-4 h-4 flex-shrink-0" style={{ color: ADMIN_BLUE }} />
        <h3 className="text-sm font-bold text-[#1A1A1A] truncate">本机构成员</h3>
        <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">直接 {members.length} 人</span>
        <span className="ml-auto text-[10px] text-[#9CA3AF] flex-shrink-0">改动即时生效</span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* 当前成员 */}
          <section>
            <h4 className="text-xs font-semibold text-[#4B5563] mb-2">当前成员</h4>
            {membersQuery.isLoading ? (
              <div className="text-xs text-[#9CA3AF] py-4 text-center">加载中…</div>
            ) : members.length === 0 ? (
              <div className="text-xs text-[#9CA3AF] py-4 text-center border border-dashed border-[#E9E9E9] rounded-md">
                本机构暂无直接成员
              </div>
            ) : (
              <div className="space-y-1.5">
                {members.map((m) => (
                  <MemberRow
                    key={m.userId}
                    m={m}
                    disabled={busy}
                    onRemove={() => removeMut.mutate(m.userId)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 添加成员 */}
          <section className="rounded-lg border border-[#E9E9E9] bg-[#FAFBFC] p-3 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlusIcon className="w-4 h-4" style={{ color: ADMIN_BLUE }} />
              <h4 className="text-xs font-semibold text-[#1A1A1A] truncate">添加成员到「{orgName}」</h4>
            </div>

            <div className="flex gap-1 text-xs">
              {([["existing", "选择现有用户"], ["new", "新建用户"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setErr(null); }}
                  className="px-3 py-1.5 rounded-md border transition-colors"
                  style={{
                    backgroundColor: tab === id ? ADMIN_BLUE_BG : "white",
                    borderColor: tab === id ? ADMIN_BLUE : "#E9E9E9",
                    color: tab === id ? ADMIN_BLUE : "#6B7280",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 职务(两种方式共用) */}
            <div>
              <label className="text-[11px] text-[#6B7280]">职务(可选)</label>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="如:科员 / 部长(留空则不填)"
                className={`mt-1 ${inputCls}`}
              />
            </div>

            {tab === "existing" ? (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索姓名 / 员工编号(支持拼音)"
                    className="w-full pl-7 pr-2 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[rgb(26,107,200)]"
                  />
                </div>
                {search.trim().length === 0 ? (
                  <p className="text-[11px] text-[#9CA3AF] px-1">输入关键词查找用户,点「加入」即可。</p>
                ) : searchQ.isLoading ? (
                  <div className="text-xs text-[#9CA3AF] py-3 text-center">搜索中…</div>
                ) : candidates.length === 0 ? (
                  <div className="text-xs text-[#9CA3AF] py-3 text-center">无匹配(或都已在本机构)</div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-auto">
                    {candidates.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 p-2 rounded-md border border-[#E9E9E9] bg-white"
                      >
                        <div className="w-7 h-7 rounded-full text-white grid place-items-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: ADMIN_BLUE }}>
                          {u.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[#1A1A1A] truncate">
                            {u.name}
                            <span className="text-[10px] text-[#9CA3AF] ml-1">{u.username}</span>
                          </div>
                          {u.primaryAdmin && (
                            <div className="text-[10px] text-[#9CA3AF] truncate">
                              现属:{u.primaryAdmin.orgName}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => addExistingMut.mutate(u.id)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md text-xs font-medium text-white disabled:opacity-50 flex-shrink-0"
                          style={{ backgroundColor: ADMIN_BLUE }}
                        >
                          加入
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={newForm.username}
                  onChange={(e) => setNewForm({ ...newForm, username: e.target.value })}
                  placeholder="员工编号 *(登录账号,不可重复)"
                  className={inputCls}
                />
                <input
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="姓名 *"
                  className={inputCls}
                />
                <input
                  value={newForm.phone}
                  onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                  placeholder="手机号(可选)"
                  className={inputCls}
                />
                <button
                  onClick={() => createMut.mutate()}
                  disabled={!canCreate || busy}
                  className="w-full px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: ADMIN_BLUE }}
                >
                  {createMut.isPending ? (
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlusIcon className="w-3.5 h-3.5" />
                  )}
                  创建并加入本机构
                </button>
                <p className="text-[10px] text-[#9CA3AF]">
                  创建后默认在职;党组织归属、角色权限可到「用户管理」补充。
                </p>
              </div>
            )}

            {err && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {err}
              </div>
            )}
          </section>
        </div>
    </div>
  );
}

function MemberRow({ m, onRemove, disabled }: { m: OrgMember; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md border border-[#E9E9E9]">
      <div
        className="w-7 h-7 rounded-full text-white grid place-items-center text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: ADMIN_BLUE }}
      >
        {m.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[#1A1A1A] truncate">
          {m.name}
          <span className="text-[10px] text-[#9CA3AF] ml-1">{m.username}</span>
          {m.isPrimary && (
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded ml-1"
              style={{ backgroundColor: ADMIN_BLUE_BG, color: ADMIN_BLUE }}
            >
              主岗
            </span>
          )}
        </div>
        {m.position && <div className="text-[10px] text-[#9CA3AF] truncate">{m.position}</div>}
      </div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 disabled:opacity-50 flex-shrink-0"
        title="移出本机构"
      >
        <Trash2Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
