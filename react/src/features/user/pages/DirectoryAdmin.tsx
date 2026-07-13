import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ContactIcon, BuildingIcon, SearchIcon, XIcon, GripVerticalIcon,
  EyeIcon, EyeOffIcon, PencilIcon, ChevronRightIcon, ChevronDownIcon,
  GlobeIcon,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  directoryAdminApi, type DirectoryMember, type DirectoryUnitMembers,
} from "@/features/user";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import { resolveAvatarUrl } from "@/features/avatar";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";

const PARTY = "var(--party-primary)";
const ADMIN = "rgb(26, 107, 200)";
const ADMIN_BG = "rgb(238, 244, 255)";

function errMsg(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join("; ") : m ?? err.message ?? fallback;
}

/** 范围内顶层可管节点(锚点子树的根):在集合内、其父不在集合内 */
function scopedRoots(nodes: OrgTreeNode[], set: Set<string>): OrgTreeNode[] {
  const out: OrgTreeNode[] = [];
  for (const n of nodes) {
    if (set.has(n.id)) out.push(n);
    else out.push(...scopedRoots(n.children, set));
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   通讯录管理(/admin/directory,directory:manage):
   左=可管行政机构树 · 右=选中单位的直属成员(拖拽排序 / 隐藏 / 改联系方式)
   ═══════════════════════════════════════════════════════════════ */
export default function DirectoryAdminPage() {
  const scopeQuery = useQuery({ queryKey: ["directory", "scope"], queryFn: directoryAdminApi.scope });
  const treeQuery = useQuery({
    queryKey: ["orgs", "tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });
  const [orgId, setOrgId] = useState<string | null>(null);

  const scopedTree = useMemo(() => {
    const tree = treeQuery.data ?? [];
    const sc = scopeQuery.data;
    // 范围未知(加载中/出错)→ fail-closed,不展开全树(权限收敛面不能默认放开)
    if (!sc) return [];
    if (sc.all) return tree;
    return scopedRoots(tree, new Set(sc.orgIds));
  }, [treeQuery.data, scopeQuery.data]);

  // 仅在范围查询成功时才认「全公司」——否则不误显「全公司通讯录」标签
  const isAll = scopeQuery.isSuccess && (scopeQuery.data?.all ?? false);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 顶栏 */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#E9E9E9] px-4 py-3">
        <ContactIcon className="h-4 w-4 text-[var(--party-primary)]" />
        <h1 className="text-base font-bold text-[#1A1A1A]">通讯录管理</h1>
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-[#9CA3AF]">
          {isAll ? (
            <><GlobeIcon className="h-3.5 w-3.5" /> 全公司通讯录</>
          ) : (
            <><BuildingIcon className="h-3.5 w-3.5" /> 所辖单位及以下</>
          )}
        </span>
        <span className="ml-auto text-xs text-[#9CA3AF]">选中单位后可拖拽排序、隐藏、改联系方式</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左:可管单位树 */}
        <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-[#E9E9E9] p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-gray-700">
            <BuildingIcon className="h-3.5 w-3.5" style={{ color: ADMIN }} />
            选择单位
          </div>
          {treeQuery.isLoading || scopeQuery.isLoading ? (
            <div className="px-2 py-4 text-xs text-gray-400">加载中…</div>
          ) : scopeQuery.isError ? (
            <div className="px-2 py-4 text-xs text-red-500">管理范围加载失败,请刷新页面重试</div>
          ) : scopedTree.length === 0 ? (
            <div className="px-2 py-4 text-xs text-gray-400">无可管理的单位</div>
          ) : (
            scopedTree.map((n) => (
              <TreeNode key={n.id} node={n} depth={0} selectedId={orgId} onSelect={setOrgId} />
            ))
          )}
        </aside>

        {/* 右:单位成员 */}
        <main className="min-w-0 flex-1">
          {orgId ? (
            <UnitPanel key={orgId} orgId={orgId} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#9CA3AF]">
              从左侧选择一个单位,管理其通讯录成员
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── 单位树节点 ─── */
function TreeNode({
  node, depth, selectedId, onSelect,
}: {
  node: OrgTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const selected = node.id === selectedId;
  return (
    <div>
      <div
        className="flex items-center rounded-lg transition-colors hover:bg-gray-50"
        style={{ backgroundColor: selected ? "color-mix(in srgb, var(--party-primary) 8%, white)" : undefined }}
      >
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
          className="flex h-7 w-5 flex-shrink-0 items-center justify-center text-gray-400"
          style={{ marginLeft: depth * 12, visibility: hasChildren ? "visible" : "hidden" }}
          tabIndex={hasChildren ? 0 : -1}
        >
          {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1.5 text-left text-sm"
          style={{ color: selected ? PARTY : "#374151", fontWeight: selected ? 600 : 400 }}
          title={node.name}
        >
          <span className="truncate">{node.name}</span>
          {node.directMembers > 0 && (
            <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">{node.directMembers}</span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 单位成员面板 ─── */
function UnitPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [editing, setEditing] = useState<DirectoryMember | null>(null);
  const key = useMemo(() => ["directory", "members", orgId, search] as const, [orgId, search]);

  const membersQuery = useQuery({
    queryKey: key,
    queryFn: () => directoryAdminApi.unitMembers(orgId, search || undefined),
    placeholderData: (prev) => prev,
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const reorder = useMutation({
    mutationFn: (userIds: string[]) => directoryAdminApi.reorder(orgId, userIds),
    onSuccess: () => toast.success("顺序已保存"),
    onError: (e) => {
      toast.error(errMsg(e, "排序失败"));
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const toggleHidden = useMutation({
    mutationFn: (m: DirectoryMember) => directoryAdminApi.updateMember(m.userId, { hidden: !m.hidden }),
    onSuccess: (_r, m) => {
      toast.success(m.hidden ? "已在通讯录显示" : "已从通讯录隐藏");
      qc.invalidateQueries({ queryKey: ["directory", "members", orgId] });
    },
    onError: (e) => toast.error(errMsg(e, "操作失败")),
  });

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const data = qc.getQueryData<DirectoryUnitMembers>(key);
    if (!data) return;
    const ids = data.members.map((m) => m.userId);
    const next = arrayMove(data.members, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    qc.setQueryData(key, { ...data, members: next });
    reorder.mutate(next.map((m) => m.userId));
  }

  const data = membersQuery.data;
  const members = data?.members ?? [];
  const canDrag = !search; // 搜索过滤时禁排序(展示的是全量顺序的子集,拖动无意义)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 面板头 */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[#E9E9E9] px-4 py-2.5">
        <span className="text-sm font-semibold text-[#1A1A1A]">{data?.org.name ?? "…"}</span>
        <span className="text-xs text-[#9CA3AF]">直属 {members.length} 人</span>
        <span className="text-[10px] text-[#C0C6D0]">
          {canDrag ? "拖动手柄可排序 · 顺序即通讯录展示顺序" : "搜索中,清空后可拖拽排序"}
        </span>
        <div className="flex-1" />
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="按姓名 / 工号"
            className="w-48 rounded-md border border-[#E9E9E9] py-1.5 pl-7 pr-7 text-xs focus:border-[var(--party-primary)] focus:outline-none"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-gray-100"
            >
              <XIcon className="h-3 w-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* 成员列表 */}
      <div
        className="min-h-0 flex-1 overflow-y-auto transition-opacity"
        style={{ opacity: membersQuery.isFetching && !membersQuery.isLoading ? 0.6 : 1 }}
      >
        {membersQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">加载中…</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {search ? "该单位内无匹配人员" : "该单位没有直属成员"}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={members.map((m) => m.userId)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-[#F3F4F6]">
                {members.map((m) => (
                  <MemberRow
                    key={m.userId}
                    m={m}
                    disabled={!canDrag}
                    onToggleHidden={() => toggleHidden.mutate(m)}
                    onEdit={() => setEditing(m)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {editing && (
        <EditContactDialog
          key={editing.userId}
          member={editing}
          orgId={orgId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ─── 成员行(可拖拽) ─── */
function MemberRow({
  m, disabled, onToggleHidden, onEdit,
}: {
  m: DirectoryMember;
  disabled: boolean;
  onToggleHidden: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.userId,
    disabled,
  });
  const avatar = resolveAvatarUrl(m.avatarUrl);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2.5 px-3 py-2 ${isDragging ? "bg-white opacity-70 shadow" : "hover:bg-gray-50"}`}
    >
      <button
        {...attributes}
        {...listeners}
        disabled={disabled}
        title={disabled ? "搜索时不可拖拽" : "拖拽排序"}
        className="cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>

      <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${m.hidden ? "opacity-45" : ""}`}>
        {avatar ? (
          <img src={avatar} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-1 ring-gray-100" />
        ) : (
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[var(--party-primary)] text-sm font-bold text-white">
            {m.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-[#1A1A1A]">{m.name}</span>
            {m.position && (
              <span className="flex-shrink-0 rounded px-1 py-px text-[10px]" style={{ backgroundColor: ADMIN_BG, color: ADMIN }}>
                {m.position}
              </span>
            )}
            {!m.active && (
              <span className="flex-shrink-0 rounded bg-gray-100 px-1 py-px text-[10px] text-gray-500">离职</span>
            )}
            {m.hidden && (
              <span className="flex-shrink-0 rounded bg-orange-50 px-1 py-px text-[10px] text-orange-500">已隐藏</span>
            )}
          </div>
          <div className="truncate text-[11px] text-gray-400">
            工号 {m.username}
            {m.phone ? ` · ${m.phone}` : " · 未留电话"}
            {m.email ? ` · ${m.email}` : ""}
          </div>
        </div>
      </div>

      <button
        onClick={onEdit}
        title="改联系方式"
        className="flex-shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[var(--party-primary)]"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onToggleHidden}
        title={m.hidden ? "在通讯录中显示" : "从通讯录中隐藏"}
        className="flex-shrink-0 rounded p-1.5 hover:bg-gray-100"
        style={{ color: m.hidden ? "rgb(234,88,12)" : "#9CA3AF" }}
      >
        {m.hidden ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/* ─── 改联系方式弹窗 ─── */
function EditContactDialog({
  member, orgId, onClose,
}: {
  member: DirectoryMember;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(member.phone ?? "");
  const [email, setEmail] = useState(member.email ?? "");

  const save = useMutation({
    mutationFn: () =>
      directoryAdminApi.updateMember(member.userId, {
        phone: phone.trim(),
        email: email.trim(),
      }),
    onSuccess: () => {
      toast.success("已保存");
      qc.invalidateQueries({ queryKey: ["directory", "members", orgId] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, "保存失败")),
  });

  const dirty = phone.trim() !== (member.phone ?? "") || email.trim() !== (member.email ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            改联系方式 · {member.name}
            <span className="ml-1.5 text-xs font-normal text-gray-400">工号 {member.username}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-gray-400">手机号</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="留空 = 清空"
              className="w-full rounded-md border border-[#E9E9E9] px-2.5 py-1.5 text-sm focus:border-[var(--party-primary)] focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-400">邮箱</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="留空 = 清空"
              className="w-full rounded-md border border-[#E9E9E9] px-2.5 py-1.5 text-sm focus:border-[var(--party-primary)] focus:outline-none"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-md border border-[#E9E9E9] px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: PARTY }}
          >
            {save.isPending ? "保存中…" : "保存"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
