import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldIcon, PlusIcon, SearchIcon, XIcon, TrashIcon, AlertCircleIcon,
  CheckIcon, UsersIcon, KeyIcon, LockIcon, PackageIcon, RefreshCwIcon,
  ChevronRightIcon, BadgeCheckIcon,
} from "lucide-react";
import {
  rolesApi,
  type RoleListItem,
  type RoleDetail,
  type CreateRoleInput,
} from "../../api/roles";
import {
  permissionsApi,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_CATEGORY_ORDER,
  type Permission,
} from "../../api/permissions";
import { SCOPE_LABELS } from "../../api/users";
import { matchesPinyin, highlightMatch } from "../../lib/pinyinSearch";

/* ─── Color tokens ─── */
const PARTY = "var(--party-primary)";
const PARTY_BG = "rgb(255, 240, 242)";
const ADMIN = "rgb(26, 107, 200)";

/* ═══════════════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════════════ */

export default function RolesPage() {
  const qc = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
  });
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => permissionsApi.list(),
    staleTime: 60_000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  /* 默认选中第一个 */
  useEffect(() => {
    if (rolesQuery.data && rolesQuery.data.length > 0 && !selectedId) {
      setSelectedId(rolesQuery.data[0].id);
    }
  }, [rolesQuery.data, selectedId]);

  const filtered = useMemo(() => {
    if (!rolesQuery.data) return [];
    if (!search.trim()) return rolesQuery.data;
    return rolesQuery.data.filter(
      (r) => matchesPinyin(r.name, search) || matchesPinyin(r.code, search),
    );
  }, [rolesQuery.data, search]);

  const builtinList = filtered.filter((r) => r.builtin);
  const customList  = filtered.filter((r) => !r.builtin);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["roles"] });
    qc.invalidateQueries({ queryKey: ["role-detail"] });
  }

  return (
    <div className="h-full flex bg-white">
      {/* ════ 左侧:角色列表 ════ */}
      <aside className="w-72 flex-shrink-0 border-r border-[#E9E9E9] flex flex-col">
        <div className="px-3 py-2.5 border-b border-[#F0F0F0] flex items-center gap-2">
          <ShieldIcon className="w-4 h-4 text-[var(--party-primary)]" />
          <span className="text-sm font-bold text-[#1A1A1A] flex-1">角色与权限</span>
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
              className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)] w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {rolesQuery.isLoading ? (
            <div className="p-4 text-xs text-[#9CA3AF] text-center">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-[#9CA3AF] text-center">无匹配角色</div>
          ) : (
            <>
              {builtinList.length > 0 && (
                <RoleGroup
                  title="内置角色"
                  icon={LockIcon}
                  count={builtinList.length}
                  items={builtinList}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  searchQuery={search}
                />
              )}
              {customList.length > 0 && (
                <RoleGroup
                  title="自定义角色"
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
          <RoleDetailView
            roleId={selectedId}
            permissions={permissionsQuery.data ?? []}
            onChanged={() => qc.invalidateQueries({ queryKey: ["roles"] })}
            onDeleted={() => {
              setSelectedId(null);
              qc.invalidateQueries({ queryKey: ["roles"] });
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[#9CA3AF]">
            从左侧选择一个角色查看 / 编辑
          </div>
        )}
      </main>

      {/* ════ 新建对话框 ════ */}
      {createOpen && (
        <CreateRoleDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(r) => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ["roles"] });
            setSelectedId(r.id);
          }}
        />
      )}
    </div>
  );
}

