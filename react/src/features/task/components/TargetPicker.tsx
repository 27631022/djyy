import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  Building2Icon,
  UserIcon,
  SearchIcon,
  XIcon,
  PlusIcon,
  CheckIcon,
  SparklesIcon,
  BookmarkPlusIcon,
  ZapIcon,
  Trash2Icon,
} from "lucide-react";
import {
  organizationsApi,
  ORG_TYPE_LABELS,
  type OrgKind,
  type OrgType,
  type OrgTreeNode,
} from "@/features/organization";
import { usersApi } from "@/features/user";

/** 带名字的派发对象(UI 用;派发时映射成 TaskTargetInput) */
export interface PickedTarget {
  targetType: "org" | "user";
  id: string;
  name: string;
  sub?: string;
}

/** AI 建议范围(来自通知文件识别);level 为 level1..level4 或空串 */
export interface AiScope {
  level: string;
  units: string[];
}

interface FlatOrg {
  id: string;
  name: string;
  type: OrgType;
  isVirtual: boolean;
}
interface UnitGroup {
  id: string;
  name: string;
  ids: string[];
}
/** 虚拟机构(如 公司机关 / 基层单位)及其下属真实单位 —— 快捷选单位以此为维度 */
interface Wrapper {
  id: string;
  name: string;
  kids: FlatOrg[];
}

function keyOf(t: { targetType: string; id: string }) {
  return `${t.targetType}:${t.id}`;
}
function flatten(nodes: OrgTreeNode[]): FlatOrg[] {
  const out: FlatOrg[] = [];
  const walk = (n: OrgTreeNode) => {
    out.push({ id: n.id, name: n.name, type: n.type, isVirtual: n.isVirtual });
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}
/** 找出所有「虚拟机构 + 其非虚拟直接子单位」(公司机关→各部门;基层单位→塔运司/各分公司) */
function findWrappers(nodes: OrgTreeNode[]): Wrapper[] {
  const out: Wrapper[] = [];
  const walk = (n: OrgTreeNode) => {
    if (n.isVirtual && n.children.length > 0) {
      const kids = n.children
        .filter((c) => !c.isVirtual)
        .map((c) => ({ id: c.id, name: c.name, type: c.type, isVirtual: c.isVirtual }));
      if (kids.length) out.push({ id: n.id, name: n.name, kids });
    }
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/* ─── 自定义快捷组持久化(localStorage,按用户隔离)─── */
const GROUPS_KEY = (uid: string) => `djyy_task_unit_groups_${uid}`;
function loadGroups(uid: string): UnitGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY(uid));
    return raw ? (JSON.parse(raw) as UnitGroup[]) : [];
  } catch {
    return [];
  }
}
function saveGroups(uid: string, groups: UnitGroup[]) {
  try {
    localStorage.setItem(GROUPS_KEY(uid), JSON.stringify(groups));
  } catch {
    /* ignore */
  }
}

