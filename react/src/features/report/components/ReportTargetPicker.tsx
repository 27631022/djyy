import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  Building2Icon,
  UserIcon,
  SearchIcon,
  XIcon,
  PlusIcon,
  CheckIcon,
  BookmarkPlusIcon,
  ZapIcon,
  Trash2Icon,
} from "lucide-react";
import { organizationsApi, ORG_TYPE_LABELS, type OrgType, type OrgTreeNode } from "@/features/organization";
import { usersApi } from "@/features/user";
import { reportApi, type ReportUnitGroup } from "../api";

/**
 * 报送派发对象选择 —— 照搬 task 派发的「选择对象」方式:行政机构分级树 + 类型标签(一级/二级单位/部门)
 * + 自定义快捷组(localStorage)+ 单位/个人 tab。组织层级与分组「已在组织机构里设好」,这里直接呈现。
 * 受控 value = PickedTarget[](发布时映射成 targets)。
 */
export interface PickedTarget {
  targetType: "org" | "user";
  id: string;
  name: string;
  sub?: string;
}

interface FlatOrg {
  id: string;
  name: string;
  type: OrgType;
  isVirtual: boolean;
  isDept: boolean;
}
const keyOf = (t: { targetType: string; id: string }) => `${t.targetType}:${t.id}`;
function flatten(nodes: OrgTreeNode[]): FlatOrg[] {
  const out: FlatOrg[] = [];
  const walk = (n: OrgTreeNode) => {
    out.push({ id: n.id, name: n.name, type: n.type, isVirtual: n.isVirtual, isDept: n.isDept });
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}
const orgTypeLabel = (node: { type: OrgType; isDept: boolean }) =>
  node.isDept ? "部门" : ORG_TYPE_LABELS[node.type];

export function ReportTargetPicker({
  value,
  onChange,
}: {
  value: PickedTarget[];
  onChange: (v: PickedTarget[]) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"org" | "user">("org");
  const [manageGroups, setManageGroups] = useState(false);
  const selectedKeys = new Set(value.map(keyOf));

  // 快捷组:服务端持久化(跟登录账号走,跨浏览器/设备)
  const groupsQuery = useQuery({ queryKey: ["report", "unit-groups"], queryFn: () => reportApi.listUnitGroups() });
  const groups = useMemo<ReportUnitGroup[]>(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const invalidateGroups = () => qc.invalidateQueries({ queryKey: ["report", "unit-groups"] });
  const createMut = useMutation({
    mutationFn: (v: { name: string; orgIds: string[] }) => reportApi.createUnitGroup(v.name, v.orgIds),
    onSuccess: () => {
      toast.success("已存为快捷组");
      invalidateGroups();
    },
    onError: () => toast.error("保存快捷组失败"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => reportApi.deleteUnitGroup(id),
    onSuccess: invalidateGroups,
    onError: () => toast.error("删除失败"),
  });

  const treeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });
  const adminFlat = useMemo(() => flatten(treeQuery.data ?? []), [treeQuery.data]);

  function toggle(t: PickedTarget) {
    const k = keyOf(t);
    if (selectedKeys.has(k)) onChange(value.filter((v) => keyOf(v) !== k));
    else onChange([...value, t]);
  }
  function remove(k: string) {
    onChange(value.filter((v) => keyOf(v) !== k));
  }
  function addOrgs(list: FlatOrg[]) {
    const have = new Set(value.map(keyOf));
    const additions: PickedTarget[] = list
      .filter((o) => !have.has(`org:${o.id}`))
      .map((o) => ({ targetType: "org", id: o.id, name: o.name, sub: orgTypeLabel(o) }));
    if (additions.length) onChange([...value, ...additions]);
  }
  function removeOrgs(ids: string[]) {
    const drop = new Set(ids.map((id) => `org:${id}`));
    onChange(value.filter((v) => !drop.has(keyOf(v))));
  }
  function groupOrgs(g: ReportUnitGroup): FlatOrg[] {
    const set = new Set(g.orgIds);
    return adminFlat.filter((o) => set.has(o.id));
  }
  const groupAllSelected = (g: ReportUnitGroup) =>
    g.orgIds.length > 0 && g.orgIds.every((id) => selectedKeys.has(`org:${id}`));
  function toggleGroup(g: ReportUnitGroup) {
    if (groupAllSelected(g)) removeOrgs(g.orgIds);
    else addOrgs(groupOrgs(g));
  }
  function saveCurrentAsGroup() {
    const orgIds = value.filter((v) => v.targetType === "org").map((v) => v.id);
    if (orgIds.length === 0) {
      alert("请先在下面选中若干单位,再存为快捷组");
      return;
    }
    const name = prompt(`给这 ${orgIds.length} 个单位的快捷组起个名(如「全部基层单位」):`);
    if (!name || !name.trim()) return;
    createMut.mutate({ name: name.trim(), orgIds });
  }
  function deleteGroup(id: string) {
    deleteMut.mutate(id);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 快捷选单位 */}
      {tab === "org" && (
        <div className="rounded-xl border border-[#dce4ef] bg-white/70 px-3 py-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-[#475467]">
            <ZapIcon className="h-3.5 w-3.5 text-[var(--party-primary)]" />
            快捷选单位
            <span className="font-normal text-[#9CA3AF]">点一下选中/取消整组</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={saveCurrentAsGroup}
              className="inline-flex items-center gap-1 rounded-md border border-[#dce4ef] px-2 py-1 text-[12px] text-[#344054] hover:border-[var(--party-primary)]"
            >
              <BookmarkPlusIcon className="h-3.5 w-3.5" />
              存为快捷组
            </button>
            {groups.length > 0 && (
              <button
                type="button"
                onClick={() => setManageGroups((v) => !v)}
                className={`rounded-md border px-2 py-1 text-[12px] ${
                  manageGroups ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)]" : "border-[#dce4ef] text-[#667085]"
                }`}
              >
                {manageGroups ? "完成" : "管理"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const all = groupAllSelected(g);
              return (
                <span key={g.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                      all ? "border-[#246BFE] bg-[#eef4ff] font-bold text-[#1d4ed8]" : "border-[#dce4ef] bg-white text-[#475467] hover:border-[#246BFE]"
                    } ${manageGroups ? "rounded-r-none" : ""}`}
                  >
                    {all ? <CheckIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
                    {g.name}
                    <span className="text-[10px] text-[#9CA3AF]">{g.orgIds.length}</span>
                  </button>
                  {manageGroups && (
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      title="删除快捷组"
                      className="inline-flex items-center rounded-r-full border border-l-0 border-[#dce4ef] bg-white px-1.5 py-1 text-[#9CA3AF] hover:text-red-600"
                    >
                      <Trash2Icon className="h-3 w-3" />
                    </button>
                  )}
                </span>
              );
            })}
            {groups.length === 0 && (
              <span className="text-[12px] text-[#9CA3AF]">还没有快捷组 —— 选好若干单位后点「存为快捷组」,下次一键选中</span>
            )}
          </div>
        </div>
      )}

      {/* 主体 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#dce4ef] bg-white">
        <div className="flex items-center border-b border-[#eef2f7] px-2">
          {([["org", "单位"], ["user", "个人"]] as [typeof tab, string][]).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] ${
                tab === t ? "border-[var(--party-primary)] font-bold text-[var(--party-primary)]" : "border-transparent text-[#667085] hover:text-[#172033]"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="px-3 text-[12px] text-[#9CA3AF]">已选 {value.length}</span>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="px-2 py-1 text-[12px] text-[#9CA3AF] hover:text-red-600">
              清空
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {tab === "org" ? (
            <OrgTab nodes={treeQuery.data ?? []} loading={treeQuery.isLoading} selectedKeys={selectedKeys} onToggle={toggle} />
          ) : (
            <UserTab selectedKeys={selectedKeys} onToggle={toggle} />
          )}
        </div>

        {value.length > 0 && (
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto border-t border-[#eef2f7] bg-[#fafbfd] p-2.5">
            {value.map((t) => (
              <span key={keyOf(t)} className="inline-flex items-center gap-1 rounded-full border border-[#dce4ef] bg-white py-0.5 pl-2 pr-1 text-[12px] text-[#475467]">
                {t.targetType === "org" ? <Building2Icon className="h-3 w-3 text-[#246BFE]" /> : <UserIcon className="h-3 w-3 text-[var(--party-primary)]" />}
                {t.name}
                <button onClick={() => remove(keyOf(t))} className="rounded-full p-0.5 text-[#9CA3AF] hover:bg-[#F0F0F0]">
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgTab({
  nodes,
  loading,
  selectedKeys,
  onToggle,
}: {
  nodes: OrgTreeNode[];
  loading: boolean;
  selectedKeys: Set<string>;
  onToggle: (t: PickedTarget) => void;
}) {
  return (
    <div>
      {loading ? (
        <div className="py-6 text-center text-[13px] text-[#9CA3AF]">加载中…</div>
      ) : nodes.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-[#9CA3AF]">无组织</div>
      ) : (
        nodes.map((n) => <OrgRow key={n.id} node={n} depth={0} selectedKeys={selectedKeys} onToggle={onToggle} />)
      )}
    </div>
  );
}

function OrgRow({
  node,
  depth,
  selectedKeys,
  onToggle,
}: {
  node: OrgTreeNode;
  depth: number;
  selectedKeys: Set<string>;
  onToggle: (t: PickedTarget) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const checked = selectedKeys.has(`org:${node.id}`);
  return (
    <>
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="p-0.5 text-[#9CA3AF] hover:text-[#4B5563]">
            {open ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle({ targetType: "org", id: node.id, name: node.name, sub: orgTypeLabel(node) })}
          />
          <Building2Icon className="h-4 w-4 flex-shrink-0 text-[#246BFE]" />
          <span className="truncate text-[13px] text-[#172033]">{node.name}</span>
          <span className="flex-shrink-0 rounded bg-[#F0F0F0] px-1 text-[10px] text-[#6B7280]">{orgTypeLabel(node)}</span>
          {node.transitiveMembers > 0 && <span className="flex-shrink-0 text-[10px] text-[#9CA3AF]">{node.transitiveMembers}人</span>}
        </label>
      </div>
      {open && node.children.map((c) => <OrgRow key={c.id} node={c} depth={depth + 1} selectedKeys={selectedKeys} onToggle={onToggle} />)}
    </>
  );
}

function UserTab({ selectedKeys, onToggle }: { selectedKeys: Set<string>; onToggle: (t: PickedTarget) => void }) {
  const [search, setSearch] = useState("");
  const usersQuery = useQuery({
    queryKey: ["report-target-users", search],
    queryFn: () => usersApi.list({ search: search || undefined, active: true, take: 25 }),
    staleTime: 30_000,
  });
  const items = usersQuery.data?.items ?? [];

  return (
    <div>
      <div className="relative mb-2">
        <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名 / 员工编号"
          className="w-full rounded-lg border border-[#dce4ef] py-2 pl-8 pr-2 text-[13px] focus:border-[var(--party-primary)] focus:outline-none"
        />
      </div>
      {usersQuery.isLoading ? (
        <div className="py-6 text-center text-[13px] text-[#9CA3AF]">加载中…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-[#9CA3AF]">无匹配用户</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((u) => {
            const checked = selectedKeys.has(`user:${u.id}`);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggle({ targetType: "user", id: u.id, name: u.name, sub: u.primaryAdmin?.orgName ?? u.username })}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${checked ? "bg-party-soft" : "hover:bg-[#F7F8FA]"}`}
              >
                <UserIcon className="h-4 w-4 flex-shrink-0 text-[var(--party-primary)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-[#172033]">
                    {u.name}
                    <span className="ml-1.5 font-mono text-[11px] text-[#9CA3AF]">{u.username}</span>
                  </div>
                  {u.primaryAdmin && <div className="truncate text-[11px] text-[#9CA3AF]">{u.primaryAdmin.orgName}</div>}
                </div>
                {checked ? <CheckIcon className="h-4 w-4 text-[var(--party-primary)]" /> : <PlusIcon className="h-4 w-4 text-[#9CA3AF]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