/* ─── 角色分组 ─── */
function RoleGroup({
  title, icon: Icon, count, items, selectedId, onSelect, searchQuery,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  items: RoleListItem[];
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
      {items.map((r) => {
        const active = r.id === selectedId;
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="w-full px-3 py-2 text-left border-b border-[#F0F0F0] hover:bg-party-soft transition-colors flex items-center gap-2"
            style={{ backgroundColor: active ? PARTY_BG : undefined }}
          >
            <div
              className="w-1 h-8 rounded-full flex-shrink-0 transition-colors"
              style={{ backgroundColor: active ? PARTY : "transparent" }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#1A1A1A] flex items-center gap-1.5">
                <span className="truncate">
                  <HighlightedText text={r.name} query={searchQuery} />
                </span>
                {r.builtin && <BadgeCheckIcon className="w-3 h-3 text-[#9CA3AF]" />}
              </div>
              <div className="text-[10px] text-[#9CA3AF] truncate">{r.code}</div>
            </div>
            <div className="flex flex-col items-end text-[10px] text-[#9CA3AF]">
              <span className="flex items-center gap-0.5"><UsersIcon className="w-2.5 h-2.5" />{r.userCount}</span>
              <span className="flex items-center gap-0.5"><KeyIcon className="w-2.5 h-2.5" />{r.permissionCount}</span>
            </div>
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
   Role Detail (right pane)
   ═══════════════════════════════════════════════════════════════ */

function RoleDetailView({
  roleId, permissions, onChanged, onDeleted,
}: {
  roleId: string;
  permissions: Permission[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["role-detail", roleId],
    queryFn: () => rolesApi.get(roleId),
  });
  const [tab, setTab] = useState<"perms" | "users">("perms");

  function afterMutate() {
    qc.invalidateQueries({ queryKey: ["role-detail", roleId] });
    onChanged();
  }

  const role = detailQuery.data;

  if (!role) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[#9CA3AF]">
        {detailQuery.isLoading ? "加载中…" : "角色不存在"}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <RoleHeader role={role} onChanged={afterMutate} onDeleted={onDeleted} />

      {/* Tabs */}
      <div className="flex-shrink-0 px-5 border-b border-[#E9E9E9] flex gap-1">
        {[
          { id: "perms" as const, label: "权限配置", icon: KeyIcon },
          { id: "users" as const, label: `关联用户 (${role.userCount})`, icon: UsersIcon },
        ].map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors"
              style={{
                borderColor: active ? PARTY : "transparent",
                color: active ? PARTY : "#6B7280",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "perms" ? (
          <PermissionsTab role={role} permissions={permissions} onSaved={afterMutate} />
        ) : (
          <UsersTab roleId={role.id} />
        )}
      </div>
    </div>
  );
}

/* ─── Header (inline edit name + description) ─── */
function RoleHeader({
  role, onChanged, onDeleted,
}: {
  role: RoleDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
    setEditing(false);
    setError(null);
  }, [role.id]);

  const dirty = name !== role.name || description !== (role.description ?? "");

  const save = useMutation({
    mutationFn: () => rolesApi.update(role.id, { name, description: description || undefined }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  const remove = useMutation({
    mutationFn: () => rolesApi.remove(role.id),
    onSuccess: () => onDeleted(),
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "删除失败");
    },
  });

  return (
    <div className="flex-shrink-0 px-5 py-4 border-b border-[#E9E9E9]">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: PARTY_BG }}>
          <ShieldIcon className="w-5 h-5" style={{ color: PARTY }} />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="角色名"
                className="text-base font-bold w-full px-2 py-1 border border-[#E9E9E9] rounded focus:outline-none focus:border-[var(--party-primary)]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="角色描述"
                rows={2}
                className="text-xs w-full px-2 py-1 border border-[#E9E9E9] rounded focus:outline-none focus:border-[var(--party-primary)] resize-none"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#1A1A1A]">{role.name}</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F7F8FA] text-[#6B7280] font-mono">
                  {role.code}
                </span>
                {role.builtin ? (
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
                {role.description || <span className="text-[#D1D5DB] italic">无描述</span>}
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
                编辑信息
              </button>
              {!role.builtin && (
                <button
                  onClick={() => {
                    if (confirm(`确定删除角色 "${role.name}" 吗?此操作无法撤销。`)) {
                      remove.mutate();
                    }
                  }}
                  disabled={remove.isPending || role.userCount > 0}
                  className="p-1.5 rounded text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={role.userCount > 0 ? `仍有 ${role.userCount} 个用户持有此角色,无法删除` : "删除角色"}
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

/* ─── Tab: 权限配置 ─── */
function PermissionsTab({
  role, permissions, onSaved,
}: {
  role: RoleDetail;
  permissions: Permission[];
  onSaved: () => void;
}) {
  const initialSet = useMemo(() => new Set(role.permissions.map((p) => p.id)), [role]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSet));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set(role.permissions.map((p) => p.id)));
    setError(null);
  }, [role.id, role.permissions]);

  const dirty = useMemo(() => {
    if (selected.size !== initialSet.size) return true;
    for (const id of selected) if (!initialSet.has(id)) return true;
    return false;
  }, [selected, initialSet]);

  /* 按 category 分组 */
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const k = p.category;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [permissions]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(cat: string, all: boolean) {
    const list = grouped.get(cat) ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      if (all) list.forEach((p) => next.add(p.id));
      else list.forEach((p) => next.delete(p.id));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(permissions.map((p) => p.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  const save = useMutation({
    mutationFn: () => rolesApi.replacePermissions(role.id, Array.from(selected)),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#6B7280]">
          已勾选 <strong className="text-[#1A1A1A]">{selected.size}</strong> / {permissions.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={selectAll}
          className="text-xs px-2 py-1 rounded border border-[#E9E9E9] hover:bg-[#F7F8FA]"
        >
          全选
        </button>
        <button
          onClick={clearAll}
          className="text-xs px-2 py-1 rounded border border-[#E9E9E9] hover:bg-[#F7F8FA]"
        >
          清空
        </button>
      </div>

      {PERMISSION_CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat);
        if (!list || list.length === 0) return null;
        const checkedInGroup = list.filter((p) => selected.has(p.id)).length;
        const allChecked = checkedInGroup === list.length;
        const anyChecked = checkedInGroup > 0;
        return (
          <div key={cat} className="border border-[#E9E9E9] rounded-md overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F8FA] border-b border-[#E9E9E9]">
              <Checkbox
                checked={allChecked}
                indeterminate={anyChecked && !allChecked}
                onChange={(checked) => toggleGroup(cat, checked)}
              />
              <span className="text-xs font-bold text-[#1A1A1A]">
                {PERMISSION_CATEGORY_LABELS[cat as keyof typeof PERMISSION_CATEGORY_LABELS] ?? cat}
              </span>
              <span className="text-[10px] text-[#9CA3AF]">
                {checkedInGroup} / {list.length}
              </span>
            </div>
            <div className="divide-y divide-[#F0F0F0]">
              {list.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-[#F7F8FA] cursor-pointer"
                  >
                    <Checkbox checked={checked} onChange={() => toggle(p.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[#1A1A1A]">{p.name}</div>
                      <div className="text-[10px] text-[#9CA3AF] font-mono">{p.code}</div>
                    </div>
                    {p.pluginName ? (
                      <span className="text-[9px] px-1.5 py-px rounded bg-blue-50 text-blue-700 flex items-center gap-0.5">
                        <PackageIcon className="w-2.5 h-2.5" />
                        {p.pluginName}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-px rounded bg-gray-100 text-gray-500">
                        平台
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white border-t border-[#E9E9E9] flex justify-end gap-2">
        <button
          onClick={() => setSelected(new Set(initialSet))}
          disabled={!dirty}
          className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA] disabled:opacity-50"
        >
          重置
        </button>
        <button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {save.isPending ? "保存中…" : "保存权限"}
        </button>
      </div>
    </div>
  );
}

function Checkbox({
  checked, indeterminate, onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
      style={{
        borderColor: checked || indeterminate ? PARTY : "#D1D5DB",
        backgroundColor: checked || indeterminate ? PARTY : "white",
      }}
    >
      {checked && <CheckIcon className="w-3 h-3 text-white" />}
      {!checked && indeterminate && <span className="w-2 h-0.5 bg-white" />}
    </button>
  );
}

/* ─── Tab: 关联用户 ─── */
function UsersTab({ roleId }: { roleId: string }) {
  const usersQuery = useQuery({
    queryKey: ["role-users", roleId],
    queryFn: () => rolesApi.listUsers(roleId),
  });

  if (usersQuery.isLoading) {
    return <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>;
  }
  if (!usersQuery.data || usersQuery.data.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-[#9CA3AF]">
        没有用户持有此角色。在
        <span className="px-1 font-medium text-[#1A1A1A]">用户管理</span>
        页面为用户分配此角色。
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="text-[10px] text-[#9CA3AF] mb-3">
        如需分配/解除角色,请到 <span className="text-[var(--party-primary)]">用户管理</span> 页面的"角色权限"标签
      </div>
      <div className="space-y-1">
        {usersQuery.data.map((u) => (
          <div
            key={u.userId}
            className="flex items-center gap-3 px-3 py-2.5 border border-[#F0F0F0] rounded-md"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {u.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#1A1A1A] truncate flex items-center gap-1.5">
                {u.name}
                {!u.active && (
                  <span className="text-[9px] px-1 py-px rounded bg-gray-100 text-gray-500">离职</span>
                )}
              </div>
              <div className="text-[10px] text-[#9CA3AF] truncate">员工编号 {u.username}</div>
            </div>
            <div className="text-right flex flex-col items-end gap-0.5 min-w-0 max-w-[200px]">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: "#EEF4FF", color: ADMIN }}
              >
                {SCOPE_LABELS[u.scope]}
              </span>
              {u.scopeOrgs.length > 0 && (
                <span className="text-[9px] text-[#9CA3AF] truncate" title={u.scopeOrgs.map((o) => o.name).join(", ")}>
                  {u.scopeOrgs.map((o) => o.name).join(" · ")}
                </span>
              )}
            </div>
            <ChevronRightIcon className="w-4 h-4 text-[#D1D5DB]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Create Dialog
   ═══════════════════════════════════════════════════════════════ */

function CreateRoleDialog({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (r: RoleDetail) => void;
}) {
  const [form, setForm] = useState<CreateRoleInput>({ code: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      rolesApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
      }),
    onSuccess: (r) => onCreated(r),
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "创建失败");
    },
  });

  const canSubmit = /^[a-z][a-z0-9_.]{1,59}$/.test(form.code) && form.name.trim().length >= 1;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl pointer-events-auto">
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-[var(--party-primary)]" />
              新建自定义角色
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <Field label="角色代码 *" hint="小写字母数字 _ . ,首位字母 (如 dept_manager)">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="如 portal_admin"
                className="w-full px-2.5 py-1.5 text-sm font-mono border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <Field label="显示名 *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 门户管理员"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <Field label="描述">
              <textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)] resize-none"
              />
            </Field>
            <div className="text-[10px] text-[#9CA3AF] bg-[#F7F8FA] border border-[#E9E9E9] rounded-md p-2.5">
              创建后,在右侧"权限配置"标签勾选具体权限点。自定义角色可以随时删除(无用户持有时)。
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