export function TargetPicker({
  value,
  onChange,
  aiScope,
  uid = "anon",
}: {
  value: PickedTarget[];
  onChange: (v: PickedTarget[]) => void;
  aiScope?: AiScope;
  uid?: string;
}) {
  const [tab, setTab] = useState<"org" | "user">("org");
  const [kind, setKind] = useState<OrgKind>("admin");
  const [groups, setGroups] = useState<UnitGroup[]>(() => loadGroups(uid));
  const [manageGroups, setManageGroups] = useState(false);
  const selectedKeys = new Set(value.map(keyOf));

  // 当前展示用树(随 kind 切)
  const treeQuery = useQuery({
    queryKey: ["org-tree", kind],
    queryFn: () => organizationsApi.tree(kind),
    staleTime: 60_000,
  });
  // 快捷条 / AI 范围基于「行政树」做层级与名称匹配(始终拉 admin,react-query 去重)
  const adminTreeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });
  const adminFlat = useMemo(
    () => flatten(adminTreeQuery.data ?? []),
    [adminTreeQuery.data],
  );
  const wrappers = useMemo(
    () => findWrappers(adminTreeQuery.data ?? []),
    [adminTreeQuery.data],
  );

  function toggle(t: PickedTarget) {
    const k = keyOf(t);
    if (selectedKeys.has(k)) onChange(value.filter((v) => keyOf(v) !== k));
    else onChange([...value, t]);
  }
  function remove(k: string) {
    onChange(value.filter((v) => keyOf(v) !== k));
  }
  /** 把一批行政单位「加入」选择(去重) */
  function addOrgs(list: FlatOrg[]) {
    const have = new Set(value.map(keyOf));
    const additions: PickedTarget[] = list
      .filter((o) => !have.has(`org:${o.id}`))
      .map((o) => ({
        targetType: "org",
        id: o.id,
        name: o.name,
        sub: ORG_TYPE_LABELS[o.type],
      }));
    if (additions.length) onChange([...value, ...additions]);
  }
  function removeOrgs(ids: string[]) {
    const drop = new Set(ids.map((id) => `org:${id}`));
    onChange(value.filter((v) => !drop.has(keyOf(v))));
  }
  function wrapperAllSelected(w: Wrapper): boolean {
    return w.kids.length > 0 && w.kids.every((o) => selectedKeys.has(`org:${o.id}`));
  }
  function toggleWrapper(w: Wrapper) {
    if (wrapperAllSelected(w)) removeOrgs(w.kids.map((o) => o.id));
    else addOrgs(w.kids);
  }
  function groupOrgs(g: UnitGroup): FlatOrg[] {
    const set = new Set(g.ids);
    return adminFlat.filter((o) => set.has(o.id));
  }
  function groupAllSelected(g: UnitGroup): boolean {
    return g.ids.length > 0 && g.ids.every((id) => selectedKeys.has(`org:${id}`));
  }
  function toggleGroup(g: UnitGroup) {
    if (groupAllSelected(g)) removeOrgs(g.ids);
    else addOrgs(groupOrgs(g));
  }
  function saveCurrentAsGroup() {
    const orgIds = value.filter((v) => v.targetType === "org").map((v) => v.id);
    if (orgIds.length === 0) {
      alert("请先在下面选中若干单位,再存为快捷组");
      return;
    }
    const name = prompt(`给这 ${orgIds.length} 个单位的快捷组起个名(如「全部基层党支部」):`);
    if (!name || !name.trim()) return;
    const next = [...groups, { id: Date.now().toString(36), name: name.trim(), ids: orgIds }];
    setGroups(next);
    saveGroups(uid, next);
  }
  function deleteGroup(id: string) {
    const next = groups.filter((g) => g.id !== id);
    setGroups(next);
    saveGroups(uid, next);
  }

  /** 应用 AI 建议范围:层级命中则全选该级 + 名称匹配建议单位 */
  function applyAiScope() {
    if (!aiScope) return;
    const picks: FlatOrg[] = [];
    if (/^level[1-4]$/.test(aiScope.level)) {
      // 按层级选时排除虚拟壳(公司机关 / 基层单位 等),只选真实单位
      picks.push(...adminFlat.filter((o) => o.type === aiScope.level && !o.isVirtual));
    }
    for (const nm of aiScope.units) {
      const t = nm.trim();
      if (!t) continue;
      const hit =
        adminFlat.find((o) => o.name === t) ??
        adminFlat.find((o) => o.name.includes(t) || t.includes(o.name));
      if (hit) picks.push(hit);
    }
    if (picks.length === 0) {
      alert("没有匹配到建议单位,请手动选择");
      return;
    }
    addOrgs(picks);
  }

  const aiScopeText = aiScope?.units?.length
    ? aiScope.units.slice(0, 8).join("、")
    : aiScope && /^level[1-4]$/.test(aiScope.level)
      ? "(按通知文件推断的范围)"
      : "";
  const showAiBanner = !!aiScope && !!aiScopeText;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* AI 建议范围 */}
      {showAiBanner && (
        <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3">
          <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-[#172033]">AI 建议填报范围</div>
            <div className="text-[12px] text-[#667085] truncate">{aiScopeText || "未识别到明确范围"}</div>
          </div>
          <button
            type="button"
            onClick={applyAiScope}
            className="px-3 py-1.5 rounded-lg text-[13px] font-bold text-white bg-purple-600 hover:bg-purple-700 flex-shrink-0"
          >
            应用建议
          </button>
        </div>
      )}

      {/* 快捷选单位条(仅单位 tab + 行政视图) */}
      {tab === "org" && kind === "admin" && (
        <div className="rounded-xl border border-[#dce4ef] bg-white/70 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2 text-[12px] font-bold text-[#475467]">
            <ZapIcon className="w-3.5 h-3.5 text-[var(--party-primary)]" />
            快捷选单位
            <span className="font-normal text-[#9CA3AF]">点一下选中/取消整组</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={saveCurrentAsGroup}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] border border-[#dce4ef] hover:border-[var(--party-primary)] text-[#344054]"
            >
              <BookmarkPlusIcon className="w-3.5 h-3.5" />
              存为快捷组
            </button>
            {groups.length > 0 && (
              <button
                type="button"
                onClick={() => setManageGroups((v) => !v)}
                className={`px-2 py-1 rounded-md text-[12px] border ${
                  manageGroups
                    ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft"
                    : "border-[#dce4ef] text-[#667085]"
                }`}
              >
                {manageGroups ? "完成" : "管理"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wrappers.map((w) => {
              const all = wrapperAllSelected(w);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWrapper(w)}
                  title={`选中「${w.name}」下属 ${w.kids.length} 个单位`}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                    all
                      ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-bold"
                      : "border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
                  }`}
                >
                  {all ? <CheckIcon className="w-3 h-3" /> : <PlusIcon className="w-3 h-3" />}
                  全选{w.name}
                  <span className="text-[10px] text-[#9CA3AF]">{w.kids.length}</span>
                </button>
              );
            })}
            {groups.map((g) => {
              const all = groupAllSelected(g);
              return (
                <span key={g.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                      all
                        ? "border-[#246BFE] bg-[#eef4ff] text-[#1d4ed8] font-bold"
                        : "border-[#dce4ef] bg-white text-[#475467] hover:border-[#246BFE]"
                    } ${manageGroups ? "rounded-r-none" : ""}`}
                  >
                    {all ? <CheckIcon className="w-3 h-3" /> : <PlusIcon className="w-3 h-3" />}
                    {g.name}
                    <span className="text-[10px] text-[#9CA3AF]">{g.ids.length}</span>
                  </button>
                  {manageGroups && (
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      title="删除快捷组"
                      className="inline-flex items-center px-1.5 py-1 rounded-r-full border border-l-0 border-[#dce4ef] bg-white text-[#9CA3AF] hover:text-red-600"
                    >
                      <Trash2Icon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              );
            })}
            {wrappers.length === 0 && groups.length === 0 && (
              <span className="text-[12px] text-[#9CA3AF]">加载单位中…</span>
            )}
          </div>
        </div>
      )}

      {/* 主体:tab 切 + 树/搜索(充满剩余高度) */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[#dce4ef] bg-white overflow-hidden">
        <div className="flex items-center border-b border-[#eef2f7] px-2">
          {(
            [
              ["org", "单位"],
              ["user", "个人"],
            ] as [typeof tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[14px] border-b-2 -mb-px ${
                tab === t
                  ? "border-[var(--party-primary)] text-[var(--party-primary)] font-bold"
                  : "border-transparent text-[#667085] hover:text-[#172033]"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="px-3 text-[12px] text-[#9CA3AF]">已选 {value.length}</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="px-2 py-1 text-[12px] text-[#9CA3AF] hover:text-red-600"
            >
              清空
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3">
          {tab === "org" ? (
            <OrgTab
              kind={kind}
              setKind={setKind}
              nodes={treeQuery.data ?? []}
              loading={treeQuery.isLoading}
              selectedKeys={selectedKeys}
              onToggle={toggle}
            />
          ) : (
            <UserTab selectedKeys={selectedKeys} onToggle={toggle} />
          )}
        </div>

        {value.length > 0 && (
          <div className="border-t border-[#eef2f7] p-2.5 flex flex-wrap gap-1.5 bg-[#fafbfd] max-h-32 overflow-auto">
            {value.map((t) => (
              <span
                key={keyOf(t)}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-white border border-[#dce4ef] text-[12px] text-[#475467]"
              >
                {t.targetType === "org" ? (
                  <Building2Icon className="w-3 h-3 text-[#246BFE]" />
                ) : (
                  <UserIcon className="w-3 h-3 text-[var(--party-primary)]" />
                )}
                {t.name}
                <button
                  onClick={() => remove(keyOf(t))}
                  className="p-0.5 rounded-full hover:bg-[#F0F0F0] text-[#9CA3AF]"
                >
                  <XIcon className="w-3 h-3" />
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
  kind,
  setKind,
  nodes,
  loading,
  selectedKeys,
  onToggle,
}: {
  kind: OrgKind;
  setKind: (k: OrgKind) => void;
  nodes: OrgTreeNode[];
  loading: boolean;
  selectedKeys: Set<string>;
  onToggle: (t: PickedTarget) => void;
}) {
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(
          [
            ["admin", "行政机构"],
            ["party", "党组织"],
          ] as [OrgKind, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2.5 py-1 rounded-md text-[12px] border ${
              kind === k
                ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft"
                : "border-[#dce4ef] text-[#667085]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-[13px] text-[#9CA3AF] py-6 text-center">加载中…</div>
      ) : nodes.length === 0 ? (
        <div className="text-[13px] text-[#9CA3AF] py-6 text-center">无组织</div>
      ) : (
        nodes.map((n) => (
          <OrgRow key={n.id} node={n} depth={0} selectedKeys={selectedKeys} onToggle={onToggle} />
        ))
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
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const checked = selectedKeys.has(`org:${node.id}`);
  return (
    <>
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-0.5 text-[#9CA3AF] hover:text-[#4B5563]"
          >
            {open ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0 py-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() =>
              onToggle({
                targetType: "org",
                id: node.id,
                name: node.name,
                sub: ORG_TYPE_LABELS[node.type],
              })
            }
          />
          <Building2Icon className="w-4 h-4 text-[#246BFE] flex-shrink-0" />
          <span className="text-[13px] text-[#172033] truncate">{node.name}</span>
          <span className="text-[10px] px-1 rounded bg-[#F0F0F0] text-[#6B7280] flex-shrink-0">
            {ORG_TYPE_LABELS[node.type]}
          </span>
          {node.transitiveMembers > 0 && (
            <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">{node.transitiveMembers}人</span>
          )}
        </label>
      </div>
      {open &&
        node.children.map((c) => (
          <OrgRow key={c.id} node={c} depth={depth + 1} selectedKeys={selectedKeys} onToggle={onToggle} />
        ))}
    </>
  );
}

function UserTab({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<string>;
  onToggle: (t: PickedTarget) => void;
}) {
  const [search, setSearch] = useState("");
  const usersQuery = useQuery({
    queryKey: ["task-target-users", search],
    queryFn: () => usersApi.list({ search: search || undefined, active: true, take: 25 }),
    staleTime: 30_000,
  });
  const items = usersQuery.data?.items ?? [];

  return (
    <div>
      <div className="relative mb-2">
        <SearchIcon className="w-4 h-4 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名 / 员工编号"
          className="w-full pl-8 pr-2 py-2 text-[13px] border border-[#dce4ef] rounded-lg focus:outline-none focus:border-[var(--party-primary)]"
        />
      </div>
      {usersQuery.isLoading ? (
        <div className="text-[13px] text-[#9CA3AF] py-6 text-center">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[#9CA3AF] py-6 text-center">无匹配用户</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((u) => {
            const checked = selectedKeys.has(`user:${u.id}`);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() =>
                  onToggle({
                    targetType: "user",
                    id: u.id,
                    name: u.name,
                    sub: u.primaryAdmin?.orgName ?? u.username,
                  })
                }
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left ${
                  checked ? "bg-party-soft" : "hover:bg-[#F7F8FA]"
                }`}
              >
                <UserIcon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#172033] truncate">
                    {u.name}
                    <span className="text-[11px] text-[#9CA3AF] font-mono ml-1.5">{u.username}</span>
                  </div>
                  {u.primaryAdmin && (
                    <div className="text-[11px] text-[#9CA3AF] truncate">{u.primaryAdmin.orgName}</div>
                  )}
                </div>
                {checked ? (
                  <CheckIcon className="w-4 h-4 text-[var(--party-primary)]" />
                ) : (
                  <PlusIcon className="w-4 h-4 text-[#9CA3AF]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
