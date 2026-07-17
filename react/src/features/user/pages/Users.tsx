import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlusIcon, SearchIcon, RefreshCwIcon, XIcon,
  TrashIcon, PowerIcon, PowerOffIcon,
  ChevronRightIcon, ChevronUpIcon, ChevronDownIcon, ShieldIcon, NetworkIcon, IdCardIcon,
  PlusIcon, AlertCircleIcon, CheckIcon, SlidersHorizontalIcon, FilterIcon,
} from "lucide-react";
import {
  usersApi,
  type UserListItem,
  type UserDetail,
  type ListUsersQuery,
  type UserStats,
  type CreateUserInput,
  type MembershipInput,
  type RoleAssignmentInput,
  type ScopeValue,
  SCOPE_LABELS,
} from "@/features/user";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { rolesApi, type RoleListItem } from "@/features/role";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import {
  dictionariesApi, DICT_CODES, buildDictTree,
  type DictItem, type DictionaryDetail,
} from "@/features/dictionary";
import { userCustomFieldsApi, type UserCustomField } from "@/features/user-custom-field";
import { AvatarChanger, resolveAvatarUrl } from "@/features/avatar";
import { matchesPinyin, highlightMatch } from "@/shared/lib/pinyinSearch";
import { useAuth } from "@/stores/auth";
import { OrgPicker } from "../components/OrgPicker";
import { UserFilterPanel } from "../components/UserFilterPanel";
import { ScopeOrgSelector } from "../components/ScopeOrgSelector";
import { flattenTree, type FlatOrg } from "../components/orgFlatten";
import {
  buildQueryFromFilters,
  countActiveFilters,
  type UserFilters,
} from "../components/userFilters";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   Color tokens
   ═══════════════════════════════════════════════════════════════ */
const PARTY = "var(--party-primary)";
const PARTY_BG = "rgb(255, 240, 242)";
const ADMIN = "rgb(26, 107, 200)";
const ADMIN_BG = "rgb(238, 244, 255)";

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

/* FlatOrg / flattenTree / ScopeOrgSelector / MultiOrgSelector 抽到 components/ScopeOrgSelector.tsx
   与「角色与权限」页共用(角色成员的 scope 锚点配置)。 */

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export default function UsersPage() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const [filters, setFiltersRaw] = useState<UserFilters>({});
  const [take, setTake] = useState(50);
  const [skip, setSkip] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  /** 改任何筛选条件都回第 1 页 */
  function setFilters(f: UserFilters) {
    setFiltersRaw(f);
    setSkip(0);
  }

  /* 搜索分流:汉字/工号/邮箱走服务端全库搜索;纯字母视为拼音(服务端 LIKE 搜不到拼音,
     工号是数字、姓名是汉字)→ 不发服务端,仅在当前页内做拼音过滤 */
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const pinyinMode = debouncedSearch.length > 0 && /^[a-zA-Z]+$/.test(debouncedSearch);
  const serverSearch = !debouncedSearch || pinyinMode ? undefined : debouncedSearch;

  const adminTreeQuery = useQuery({
    queryKey: ["orgs", "tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });

  /* 单一数据源:筛选条件 + 搜索 + 分页 → 派生列表查询参数(子树由后端 adminOrgSubtree 展开) */
  const query: ListUsersQuery = useMemo(
    () => ({
      ...buildQueryFromFilters(filters),
      search: serverSearch,
      take,
      skip,
      sortBy: "createdAt",
      sortDir: "desc",
    }),
    [filters, serverSearch, take, skip],
  );

  const usersQuery = useQuery({
    queryKey: ["users", query],
    queryFn: () => usersApi.list(query),
    placeholderData: (prev) => prev, // 翻页/改过滤时保留上一页数据,避免整表闪空
  });

  /* 渲染期对账(幂等收敛,免 effect 同步;else-if 保证一轮只改一处):
     ① 服务端搜索词变化 → 回第 1 页(快照比对,一次收敛);
     ② skip 超出当前过滤的 total → 钳到末页 —— 否则「开未分配过滤翻到后页、逐个分配完」
        或「fetch 在途时按旧 total 点远页码」都会停在自相矛盾的空页不自愈。
        isPlaceholderData 时 data 属于旧 queryKey,不能拿来钳(此时 ② 自动跳过)。 */
  const [searchSnap, setSearchSnap] = useState<string | undefined>(undefined);
  const freshData = usersQuery.isPlaceholderData ? undefined : usersQuery.data;
  if (searchSnap !== serverSearch) {
    setSearchSnap(serverSearch);
    setSkip(0);
  } else if (freshData && skip > 0 && skip >= freshData.total) {
    setSkip(freshData.total === 0 ? 0 : Math.floor((freshData.total - 1) / take) * take);
  }
  const statsQuery = useQuery({
    queryKey: ["users", "stats"],
    queryFn: () => usersApi.stats(),
    staleTime: 30_000,
  });
  const partyTreeQuery = useQuery({
    queryKey: ["orgs", "tree", "party"],
    queryFn: () => organizationsApi.tree("party"),
    staleTime: 60_000,
  });
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
    staleTime: 60_000,
  });

  const adminFlat = useMemo(() => flattenTree(adminTreeQuery.data ?? []), [adminTreeQuery.data]);
  const partyFlat = useMemo(() => flattenTree(partyTreeQuery.data ?? []), [partyTreeQuery.data]);
  const allOrgsById = useMemo(() => {
    const map = new Map<string, FlatOrg>();
    [...adminFlat, ...partyFlat].forEach((o) => map.set(o.id, o));
    return map;
  }, [adminFlat, partyFlat]);

  /* 拼音模式下的客户端过滤(仅作用于当前页;服务端搜索的结果直接透传) */
  const filteredItems = useMemo(() => {
    const items = usersQuery.data?.items ?? [];
    if (!pinyinMode) return items;
    const q = debouncedSearch.toLowerCase();
    return items.filter(
      (u) =>
        matchesPinyin(u.name, debouncedSearch) ||
        matchesPinyin(u.username, debouncedSearch) ||
        (u.email ? u.email.toLowerCase().includes(q) : false) ||
        (u.primaryAdmin ? matchesPinyin(u.primaryAdmin.orgName, debouncedSearch) : false),
    );
  }, [usersQuery.data, pinyinMode, debouncedSearch]);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["users"] }); // 前缀命中,连带 stats / detail
    qc.invalidateQueries({ queryKey: ["roles"] });
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ════ 工具条 ════ */}
      <Toolbar
        filters={filters}
        setFilters={setFilters}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        stats={statsQuery.data}
        pinyinMode={pinyinMode}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onRefresh={refreshAll}
        onCreate={() => setCreateOpen(true)}
        total={usersQuery.data?.total ?? 0}
        shown={filteredItems.length}
      />

      {/* ════ 筛选器面板(自定义点选筛选 + 检索模板) ════ */}
      {panelOpen && (
        <UserFilterPanel
          filters={filters}
          onChange={setFilters}
          adminTree={adminTreeQuery.data ?? []}
          roles={rolesQuery.data ?? []}
          uid={me?.id ?? "anon"}
        />
      )}

      {/* ════ 表格 ════ */}
      <div
        className="flex-1 min-h-0 overflow-auto transition-opacity"
        style={{ opacity: usersQuery.isFetching && !usersQuery.isLoading ? 0.6 : 1 }}
      >
        {usersQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">加载中…</div>
        ) : usersQuery.isError ? (
          <div className="p-8 text-center text-sm text-red-600">{(usersQuery.error as Error).message}</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#9CA3AF]">
            {pinyinMode
              ? "当前页无拼音匹配 · 输入汉字、员工编号或完整邮箱可全库搜索"
              : "无匹配用户"}
          </div>
        ) : (
          <UsersTable
            items={filteredItems}
            searchQuery={debouncedSearch}
            onSelect={(u) => setSelectedId(u.id)}
            selectedId={selectedId}
          />
        )}
      </div>

      {/* ════ 分页 ════ */}
      <PaginationBar
        total={usersQuery.data?.total ?? 0}
        skip={skip}
        take={take}
        onPageChange={setSkip}
        onTakeChange={(t) => {
          setTake(t);
          setSkip(0);
        }}
      />

      {/* ════ 详情抽屉 ════ */}
      {selectedId && (
        <UserDetailDrawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          adminTree={adminTreeQuery.data ?? []}
          partyTree={partyTreeQuery.data ?? []}
          adminFlat={adminFlat}
          partyFlat={partyFlat}
          allOrgsById={allOrgsById}
          roles={rolesQuery.data ?? []}
          onSaved={() => qc.invalidateQueries({ queryKey: ["users"] })}
        />
      )}

      {/* ════ 新建对话框 ════ */}
      {createOpen && (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(u) => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ["users"] });
            setSelectedId(u.id);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Toolbar (search + filters + create button)
   ═══════════════════════════════════════════════════════════════ */

