import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldIcon, PlusIcon, SearchIcon, XIcon, TrashIcon, AlertCircleIcon,
  CheckIcon, UsersIcon, KeyIcon, LockIcon, PackageIcon, RefreshCwIcon,
  BadgeCheckIcon, UserPlusIcon, Loader2, FilterIcon,
} from "lucide-react";
import {
  rolesApi,
  type RoleListItem,
  type RoleDetail,
  type CreateRoleInput,
  type BatchAssignRoleUsersResult,
} from "@/features/role";
import {
  permissionsApi,
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_CATEGORY_ORDER,
  type Permission,
} from "@/features/permission";
import {
  usersApi,
  SCOPE_LABELS,
  ScopeOrgSelector,
  buildOrgIndex,
  UserFilterPanel,
  buildQueryFromFilters,
  countActiveFilters,
  type ScopeValue,
  type UserFilters,
} from "@/features/user";
import { organizationsApi } from "@/features/organization";
import { useAuth } from "@/stores/auth";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { matchesPinyin, highlightMatch } from "@/shared/lib/pinyinSearch";
import { toast } from "sonner";

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
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  /* 选中角色 = 用户点选的,否则默认第一个(渲染期派生,免 effect 同步) */
  const selectedId = pickedId ?? rolesQuery.data?.[0]?.id ?? null;
  const setSelectedId = setPickedId;

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
      {/* key=role.id:换角色 = 重挂载(表单/编辑态随之重置,免 effect 同步) */}
      <RoleHeader key={role.id} role={role} onChanged={afterMutate} onDeleted={onDeleted} />

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
          <PermissionsTab key={role.id} role={role} permissions={permissions} onSaved={afterMutate} />
        ) : (
          // key=role.id:换角色重挂载 —— 勾选集/批量面板筛选态不跨角色残留(否则 A 角色勾的人
          // 在 B 角色里预勾选,「移除选中」会误伤;同 PermissionsTab 的 key 重挂载范式)
          <UsersTab key={role.id} roleId={role.id} roleName={role.name} onChanged={afterMutate} />
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
  // 换角色由父级 key=role.id 重挂载重置;保存成功后 selected 本就等于新服务端状态,无需 effect 回同步
  const initialSet = useMemo(() => new Set(role.permissions.map((p) => p.id)), [role]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSet));
  const [error, setError] = useState<string | null>(null);

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

/* ─── Tab: 关联用户(可直接加/减成员)─── */
function errMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const msg = e.response?.data?.message;
  return Array.isArray(msg) ? msg.join("; ") : msg ?? e.message ?? fallback;
}