/** 未分配筛选的警示色(状态语义色,不跟主题色) */
const WARN = "rgb(194, 65, 12)";
const WARN_BG = "rgb(255, 247, 237)";
const WARN_BORDER = "rgb(234, 88, 12)";

function Toolbar({
  filters, setFilters, searchInput, setSearchInput, stats, pinyinMode, panelOpen, onTogglePanel, onRefresh, onCreate, total, shown,
}: {
  filters: UserFilters;
  setFilters: (f: UserFilters) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  stats: UserStats | undefined;
  pinyinMode: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onRefresh: () => void;
  onCreate: () => void;
  total: number;
  shown: number;
}) {
  const activeCount = countActiveFilters(filters);
  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[#E9E9E9] flex items-center gap-3 flex-wrap">
      <h1 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
        <NetworkIcon className="w-4 h-4 text-[var(--party-primary)]" />
        用户管理
      </h1>
      <span className="text-xs text-[#9CA3AF]">
        共 {total} 人{pinyinMode && ` · 当前页拼音匹配 ${shown} 人`}
      </span>

      <div className="flex-1" />

      {/* 筛选器(自定义点选筛选 + 检索模板;行政机构/职务/政治面貌/角色/部门负责人都在里面) */}
      <button
        onClick={onTogglePanel}
        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border transition-colors"
        style={{
          backgroundColor: activeCount > 0 || panelOpen ? PARTY_BG : "white",
          borderColor: activeCount > 0 || panelOpen ? PARTY : "#E9E9E9",
          color: activeCount > 0 || panelOpen ? PARTY : "#4B5563",
        }}
      >
        <FilterIcon className="w-3.5 h-3.5" />
        筛选器
        {activeCount > 0 && (
          <span
            className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white inline-flex items-center justify-center"
            style={{ backgroundColor: PARTY }}
          >
            {activeCount}
          </span>
        )}
        {panelOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
      </button>

      {/* 状态过滤 */}
      <select
        value={filters.active === undefined ? "" : String(filters.active)}
        onChange={(e) => {
          const v = e.target.value;
          setFilters({ ...filters, active: v === "" ? undefined : v === "true" });
        }}
        className="text-xs px-2 py-1.5 rounded-md border border-[#E9E9E9] bg-white"
      >
        <option value="">全部状态</option>
        <option value="true">仅在职</option>
        <option value="false">仅离职</option>
      </select>

      {/* 仅党员(与「党组织未分配」互斥) */}
      <button
        onClick={() => {
          const next = !filters.hasParty;
          setFilters({
            ...filters,
            hasParty: next ? true : undefined,
            noPartyOrg: next ? undefined : filters.noPartyOrg,
          });
        }}
        className="text-xs px-2 py-1.5 rounded-md border transition-colors"
        style={{
          backgroundColor: filters.hasParty ? PARTY_BG : "white",
          borderColor: filters.hasParty ? PARTY : "#E9E9E9",
          color: filters.hasParty ? PARTY : "#4B5563",
        }}
      >
        仅党员
      </button>

      {/* 行政机构未分配(与筛选器里的行政机构/属于部门互斥 —— 组合起来结构性恒空) */}
      <button
        onClick={() => {
          const next = !filters.noAdminOrg;
          setFilters({
            ...filters,
            noAdminOrg: next ? true : undefined,
            orgId: next ? undefined : filters.orgId,
            orgSubtree: next ? undefined : filters.orgSubtree,
            inDept: next ? undefined : filters.inDept,
          });
        }}
        title="只看未挂任何行政机构的人员"
        className="text-xs px-2 py-1.5 rounded-md border transition-colors"
        style={{
          backgroundColor: filters.noAdminOrg ? WARN_BG : "white",
          borderColor: filters.noAdminOrg ? WARN_BORDER : "#E9E9E9",
          color: filters.noAdminOrg ? WARN : "#4B5563",
        }}
      >
        行政未分配{stats !== undefined && ` ${stats.noAdminOrg}`}
      </button>

      {/* 党组织未分配(与「仅党员」互斥) */}
      <button
        onClick={() => {
          const next = !filters.noPartyOrg;
          setFilters({
            ...filters,
            noPartyOrg: next ? true : undefined,
            hasParty: next ? undefined : filters.hasParty,
          });
        }}
        title="只看政治面貌为中共党员/中共预备党员、但未加入任何党组织的人员"
        className="text-xs px-2 py-1.5 rounded-md border transition-colors"
        style={{
          backgroundColor: filters.noPartyOrg ? WARN_BG : "white",
          borderColor: filters.noPartyOrg ? WARN_BORDER : "#E9E9E9",
          color: filters.noPartyOrg ? WARN : "#4B5563",
        }}
      >
        党组织未分配{stats !== undefined && ` ${stats.noPartyOrg}`}
      </button>

      {/* 搜索 */}
      <div className="relative">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
        <input
          type="text"
          placeholder="搜索姓名/员工编号/邮箱"
          title="汉字、员工编号、邮箱(含 @)走全库搜索;纯字母按拼音在当前页内匹配"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-7 pr-2 py-1.5 text-xs rounded-md border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)] w-56"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#F7F8FA]"
          >
            <XIcon className="w-3 h-3 text-[#9CA3AF]" />
          </button>
        )}
      </div>

      <button
        onClick={onRefresh}
        className="p-1.5 rounded-md hover:bg-[#F7F8FA] text-[#6B7280]"
        title="刷新"
      >
        <RefreshCwIcon className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
        style={{ backgroundColor: PARTY }}
      >
        <UserPlusIcon className="w-3.5 h-3.5" />
        新建用户
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PaginationBar — 底部分页条(每页条数 + 页码窗口 + 跳页)
   ═══════════════════════════════════════════════════════════════ */

/** 页码窗口:首尾 + 当前页 ±1,间隔用省略号(如 1 2 … 41 42 43 … 416 417) */
function pageWindow(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, 2, pages - 1, pages, current - 1, current, current + 1]);
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of list) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function PaginationBar({
  total, skip, take, onPageChange, onTakeChange,
}: {
  total: number;
  skip: number;
  take: number;
  /** 传新的 skip(条数偏移) */
  onPageChange: (skip: number) => void;
  onTakeChange: (take: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / take));
  const current = Math.min(pages, Math.floor(skip / take) + 1);
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(total, skip + take);
  const [jumpInput, setJumpInput] = useState("");

  function jump() {
    const n = parseInt(jumpInput, 10);
    if (!Number.isFinite(n)) return;
    const page = Math.min(pages, Math.max(1, n));
    onPageChange((page - 1) * take);
    setJumpInput("");
  }

  return (
    <div className="flex-shrink-0 px-4 py-2 border-t border-[#E9E9E9] bg-white flex items-center gap-3 flex-wrap text-xs text-[#6B7280]">
      <span>
        第 {from}–{to} 条 · 共 {total} 人
      </span>

      <div className="flex-1" />

      <label className="flex items-center gap-1.5">
        每页
        <select
          value={take}
          onChange={(e) => onTakeChange(parseInt(e.target.value, 10))}
          className="px-1.5 py-1 rounded border border-[#E9E9E9] bg-white"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        人
      </label>

      <div className="flex items-center gap-1">
        <button
          disabled={current <= 1}
          onClick={() => onPageChange((current - 2) * take)}
          className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
        >
          上一页
        </button>
        {pageWindow(current, pages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-[#D1D5DB]">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange((p - 1) * take)}
              className="min-w-[28px] px-1.5 py-1 rounded border text-center"
              style={
                p === current
                  ? { backgroundColor: PARTY, borderColor: PARTY, color: "white", fontWeight: 600 }
                  : { borderColor: "#E9E9E9" }
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          disabled={current >= pages}
          onClick={() => onPageChange(current * take)}
          className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
        >
          下一页
        </button>
      </div>

      {pages > 5 && (
        <label className="flex items-center gap-1.5">
          跳至
          <input
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && jump()}
            placeholder={`1-${pages}`}
            className="w-16 px-1.5 py-1 rounded border border-[#E9E9E9] focus:outline-none focus:border-[var(--party-primary)]"
          />
          页
          <button
            onClick={jump}
            disabled={!jumpInput}
            className="px-2 py-1 rounded border border-[#E9E9E9] disabled:opacity-40 hover:bg-[#F7F8FA]"
          >
            跳转
          </button>
        </label>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Table
   ═══════════════════════════════════════════════════════════════ */

function UsersTable({
  items, searchQuery, onSelect, selectedId,
}: {
  items: UserListItem[];
  searchQuery: string;
  onSelect: (u: UserListItem) => void;
  selectedId: string | null;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-[#F7F8FA] z-10">
        <tr className="text-left text-[11px] text-[#6B7280] uppercase tracking-wider">
          <th className="px-4 py-2 font-medium w-[220px]">姓名 / 员工编号</th>
          <th className="px-4 py-2 font-medium">主行政岗位</th>
          <th className="px-4 py-2 font-medium">党组织归属</th>
          <th className="px-4 py-2 font-medium w-[80px]">角色</th>
          <th className="px-4 py-2 font-medium w-[80px]">归属</th>
          <th className="px-4 py-2 font-medium w-[80px]">状态</th>
          <th className="px-4 py-2 font-medium w-[60px] text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((u) => {
          const active = u.id === selectedId;
          return (
            <tr
              key={u.id}
              onClick={() => onSelect(u)}
              className="border-b border-[#F0F0F0] cursor-pointer transition-colors"
              style={{ backgroundColor: active ? "rgba(200, 0, 30, 0.04)" : undefined }}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                      <HighlightedText text={u.name} query={searchQuery} />
                    </span>
                    <span className="text-[10px] text-[#9CA3AF] truncate">员工编号 {u.username}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5">
                {u.primaryAdmin ? (
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs text-[#1A1A1A]">
                      <HighlightedText text={u.primaryAdmin.orgName} query={searchQuery} />
                    </span>
                    {u.primaryAdmin.position && (
                      <span
                        className="text-[10px] font-medium mt-0.5 self-start px-1.5 py-px rounded"
                        style={{ backgroundColor: ADMIN_BG, color: ADMIN }}
                      >
                        {u.primaryAdmin.position}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-[#D1D5DB]">未分配</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {u.partyAffiliation ? (
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs text-[#1A1A1A]">{u.partyAffiliation.orgName}</span>
                    {u.partyAffiliation.position && (
                      <span
                        className="text-[10px] font-medium mt-0.5 self-start px-1.5 py-px rounded"
                        style={{ backgroundColor: PARTY_BG, color: PARTY }}
                      >
                        {u.partyAffiliation.position}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-[#D1D5DB]">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1 text-xs text-[#4B5563]">
                  <ShieldIcon className="w-3 h-3" />
                  {u.roleCount}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1 text-xs text-[#4B5563]">
                  <IdCardIcon className="w-3 h-3" />
                  {u.membershipCount}
                </span>
              </td>
              <td className="px-4 py-2.5">
                {u.active ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    <PowerIcon className="w-2.5 h-2.5" />
                    在职
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    <PowerOffIcon className="w-2.5 h-2.5" />
                    离职
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  className="p-1 rounded hover:bg-party-soft"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(u);
                  }}
                >
                  <ChevronRightIcon className="w-4 h-4 text-[#9CA3AF]" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const segs = highlightMatch(text, query);
  return (
    <>
      {segs.map((s, i) =>
        s.highlight ? (
          <mark key={i} className="bg-yellow-200 text-[#1A1A1A] rounded px-0.5">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Detail Drawer
   ═══════════════════════════════════════════════════════════════ */

function UserDetailDrawer({
  userId, onClose, adminTree, partyTree, adminFlat, partyFlat, allOrgsById, roles, onSaved,
}: {
  userId: string;
  onClose: () => void;
  adminTree: OrgTreeNode[];
  partyTree: OrgTreeNode[];
  adminFlat: FlatOrg[];
  partyFlat: FlatOrg[];
  allOrgsById: Map<string, FlatOrg>;
  roles: RoleListItem[];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: () => usersApi.get(userId),
  });
  const [tab, setTab] = useState<"basic" | "org" | "role" | "ext">("basic");

  function afterMutate() {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["users", "detail", userId] });
    onSaved();
  }

  const u = detailQuery.data;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-screen w-[600px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#E9E9E9] flex items-center gap-3">
          {u ? (
            <>
              {resolveAvatarUrl(u.avatarUrl) ? (
                <img
                  src={resolveAvatarUrl(u.avatarUrl)}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-[#E9E9E9]"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-sm font-bold">
                  {u.name.charAt(0)}
                </div>
              )}
              <div className="flex flex-col leading-tight min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#1A1A1A] truncate">{u.name}</span>
                  {!u.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      已离职
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#9CA3AF]">员工编号 {u.username}</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-[#9CA3AF]">加载中…</span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF]"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 px-5 border-b border-[#E9E9E9] flex gap-1">
          {[
            { id: "basic" as const, label: "基本信息", icon: IdCardIcon },
            { id: "org"   as const, label: "组织归属", icon: NetworkIcon },
            { id: "role"  as const, label: "角色权限", icon: ShieldIcon  },
            { id: "ext"   as const, label: "扩展信息", icon: SlidersHorizontalIcon },
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
          {!u ? (
            <div className="p-8 text-center text-sm text-[#9CA3AF]">
              {detailQuery.isLoading ? "加载中…" : "用户不存在或已删除"}
            </div>
          ) : tab === "basic" ? (
            /* key=u.id:换用户 = tab 重挂载,表单态从 props 初始化(免 effect 同步) */
            <BasicInfoTab key={u.id} user={u} onSaved={afterMutate} />
          ) : tab === "org" ? (
            <MembershipsTab
              key={u.id}
              user={u}
              adminTree={adminTree}
              partyTree={partyTree}
              adminFlat={adminFlat}
              partyFlat={partyFlat}
              allOrgsById={allOrgsById}
              onSaved={afterMutate}
            />
          ) : tab === "role" ? (
            <RolesTab key={u.id} user={u} roles={roles} allOrgsById={allOrgsById} onSaved={afterMutate} />
          ) : (
            <ExtensionTab key={u.id} user={u} onSaved={afterMutate} />
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Tab: 基本信息 ─── */
function BasicInfoTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);
  const [showAvatarGen, setShowAvatarGen] = useState(false);

  const dirty =
    name !== user.name ||
    email !== (user.email ?? "") ||
    phone !== (user.phone ?? "") ||
    active !== user.active;

  const save = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        active,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  const avatarSrc = resolveAvatarUrl(user.avatarUrl);
  const setAvatarMut = useMutation({
    mutationFn: (url: string) => usersApi.update(user.id, { avatarUrl: url }),
    onSuccess: () => {
      setShowAvatarGen(false);
      toast.success("头像已更新");
      // 通讯录缓存里还留着该用户旧头像(onSaved 只失效 users 系)
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["directory"] });
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join("; ") : (msg ?? err.message ?? "设置头像失败"));
    },
  });

  return (
    <div className="p-5 space-y-4">
      {/* 头像:与个人设置同一 AvatarChanger(头像库挑选 / 上传照片 AI 生成) */}
      <Field label="头像" hint="从公共头像库挑选,或上传本人照片 AI 生成职场头像">
        <div className="flex items-center gap-3">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-1 ring-[#E9E9E9]"
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--party-primary)] text-lg font-bold text-white">
              {user.name.charAt(0)}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAvatarGen((v) => !v)}
            className="rounded-md border border-[#E9E9E9] px-3 py-1.5 text-xs text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
          >
            {showAvatarGen ? "收起" : "更换头像"}
          </button>
        </div>
        {showAvatarGen && (
          <div className="mt-3 rounded-lg border border-[#E9E9E9] bg-[#FAFAFA] p-3">
            <AvatarChanger
              onConfirm={(url) => setAvatarMut.mutate(url)}
              confirmLabel="设为该用户头像"
              targetName={user.name}
              employeeNumber={user.username}
            />
          </div>
        )}
      </Field>
      <Field label="姓名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      </Field>
      <Field label="员工编号" hint="同时作为登录账号,创建后不可修改">
        <input
          value={user.username}
          disabled
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md bg-[#F7F8FA] text-[#9CA3AF]"
        />
      </Field>
      <Field label="邮箱">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="可选"
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      </Field>
      <Field label="手机号">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="可选"
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      </Field>
      <Field label="启用状态">
        <button
          onClick={() => setActive((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#E9E9E9] text-sm w-full justify-between"
        >
          <span className={active ? "text-emerald-700" : "text-gray-500"}>
            {active ? "在职 (可登录)" : "已离职 (禁止登录)"}
          </span>
          <div
            className="w-9 h-5 rounded-full flex items-center transition-colors"
            style={{
              backgroundColor: active ? "rgb(16,185,129)" : "#D1D5DB",
              padding: "2px",
              justifyContent: active ? "flex-end" : "flex-start",
            }}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow" />
          </div>
        </button>
      </Field>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F0F0]">
        <button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {save.isPending ? "保存中…" : "保存"}
        </button>
      </div>

      <div className="pt-3 border-t border-[#F0F0F0] text-[10px] text-[#9CA3AF] space-y-0.5">
        <div>用户 ID: {user.id}</div>
        {user.externalId && <div>外部 ID: {user.externalId}</div>}
        <div>创建时间: {new Date(user.createdAt).toLocaleString()}</div>
        <div>更新时间: {new Date(user.updatedAt).toLocaleString()}</div>
      </div>
    </div>
  );
}

/* ─── Tab: 组织归属 ─── */
function MembershipsTab({
  user, adminTree, partyTree, adminFlat, partyFlat, onSaved,
}: {
  user: UserDetail;
  adminTree: OrgTreeNode[];
  partyTree: OrgTreeNode[];
  adminFlat: FlatOrg[];
  partyFlat: FlatOrg[];
  /** caller 还在传(签名兼容),本组件目前未直接消费 */
  allOrgsById: Map<string, FlatOrg>;
  onSaved: () => void;
}) {
  /* 拉两套职务字典(共享 staleTime 防频繁请求) */
  const adminPositionDict = useQuery({
    queryKey: ["dictionary-detail", DICT_CODES.ADMIN_POSITION],
    queryFn: () => dictionariesApi.get(DICT_CODES.ADMIN_POSITION),
    staleTime: 60_000,
  });
  const partyPositionDict = useQuery({
    queryKey: ["dictionary-detail", DICT_CODES.PARTY_POSITION],
    queryFn: () => dictionariesApi.get(DICT_CODES.PARTY_POSITION),
    staleTime: 60_000,
  });

  /* 编辑态: 行政归属数组 + 党组织归属(单条) */
  interface Row { orgId: string; position: string; isPrimary: boolean; }

  const initialAdmin = user.memberships.admin.map((m) => ({
    orgId: m.orgId,
    position: m.position ?? "",
    isPrimary: m.isPrimary,
  }));
  const initialPartyRaw = user.memberships.party[0];
  const initialParty: Row | null = initialPartyRaw
    ? { orgId: initialPartyRaw.orgId, position: initialPartyRaw.position ?? "", isPrimary: true }
    : null;

  const [adminRows, setAdminRows] = useState<Row[]>(initialAdmin);
  const [partyRow, setPartyRow] = useState<Row | null>(initialParty);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify({ a: adminRows, p: partyRow }) !== JSON.stringify({ a: initialAdmin, p: initialParty });

  function addAdminRow() {
    // 找一个还没用过的 admin org
    const used = new Set(adminRows.map((r) => r.orgId));
    const candidate = adminFlat.find((o) => !used.has(o.id));
    if (!candidate) return;
    setAdminRows([...adminRows, { orgId: candidate.id, position: "", isPrimary: adminRows.length === 0 }]);
  }

  function setAdminPrimary(idx: number) {
    setAdminRows((rows) => rows.map((r, i) => ({ ...r, isPrimary: i === idx })));
  }

  function removeAdminRow(idx: number) {
    setAdminRows((rows) => {
      const next = rows.filter((_, i) => i !== idx);
      // 如果删的是 primary,自动把第一行设为 primary
      if (rows[idx].isPrimary && next.length > 0 && !next.some((r) => r.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const memberships: MembershipInput[] = adminRows.map((r) => ({
        orgId: r.orgId,
        position: r.position || undefined,
        isPrimary: r.isPrimary,
      }));
      if (partyRow) {
        memberships.push({
          orgId: partyRow.orgId,
          position: partyRow.position || undefined,
          isPrimary: true,
        });
      }
      return usersApi.replaceMemberships(user.id, memberships);
    },
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  /* 党支部专用列表(仅 branch + temp_branch) */
  const partyBranchOptions = useMemo(
    () => partyFlat.filter((o) => o.type === "branch" || o.type === "temp_branch"),
    [partyFlat],
  );

  return (
    <div className="p-5 space-y-6">
      {/* ─── 行政机构 ─── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <NetworkIcon className="w-4 h-4" style={{ color: ADMIN }} />
          <h3 className="text-sm font-semibold text-[#1A1A1A]">行政机构归属</h3>
          <span className="text-[10px] text-[#9CA3AF]">可多归属 · 选一个为主岗位</span>
          <div className="flex-1" />
          <button
            onClick={addAdminRow}
            disabled={adminRows.length >= adminFlat.length}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-[#EEF4FF] disabled:opacity-50"
            style={{ color: ADMIN }}
          >
            <PlusIcon className="w-3 h-3" />
            添加
          </button>
        </div>

        {adminRows.length === 0 ? (
          <div className="text-xs text-[#9CA3AF] py-4 text-center border border-dashed border-[#E9E9E9] rounded-md">
            该用户未挂任何行政机构
          </div>
        ) : (
          <div className="space-y-2">
            {adminRows.map((row, idx) => {
              const usedExceptSelf = new Set(adminRows.filter((_, i) => i !== idx).map((r) => r.orgId));
              return (
                <div key={idx} className="flex items-center gap-2 p-2 border border-[#E9E9E9] rounded-md">
                  <OrgPicker
                    tree={adminTree}
                    value={row.orgId}
                    onChange={(orgId) =>
                      setAdminRows((rows) => rows.map((r, i) => (i === idx ? { ...r, orgId } : r)))
                    }
                    title="选择行政归属"
                    kind="admin"
                    excludeOrgIds={Array.from(usedExceptSelf)}
                  />
                  <DictPositionPicker
                    dict={adminPositionDict.data}
                    title="选择行政职务"
                    value={row.position}
                    onChange={(v) =>
                      setAdminRows((rows) => rows.map((r, i) => (i === idx ? { ...r, position: v } : r)))
                    }
                  />
                  <button
                    onClick={() => setAdminPrimary(idx)}
                    className="text-[10px] px-2 py-1 rounded transition-colors"
                    style={{
                      backgroundColor: row.isPrimary ? ADMIN : "transparent",
                      color: row.isPrimary ? "white" : ADMIN,
                      border: `1px solid ${ADMIN}`,
                    }}
                  >
                    {row.isPrimary ? <CheckIcon className="w-3 h-3 inline" /> : null} 主岗
                  </button>
                  <button
                    onClick={() => removeAdminRow(idx)}
                    className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600"
                    title="移除"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── 党组织 ─── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: PARTY }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          </span>
          <h3 className="text-sm font-semibold text-[#1A1A1A]">党组织归属</h3>
          <span className="text-[10px] text-[#9CA3AF]">最多 1 个 · 党员必须挂支部</span>
          <div className="flex-1" />
          {partyRow ? (
            <button
              onClick={() => setPartyRow(null)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-red-50 text-[#9CA3AF] hover:text-red-600"
            >
              <TrashIcon className="w-3 h-3" />
              清除
            </button>
          ) : (
            <button
              onClick={() =>
                setPartyRow({ orgId: partyBranchOptions[0]?.id ?? "", position: "党员", isPrimary: true })
              }
              disabled={partyBranchOptions.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-party-soft disabled:opacity-50"
              style={{ color: PARTY }}
            >
              <PlusIcon className="w-3 h-3" />
              设为党员
            </button>
          )}
        </div>

        {partyRow ? (
          <div className="flex items-center gap-2 p-2 border border-[#E9E9E9] rounded-md">
            <OrgPicker
              tree={partyTree}
              value={partyRow.orgId}
              onChange={(orgId) => setPartyRow({ ...partyRow, orgId })}
              title="选择党组织(党支部 / 临时党支部)"
              kind="party"
              selectableTypes={["branch", "temp_branch"]}
            />
            <DictPositionPicker
              dict={partyPositionDict.data}
              title="选择党组织职务"
              value={partyRow.position}
              onChange={(v) => setPartyRow({ ...partyRow, position: v })}
              width="w-36"
            />
          </div>
        ) : (
          <div className="text-xs text-[#9CA3AF] py-3 text-center border border-dashed border-[#E9E9E9] rounded-md">
            该用户未加入党组织
          </div>
        )}
      </section>

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F0F0]">
        <button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {save.isPending ? "保存中…" : "保存归属"}
        </button>
      </div>
    </div>
  );
}

/* ─── Tab: 角色权限 ─── */
function RolesTab({
  user, roles, allOrgsById, onSaved,
}: {
  user: UserDetail;
  roles: RoleListItem[];
  allOrgsById: Map<string, FlatOrg>;
  onSaved: () => void;
}) {
  interface RoleRow { roleId: string; scope: ScopeValue; scopeOrgIds: string[]; }

  const initial: RoleRow[] = user.roles.map((r) => ({
    roleId: r.roleId,
    scope: r.scope,
    scopeOrgIds: r.scopeOrgs.map((s) => s.id),
  }));
  const [rows, setRows] = useState<RoleRow[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function addRow() {
    const usedIds = new Set(rows.map((r) => r.roleId));
    const candidate = roles.find((r) => !usedIds.has(r.id));
    if (!candidate) return;
    setRows([...rows, { roleId: candidate.id, scope: "self", scopeOrgIds: [] }]);
  }

  const save = useMutation({
    mutationFn: () => {
      // 校验 custom 必须至少选一个组织
      for (const r of rows) {
        if (r.scope === "custom" && r.scopeOrgIds.length === 0) {
          throw new Error("自定义范围至少要选 1 个组织");
        }
      }
      const dto: RoleAssignmentInput[] = rows.map((r) => ({
        roleId: r.roleId,
        scope: r.scope,
        scopeOrgIds: r.scope === "custom" ? r.scopeOrgIds : undefined,
      }));
      return usersApi.replaceRoles(user.id, dto);
    },
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
      <div className="flex items-center gap-2">
        <ShieldIcon className="w-4 h-4" style={{ color: PARTY }} />
        <h3 className="text-sm font-semibold text-[#1A1A1A]">角色分配</h3>
        <span className="text-[10px] text-[#9CA3AF]">每个角色独立配置数据范围</span>
        <div className="flex-1" />
        <button
          onClick={addRow}
          disabled={rows.length >= roles.length}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-party-soft disabled:opacity-50"
          style={{ color: PARTY }}
        >
          <PlusIcon className="w-3 h-3" />
          添加角色
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-[#9CA3AF] py-4 text-center border border-dashed border-[#E9E9E9] rounded-md">
          该用户未分配任何角色 (默认无权限)
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const role = roles.find((r) => r.id === row.roleId);
            const usedExceptSelf = new Set(rows.filter((_, i) => i !== idx).map((r) => r.roleId));
            return (
              <div key={idx} className="p-3 border border-[#E9E9E9] rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={row.roleId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, roleId: v } : r)));
                    }}
                    className="text-xs px-2 py-1 border border-[#E9E9E9] rounded flex-1 min-w-0"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} disabled={usedExceptSelf.has(r.id) && r.id !== row.roleId}>
                        {r.name} ({r.code}){r.builtin ? " · 内置" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                    className="p-1 rounded hover:bg-red-50 text-[#9CA3AF] hover:text-red-600"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                {role?.description && (
                  <div className="text-[10px] text-[#9CA3AF] pl-1">{role.description}</div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#6B7280] w-14">数据范围</span>
                  <select
                    value={row.scope}
                    onChange={(e) => {
                      const v = e.target.value as ScopeValue;
                      setRows((rs) =>
                        rs.map((r, i) =>
                          i === idx
                            ? { ...r, scope: v, scopeOrgIds: v === "custom" ? r.scopeOrgIds : [] }
                            : r,
                        ),
                      );
                    }}
                    className="text-xs px-2 py-1 border border-[#E9E9E9] rounded flex-1"
                  >
                    {(["self", "own", "subtree", "all", "custom"] as ScopeValue[]).map((s) => (
                      <option key={s} value={s}>
                        {SCOPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {row.scope === "custom" && (
                  <ScopeOrgSelector
                    allOrgsById={allOrgsById}
                    selectedIds={row.scopeOrgIds}
                    onChange={(ids) =>
                      setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, scopeOrgIds: ids } : r)))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F0F0]">
        <button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="px-4 py-1.5 text-xs font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: PARTY }}
        >
          {save.isPending ? "保存中…" : "保存角色"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Create Dialog
   ═══════════════════════════════════════════════════════════════ */

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (u: UserDetail) => void }) {
  const [form, setForm] = useState<CreateUserInput>({ username: "", name: "", active: true });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      usersApi.create({
        username: form.username.trim(),
        name: form.name.trim(),
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        active: form.active,
      }),
    onSuccess: (u) => {
      onCreated(u);
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "创建失败");
    },
  });

  const canSubmit = form.username.trim().length >= 2 && form.name.trim().length >= 1;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl pointer-events-auto">
          <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
              <UserPlusIcon className="w-4 h-4 text-[var(--party-primary)]" />
              新建用户
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-[#F7F8FA]">
              <XIcon className="w-4 h-4 text-[#9CA3AF]" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <Field label="员工编号 *" hint="2-40 字符,字母数字 _ . -,同时作为登录账号且不可重复">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="如 EMP001 或 zhang_san"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <Field label="姓名 *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 张三"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <Field label="邮箱">
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <Field label="手机号">
              <input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
              />
            </Field>
            <div className="text-[10px] text-[#9CA3AF] bg-[#F7F8FA] border border-[#E9E9E9] rounded-md p-2.5">
              创建后,在用户详情的"组织归属"和"角色权限" tab 里分配岗位与权限。
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

/* ═══════════════════════════════════════════════════════════════
   ExtensionTab — 用户扩展信息 (基于 UserCustomField 定义的动态表单)
   ═══════════════════════════════════════════════════════════════ */

function ExtensionTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const fieldsQuery = useQuery({
    queryKey: ["user-custom-fields-active"],
    queryFn: () => userCustomFieldsApi.list(false),
    staleTime: 60_000,
  });

  const initialValues = useMemo(() => ({ ...user.customFields }), [user.customFields]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(normalize(values)) !== JSON.stringify(normalize(initialValues)),
    [values, initialValues],
  );

  const save = useMutation({
    mutationFn: () => usersApi.replaceCustomFields(user.id, values),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string | string[] } }; message?: string }) => {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join("; ") : msg ?? err.message ?? "保存失败");
    },
  });

  function setField(code: string, v: string) {
    setValues((prev) => ({ ...prev, [code]: v }));
  }

  if (fieldsQuery.isLoading) {
    return <div className="p-8 text-center text-sm text-[#9CA3AF]">加载字段定义…</div>;
  }
  const fields = fieldsQuery.data ?? [];
  if (fields.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-[#9CA3AF]">
        当前未启用任何自定义字段。<br />
        请到 <span className="text-[var(--party-primary)]">系统设置 → 用户自定义字段</span> 添加。
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="text-[10px] text-[#9CA3AF] leading-relaxed bg-[#F7F8FA] border border-[#E9E9E9] rounded-md p-2.5">
        以下字段在 <span className="text-[var(--party-primary)]">系统设置 → 用户自定义字段</span> 定义,
        所有用户共享同一份字段表。修改字段定义即时影响此处展示。
      </div>

      {fields.map((def) => (
        <CustomFieldRow
          key={def.id}
          def={def}
          value={values[def.code] ?? ""}
          onChange={(v) => setField(def.code, v)}
        />
      ))}

      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex gap-1.5">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-[#F0F0F0] sticky bottom-0 bg-white">
        <button
          onClick={() => setValues(initialValues)}
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
          {save.isPending ? "保存中…" : "保存扩展信息"}
        </button>
      </div>
    </div>
  );
}

function normalize(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(values).sort().forEach((k) => {
    const v = (values[k] ?? "").trim();
    if (v) out[k] = v;
  });
  return out;
}

/* ─── 单个字段行 ─── */
function CustomFieldRow({
  def, value, onChange,
}: {
  def: UserCustomField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs font-medium text-[#4B5563]">
          {def.label}
          {def.required && <span className="text-[var(--party-primary)] ml-0.5">*</span>}
        </span>
        <span className="text-[10px] text-[#9CA3AF] font-mono">{def.code}</span>
      </div>
      {def.type === "text" && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder ?? ""}
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      )}
      {def.type === "number" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder ?? ""}
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      )}
      {def.type === "date" && (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]"
        />
      )}
      {def.type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder ?? ""}
          rows={3}
          className="w-full px-2.5 py-1.5 text-sm border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)] resize-y"
        />
      )}
      {def.type === "select" && def.dictCode && (
        <DictCodeField dictCode={def.dictCode} value={value} onChange={onChange} title={`选择${def.label}`} />
      )}
      {def.description && (
        <p className="text-[10px] text-[#9CA3AF] mt-1">{def.description}</p>
      )}
    </div>
  );
}

/* ─── 字典选择字段 (按 code 存值,自动拉取对应字典) ─── */
function DictCodeField({
  dictCode, value, onChange, title,
}: {
  dictCode: string;
  value: string;
  onChange: (v: string) => void;
  title: string;
}) {
  const dictQuery = useQuery({
    queryKey: ["dictionary-detail", dictCode],
    queryFn: () => dictionariesApi.get(dictCode),
    staleTime: 60_000,
  });
  return (
    <DictPositionPicker
      dict={dictQuery.data}
      title={title}
      value={value}
      onChange={onChange}
      valueField="code"
      width="w-full"
      placeholder="(请选择)"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   DictPositionPicker — 字典驱动的职务选择器 (按钮 + 弹窗)
   ═══════════════════════════════════════════════════════════════
   - 按钮上展示当前职务名 (空则显示"选择职务")
   - 点击弹窗:左分类 / 右职务卡片 / 顶部搜索 (支持拼音)
   - 兼容历史数据:value 不在字典内时,按钮显示 "(自定义) xxx" 标记
   - 字典为 1 级扁平 (无分类) 时弹窗只显示右侧 items
*/
function DictPositionPicker({
  dict, title, value, onChange, width = "w-32", valueField = "label", placeholder = "(选择职务)",
}: {
  dict: DictionaryDetail | undefined;
  title: string;
  value: string;
  onChange: (v: string) => void;
  width?: string;
  /** "label" = 存字典项 label (默认,适用于职务字段);"code" = 存 code (适用于扩展字段) */
  valueField?: "label" | "code";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const items = dict?.items ?? [];
  const matched = items.find((it) => it[valueField] === value);
  const inDict = !!matched && matched.active;
  const isLegacy = value && !inDict;
  // 按钮显示文字:始终展示 label 给用户读
  const displayText = matched?.label ?? value;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs px-2 py-1 border border-[#E9E9E9] rounded ${width} bg-white text-left truncate hover:border-[var(--party-primary)] transition-colors`}
        title={isLegacy ? `历史值,不在字典内:${value}` : (displayText || "点击选择")}
      >
        {value ? (
          <span className={isLegacy ? "text-amber-600" : "text-[#1A1A1A]"}>
            {isLegacy && "★"}
            {displayText}
          </span>
        ) : (
          <span className="text-[#9CA3AF]">{placeholder}</span>
        )}
      </button>
      {open && dict && (
        <PositionPickerDialog
          dict={dict}
          title={title}
          currentValue={value}
          valueField={valueField}
          onClose={() => setOpen(false)}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PositionPickerDialog({
  dict, title, currentValue, valueField, onClose, onSelect,
}: {
  dict: DictionaryDetail;
  title: string;
  currentValue: string;
  valueField: "label" | "code";
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const tree = useMemo(() => buildDictTree(dict.items), [dict.items]);
  const hasCategories = tree.hasCategories;

  const activeChildren = useMemo(
    () => tree.categories.flatMap((c) => c.children.filter((i) => i.active)),
    [tree.categories],
  );
  const rootLeaves = useMemo(
    () =>
      tree.categories
        .filter((c) => c.children.length === 0 && c.active)
        .map((c) => c as DictItem),
    [tree.categories],
  );
  // 扁平字典(无 children 的根项)直接展示;分级字典展示 children
  const allSelectable = hasCategories ? activeChildren : rootLeaves;

  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    tree.categories.find((c) => c.children.length > 0)?.id ?? null,
  );
  const [search, setSearch] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  // 搜索状态下:跨分类匹配
  const searchActive = search.trim().length > 0;
  const matched = useMemo(() => {
    if (!searchActive) return [];
    return allSelectable.filter(
      (it) =>
        matchesPinyin(it.label, search) ||
        matchesPinyin(it.code, search) ||
        (it.description && matchesPinyin(it.description, search)),
    );
  }, [allSelectable, search, searchActive]);

  const visibleItems = searchActive
    ? matched
    : hasCategories && selectedCatId
    ? (tree.categories.find((c) => c.id === selectedCatId)?.children.filter((i) => i.active) ?? [])
    : rootLeaves;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl h-[480px] bg-white rounded-xl shadow-2xl pointer-events-auto flex flex-col"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-5 py-3 border-b border-[#E9E9E9] flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">{title}</h2>
            <span className="text-[10px] text-[#9CA3AF]">
              {hasCategories ? `${tree.categories.filter((c) => c.children.length > 0).length} 个分类 · ${allSelectable.length} 个职务` : `${rootLeaves.length} 项`}
            </span>
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
            {/* 分类侧栏(仅分级字典) */}
            {hasCategories && !searchActive && (
              <aside className="w-40 flex-shrink-0 border-r border-[#E9E9E9] overflow-auto py-1.5">
                {tree.categories
                  .filter((c) => c.children.length > 0)
                  .map((c) => {
                    const active = c.id === selectedCatId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCatId(c.id)}
                        className="w-full text-left px-3 py-2 transition-colors flex items-center gap-1.5"
                        style={{
                          backgroundColor: active ? PARTY_BG : undefined,
                          color: active ? PARTY : "#4B5563",
                        }}
                      >
                        <div
                          className="w-0.5 h-5 rounded-full"
                          style={{ backgroundColor: active ? PARTY : "transparent" }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{c.label}</div>
                          {c.description && (
                            <div className="text-[10px] text-[#9CA3AF] truncate">{c.description}</div>
                          )}
                        </div>
                        <span className="text-[10px] text-[#9CA3AF]">{c.children.filter((i) => i.active).length}</span>
                      </button>
                    );
                  })}
              </aside>
            )}

            {/* 职务网格 */}
            <div className="flex-1 min-w-0 overflow-auto p-4">
              {visibleItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[#9CA3AF]">
                  {searchActive ? "无匹配职务" : "此分类下没有可选项"}
                </div>
              ) : (
                <>
                  {searchActive && (
                    <div className="text-[10px] text-[#9CA3AF] mb-2">
                      跨分类搜索 · 命中 {visibleItems.length} 项
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {visibleItems.map((it) => {
                      const selected = it[valueField] === currentValue;
                      return (
                        <button
                          key={it.id}
                          onClick={() => onSelect(it[valueField])}
                          className="text-left px-3 py-2 rounded-md border transition-all hover:shadow-sm"
                          style={{
                            borderColor: selected ? PARTY : "#E9E9E9",
                            backgroundColor: selected ? PARTY_BG : "white",
                          }}
                        >
                          <div
                            className="text-xs font-medium"
                            style={{ color: selected ? PARTY : "#1A1A1A" }}
                          >
                            {it.label}
                          </div>
                          {searchActive && (
                            <div className="text-[10px] text-[#9CA3AF] mt-0.5 font-mono">
                              {it.code}
                            </div>
                          )}
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
            <span className="text-[10px] text-[#9CA3AF] flex-1">
              当前: {currentValue
                ? (dict.items.find((it) => it[valueField] === currentValue)?.label ?? currentValue)
                : <em>(未指定)</em>}
            </span>
            <button
              onClick={() => onSelect("")}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              清除选择
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E9E9E9] hover:bg-[#F7F8FA]"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Field wrapper
   ═══════════════════════════════════════════════════════════════ */

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