function UsersTab({
  roleId, roleName, onChanged,
}: {
  roleId: string;
  roleName: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { me } = useAuth();
  // 角色分配 = 授权动作,仅系统管理员(admin:role:write,内置只有 platform_admin)可加/减成员
  const canWrite = !!me?.isPlatformAdmin || (me?.permissions ?? []).includes("admin:role:write");
  const [panel, setPanel] = useState<"single" | "batch" | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const usersQuery = useQuery({
    queryKey: ["role-users", roleId],
    queryFn: () => rolesApi.listUsers(roleId),
  });

  function afterChange() {
    qc.invalidateQueries({ queryKey: ["role-users", roleId] });
    // 用户管理页(keep-alive 常驻 + 全局不随焦点重取)的角色数/角色筛选也要跟上
    qc.invalidateQueries({ queryKey: ["users"] });
    onChanged();
  }

  const removeMut = useMutation({
    mutationFn: (userId: string) => rolesApi.removeUser(roleId, userId),
    onSuccess: (_data, userId) => {
      // 修剪勾选集:被移除的 id 若留着,此人日后重新入组会带着旧勾选态"复活"
      setChecked((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      afterChange();
      toast.success("已解除该成员的角色");
    },
    onError: (err) => toast.error(errMsg(err, "解除失败")),
  });

  const batchRemoveMut = useMutation({
    mutationFn: (userIds: string[]) => rolesApi.batchRemoveUsers(roleId, userIds),
    onSuccess: (res) => {
      setChecked(new Set());
      afterChange();
      toast.success(`已批量移除 ${res.removed} 名成员`);
    },
    onError: (err) => toast.error(errMsg(err, "批量移除失败")),
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const existingIds = useMemo(() => new Set(users.map((u) => u.userId)), [users]);
  // 勾选集与当前成员求交派生(成员列表变化后不残留已移除的 id)
  const selectedIds = useMemo(
    () => users.filter((u) => checked.has(u.userId)).map((u) => u.userId),
    [users, checked],
  );
  const allChecked = users.length > 0 && selectedIds.length === users.length;

  return (
    <div className="p-5 space-y-3">
      {/* 顶部:成员数 + 添加 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6B7280]">
          共 <strong className="text-[#1A1A1A]">{users.length}</strong> 名成员
        </span>
        <div className="flex-1" />
        {canWrite ? (
          <>
            <button
              onClick={() => setPanel((p) => (p === "batch" ? null : "batch"))}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors"
              style={
                panel === "batch"
                  ? { borderColor: PARTY, color: PARTY, backgroundColor: PARTY_BG }
                  : { borderColor: "#E9E9E9", color: "#4B5563" }
              }
            >
              <FilterIcon className="w-3.5 h-3.5" />
              批量添加
            </button>
            <button
              onClick={() => setPanel((p) => (p === "single" ? null : "single"))}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white"
              style={{ backgroundColor: PARTY }}
            >
              <UserPlusIcon className="w-3.5 h-3.5" />
              添加成员
            </button>
          </>
        ) : (
          <span className="text-[10px] text-[#9CA3AF]">仅系统管理员可加/减成员</span>
        )}
      </div>

      {panel === "single" && canWrite && (
        <AddMemberPanel
          roleId={roleId}
          roleName={roleName}
          existingIds={existingIds}
          onClose={() => setPanel(null)}
          onAdded={() => {
            afterChange();
            toast.success("已添加成员");
          }}
        />
      )}

      {panel === "batch" && canWrite && (
        <BatchAddPanel
          roleId={roleId}
          roleName={roleName}
          existingIds={existingIds}
          onClose={() => setPanel(null)}
          onDone={(res) => {
            afterChange();
            toast.success(
              `批量授予完成:新增 ${res.added} 人,更新范围 ${res.updated} 人` +
                (res.missing > 0 ? `(${res.missing} 个用户不存在,已跳过)` : ""),
            );
          }}
        />
      )}

      {/* 批量移除工具条 */}
      {canWrite && users.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#FAFBFC] border border-[#F0F0F0]">
          <Checkbox
            checked={allChecked}
            indeterminate={selectedIds.length > 0 && !allChecked}
            onChange={(v) => setChecked(v ? new Set(users.map((u) => u.userId)) : new Set())}
          />
          <span className="text-[10px] text-[#6B7280]">
            {selectedIds.length > 0 ? `已选 ${selectedIds.length} 人` : "全选"}
          </span>
          <div className="flex-1" />
          <button
            disabled={selectedIds.length === 0 || batchRemoveMut.isPending}
            onClick={() => {
              if (confirm(`批量解除 ${selectedIds.length} 名成员的「${roleName}」角色?`)) {
                batchRemoveMut.mutate(selectedIds);
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <TrashIcon className="w-3 h-3" />
            {batchRemoveMut.isPending
              ? "移除中…"
              : `移除选中${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>
      )}

      {usersQuery.isLoading ? (
        <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#9CA3AF]">
          还没有成员。{canWrite ? "点「添加成员」直接分配。" : "在用户管理页为用户分配此角色。"}
        </div>
      ) : (
        <div className="space-y-1">
          {users.map((u) => (
            <div
              key={u.userId}
              className="flex items-center gap-3 px-3 py-2.5 border border-[#F0F0F0] rounded-md"
            >
              {canWrite && (
                <Checkbox
                  checked={checked.has(u.userId)}
                  onChange={(v) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(u.userId);
                      else next.delete(u.userId);
                      return next;
                    })
                  }
                />
              )}
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
              {canWrite && (
                <button
                  onClick={() => {
                    if (confirm(`解除 ${u.name} 的「${roleName}」角色?`)) removeMut.mutate(u.userId);
                  }}
                  disabled={removeMut.isPending}
                  className="p-1.5 rounded text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
                  title="解除该角色"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 添加成员面板(搜人 + 数据范围 + custom 锚点)─── */
function AddMemberPanel({
  roleId, roleName, existingIds, onClose, onAdded,
}: {
  roleId: string;
  roleName: string;
  existingIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [picked, setPicked] = useState<{ id: string; name: string; username: string } | null>(null);
  const [scope, setScope] = useState<ScopeValue>("self");
  const [scopeOrgIds, setScopeOrgIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // directory:通讯录级检索,不受数据范围收敛(可给任意单位的人授角色)
  const searchQuery = useQuery({
    queryKey: ["role-add-search", debounced],
    queryFn: () => usersApi.directory(debounced.trim() || undefined, 20),
    enabled: debounced.trim().length >= 1,
    staleTime: 30_000,
  });
  const candidates = useMemo(
    () => (searchQuery.data?.items ?? []).filter((u) => !existingIds.has(u.id)),
    [searchQuery.data, existingIds],
  );

  // custom 锚点:按需拉两棵组织树(admin + party)
  const adminTreeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
    enabled: scope === "custom",
  });
  const partyTreeQuery = useQuery({
    queryKey: ["org-tree", "party"],
    queryFn: () => organizationsApi.tree("party"),
    staleTime: 60_000,
    enabled: scope === "custom",
  });
  const allOrgsById = useMemo(
    () => buildOrgIndex(adminTreeQuery.data ?? [], partyTreeQuery.data ?? []),
    [adminTreeQuery.data, partyTreeQuery.data],
  );

  const addMut = useMutation({
    mutationFn: () =>
      rolesApi.addUser(roleId, {
        userId: picked!.id,
        scope,
        scopeOrgIds: scope === "custom" ? scopeOrgIds : undefined,
      }),
    onSuccess: () => {
      setError(null);
      onAdded();
      onClose();
    },
    onError: (err) => setError(errMsg(err, "添加失败")),
  });

  const canSubmit = !!picked && (scope !== "custom" || scopeOrgIds.length > 0);

  return (
    <div className="border border-[#E9E9E9] rounded-lg bg-[#FAFBFC] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlusIcon className="w-4 h-4" style={{ color: PARTY }} />
        <span className="text-xs font-semibold text-[#1A1A1A]">添加成员到「{roleName}」</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-white" title="收起">
          <XIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
        </button>
      </div>

      {/* 选人 */}
      {picked ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-[#E9E9E9] rounded-md">
          <div className="w-6 h-6 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {picked.name.charAt(0)}
          </div>
          <span className="text-xs text-[#1A1A1A]">{picked.name}</span>
          <span className="text-[10px] text-[#9CA3AF] font-mono">{picked.username}</span>
          <div className="flex-1" />
          <button
            onClick={() => setPicked(null)}
            className="text-[10px] text-[var(--party-primary)] hover:underline"
          >
            重选
          </button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
            {searchQuery.isFetching && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            )}
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名 / 员工编号"
              className="w-full pl-7 pr-7 py-1.5 text-xs rounded-md border border-[#E9E9E9] bg-white focus:outline-none focus:border-[var(--party-primary)]"
            />
          </div>
          {debounced.trim().length >= 1 && (
            <div className="mt-1.5 max-h-48 overflow-auto rounded-md border border-[#E9E9E9] bg-white divide-y divide-[#F0F0F0]">
              {searchQuery.isLoading ? (
                <div className="px-3 py-3 text-xs text-[#9CA3AF] text-center">搜索中…</div>
              ) : candidates.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#9CA3AF] text-center">无匹配(或都已在此角色)</div>
              ) : (
                candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setPicked({ id: u.id, name: u.name, username: u.username });
                      setSearch("");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-party-soft"
                  >
                    <span className="text-xs text-[#1A1A1A] truncate">{u.name}</span>
                    <span className="text-[10px] text-[#9CA3AF] font-mono">{u.username}</span>
                    {u.primaryAdmin && (
                      <span className="text-[10px] text-[#9CA3AF] truncate ml-auto">
                        {u.primaryAdmin.orgName}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 数据范围 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#6B7280] w-14 flex-shrink-0">数据范围</span>
        <select
          value={scope}
          onChange={(e) => {
            const v = e.target.value as ScopeValue;
            setScope(v);
            if (v !== "custom") setScopeOrgIds([]);
          }}
          className="text-xs px-2 py-1 border border-[#E9E9E9] rounded flex-1 bg-white"
        >
          {(["self", "own", "subtree", "all", "custom"] as ScopeValue[]).map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {scope === "custom" && (
        <ScopeOrgSelector allOrgsById={allOrgsById} selectedIds={scopeOrgIds} onChange={setScopeOrgIds} />
      )}

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-white"
        >
          取消
        </button>
        <button
          disabled={!canSubmit || addMut.isPending}
          onClick={() => addMut.mutate()}
          className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {addMut.isPending ? "添加中…" : "确认添加"}
        </button>
      </div>
    </div>
  );
}

/* ─── 批量添加面板(筛选器圈人 + 整批统一数据范围)───
   复用用户管理页的 UserFilterPanel(含检索模板,如内置「部门管理人员」):
   筛选条件 → GET /users/ids 取全部命中 id(>5000 后端 400 提示收窄)→
   预览命中数/样例/已持有重叠 → 确认 → POST /roles/:id/users/batch 一次写入。 */
function BatchAddPanel({
  roleId, roleName, existingIds, onClose, onDone,
}: {
  roleId: string;
  roleName: string;
  existingIds: Set<string>;
  onClose: () => void;
  onDone: (res: BatchAssignRoleUsersResult) => void;
}) {
  const { me } = useAuth();
  const [filters, setFilters] = useState<UserFilters>({});
  const [scope, setScope] = useState<ScopeValue>("self");
  const [scopeOrgIds, setScopeOrgIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const activeCount = countActiveFilters(filters);
  const query = useMemo(() => buildQueryFromFilters(filters), [filters]);

  // 筛选面板依赖:行政树 + 角色列表(与页面级查询同 key,命中缓存)
  const adminTreeQuery = useQuery({
    queryKey: ["org-tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });
  const rolesListQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
    staleTime: 60_000,
  });

  // 命中人群:全部 id(提交名单)+ 前 8 个样例(核对圈的是谁)。无筛选条件不发请求(会圈全库)。
  const idsQuery = useQuery({
    queryKey: ["role-batch-ids", query],
    queryFn: () => usersApi.listIds(query),
    enabled: activeCount > 0,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    retry: false, // 超上限 400 是明确指令(收窄条件),重试无意义
  });
  const sampleQuery = useQuery({
    queryKey: ["role-batch-sample", query],
    queryFn: () => usersApi.list({ ...query, take: 8 }),
    enabled: activeCount > 0,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  // custom 锚点:按需拉党组织树(行政树上面已拉)
  const partyTreeQuery = useQuery({
    queryKey: ["org-tree", "party"],
    queryFn: () => organizationsApi.tree("party"),
    staleTime: 60_000,
    enabled: scope === "custom",
  });
  const allOrgsById = useMemo(
    () => buildOrgIndex(adminTreeQuery.data ?? [], partyTreeQuery.data ?? []),
    [adminTreeQuery.data, partyTreeQuery.data],
  );

  const ids = activeCount > 0 && !idsQuery.isError ? idsQuery.data?.ids : undefined;
  const overlap = useMemo(
    () => (ids ?? []).reduce((n, id) => n + (existingIds.has(id) ? 1 : 0), 0),
    [ids, existingIds],
  );
  const sampleItems = sampleQuery.data?.items ?? [];

  const addMut = useMutation({
    mutationFn: () =>
      rolesApi.batchAddUsers(roleId, {
        userIds: ids!,
        scope,
        scopeOrgIds: scope === "custom" ? scopeOrgIds : undefined,
      }),
    onSuccess: (res) => {
      setError(null);
      onDone(res);
      onClose();
    },
    onError: (err) => setError(errMsg(err, "批量添加失败")),
  });

  // isFetching 时禁提交:placeholderData 保留的是上一次筛选的名单,条件刚改就点会提交旧名单
  const canSubmit =
    !!ids && ids.length > 0 && !idsQuery.isFetching &&
    (scope !== "custom" || scopeOrgIds.length > 0);

  return (
    <div className="border border-[#E9E9E9] rounded-lg bg-[#FAFBFC] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3">
        <FilterIcon className="w-4 h-4" style={{ color: PARTY }} />
        <span className="text-xs font-semibold text-[#1A1A1A]">
          按筛选条件批量添加成员到「{roleName}」
        </span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-white" title="收起">
          <XIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
        </button>
      </div>

      {/* 筛选器:与用户管理页同一面板(含检索模板,如「★ 部门管理人员」) */}
      <UserFilterPanel
        filters={filters}
        onChange={setFilters}
        adminTree={adminTreeQuery.data ?? []}
        roles={rolesListQuery.data ?? []}
        uid={me?.id ?? "anon"}
      />

      <div className="px-3 py-3 space-y-3">
        {/* 命中统计 */}
        {activeCount === 0 ? (
          <div className="text-xs text-[#9CA3AF]">
            先设置至少一项筛选条件(可点检索模板一键套用,如「★ 部门管理人员」)。
          </div>
        ) : idsQuery.isError ? (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
            {errMsg(idsQuery.error, "统计命中人数失败")}
          </div>
        ) : !ids ? (
          <div className="text-xs text-[#9CA3AF]">统计命中人数中…</div>
        ) : (
          <div className="text-xs text-[#1A1A1A] space-y-1.5">
            <div>
              命中 <strong style={{ color: PARTY }}>{ids.length}</strong> 人
              {overlap > 0 && (
                <span className="text-[#6B7280]">
                  (其中 {overlap} 人已持有该角色,将覆盖更新其数据范围)
                </span>
              )}
              {idsQuery.isFetching && (
                <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-[#9CA3AF]" />
              )}
            </div>
            {sampleItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {sampleItems.map((u) => (
                  <span
                    key={u.id}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#E9E9E9] text-[#4B5563]"
                  >
                    {u.name}
                  </span>
                ))}
                {ids.length > sampleItems.length && (
                  <span className="text-[10px] text-[#9CA3AF]">等 {ids.length} 人</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 数据范围(整批统一) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#6B7280] w-14 flex-shrink-0">数据范围</span>
          <select
            value={scope}
            onChange={(e) => {
              const v = e.target.value as ScopeValue;
              setScope(v);
              if (v !== "custom") setScopeOrgIds([]);
            }}
            className="text-xs px-2 py-1 border border-[#E9E9E9] rounded flex-1 bg-white"
          >
            {(["self", "own", "subtree", "all", "custom"] as ScopeValue[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[10px] text-[#9CA3AF]">
          own / subtree 按各成员本人所在单位自动推导(每人落到自己的组织);custom = 全批共用下方所选锚点。
        </div>
        {scope === "custom" && (
          <ScopeOrgSelector
            allOrgsById={allOrgsById}
            selectedIds={scopeOrgIds}
            onChange={setScopeOrgIds}
          />
        )}

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
            <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-white"
          >
            取消
          </button>
          <button
            disabled={!canSubmit || addMut.isPending}
            onClick={() => {
              if (!ids) return;
              const lines = [
                `将给 ${ids.length} 人授予「${roleName}」(数据范围:${SCOPE_LABELS[scope]})。`,
                overlap > 0 ? `其中 ${overlap} 人已持有该角色,数据范围将被覆盖更新。` : "",
                "确认执行?",
              ]
                .filter(Boolean)
                .join("\n");
              if (confirm(lines)) addMut.mutate();
            }}
            className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
            style={{ backgroundColor: PARTY }}
          >
            {addMut.isPending ? "批量授予中…" : `批量授予${ids ? ` (${ids.length} 人)` : ""}`}
          </button>
        </div>
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
