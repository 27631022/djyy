import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, SearchIcon, XIcon, PhoneIcon, MailIcon, BuildingIcon,
  ChevronRightIcon, ChevronDownIcon, UsersIcon, FilterIcon,
  StarIcon, Link2Icon, ArrowUpRightIcon, ArrowDownRightIcon,
} from "lucide-react";
import { usersApi, directoryMeApi, type ContactItem, type ContactsQuery, type CounterpartOrg } from "@/features/user";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import { resolveAvatarUrl } from "@/features/avatar";
import { SiteLogo } from "@/features/site-setting";
import { useAuth } from "@/stores/auth";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { matchesPinyin, highlightMatch } from "@/shared/lib/pinyinSearch";

/* 语义色:行政机构蓝 / 党组织红(与 organization ORG_TYPE_COLORS 呼应,不跟主题色)· 负责人金 */
const PARTY = "var(--party-primary)";
const ADMIN = "rgb(26, 107, 200)";
const ADMIN_BG = "rgb(238, 244, 255)";
const PARTY_BG = "rgb(255, 240, 242)";
const LEADER = "rgb(180, 120, 8)";
const LEADER_BG = "rgb(254, 249, 231)";
const PAGE_SIZE = 30;

/* ═══════════════════════════════════════════════════════════════
   通讯录(门户页 /directory):所有登录员工可查同事联系方式。
   左=部门树 + 视图切换 · 中=联系人瀑布流(负责人标识 + 收藏)· 右=我的收藏。
   默认视图:本人部门的「对口上级机构 + 下级承接部门」(无对口配置回退全部人员)。
   ═══════════════════════════════════════════════════════════════ */
export default function DirectoryPage() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const uid = me?.id ?? "anon"; // 每人独立缓存:切换账户 → queryKey 变 → 收藏/对口自动重拉,不必手动刷新
  const [orgId, setOrgId] = useState<string | null>(null);
  const [view, setView] = useState<"counterpart" | "all">("all");
  const [subtree, setSubtree] = useState(false);
  const [cpSuperior, setCpSuperior] = useState(true);
  const [cpSubordinate, setCpSubordinate] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [hasParty, setHasParty] = useState(false);
  const [inDept, setInDept] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* 搜索分流:汉字/工号/电话/邮箱/部门名 → 服务端全库;纯字母视为拼音 → 仅已加载卡片过滤 */
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const pinyinMode = debouncedSearch.length > 0 && /^[a-zA-Z]+$/.test(debouncedSearch);
  const serverSearch = !debouncedSearch || pinyinMode ? undefined : debouncedSearch;

  const treeQuery = useQuery({
    queryKey: ["orgs", "tree", "admin"],
    queryFn: () => organizationsApi.tree("admin"),
    staleTime: 60_000,
  });
  const politicalDict = useQuery({
    queryKey: ["dictionary-detail", DICT_CODES.USER_POLITICAL],
    queryFn: () => dictionariesApi.get(DICT_CODES.USER_POLITICAL),
    staleTime: 60_000,
  });
  const counterpartQuery = useQuery({
    queryKey: ["directory", "counterpart", uid],
    queryFn: directoryMeApi.counterpartScope,
    staleTime: 5 * 60_000,
  });
  const favoritesQuery = useQuery({
    queryKey: ["directory", "favorites", uid],
    queryFn: directoryMeApi.favorites,
    staleTime: 30_000,
  });

  const politicalOptions = useMemo(
    () => (politicalDict.data?.items ?? []).filter((it) => it.active),
    [politicalDict.data],
  );
  const politicalLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of politicalDict.data?.items ?? []) m.set(it.code, it.label);
    return (code: string | null) => (code ? m.get(code) ?? null : null);
  }, [politicalDict.data]);

  const superiorOrgs = useMemo(() => counterpartQuery.data?.superiorOrgs ?? [], [counterpartQuery.data]);
  const subordinateOrgs = useMemo(() => counterpartQuery.data?.subordinateOrgs ?? [], [counterpartQuery.data]);
  const hasCounterpart = superiorOrgs.length + subordinateOrgs.length > 0;

  /* 首次拿到对口关系:有配置则默认「对口」视图(render 期一次性收敛,免 effect) */
  const [cpInit, setCpInit] = useState(false);
  if (!cpInit && counterpartQuery.data) {
    setCpInit(true);
    setCpSuperior(superiorOrgs.length > 0);
    setCpSubordinate(subordinateOrgs.length > 0);
    if (superiorOrgs.length + subordinateOrgs.length > 0) setView("counterpart");
  }

  const favSet = useMemo(
    () => new Set((favoritesQuery.data?.items ?? []).map((f) => f.id)),
    [favoritesQuery.data],
  );

  /* 对口视图生效条件 + 目标机构集(选中单位/搜索时不生效),按二级单位再筛 */
  const cpOrgs = useMemo(() => {
    const list: CounterpartOrg[] = [];
    if (cpSuperior) list.push(...superiorOrgs);
    if (cpSubordinate) list.push(...subordinateOrgs);
    return list;
  }, [cpSuperior, cpSubordinate, superiorOrgs, subordinateOrgs]);
  const cpUnitOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of cpOrgs) if (o.unitId) m.set(o.unitId, o.unitName ?? o.unitId);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [cpOrgs]);
  // 选中的二级单位若已不在可选集(切了上级/下级钮)→ 自动回退「全部」
  const effectiveUnit = selectedUnit && cpUnitOptions.some((u) => u.id === selectedUnit) ? selectedUnit : null;
  const cpUnion = useMemo(() => {
    if (orgId || view !== "counterpart") return [];
    const list = effectiveUnit ? cpOrgs.filter((o) => o.unitId === effectiveUnit) : cpOrgs;
    return [...new Set(list.map((o) => o.id))];
  }, [orgId, view, cpOrgs, effectiveUnit]);
  const cpActive = !orgId && !serverSearch && view === "counterpart" && cpUnion.length > 0;
  // 对口视图但两个钮都关(cpUnion 空):给提示,不退回全库(否则「对口通讯录」标题下却翻整个公司)
  const cpEmptySelection =
    !orgId && !serverSearch && view === "counterpart" && hasCounterpart && cpUnion.length === 0;
  // 对口关系拉到(成功/失败)才发主查询 —— 免首屏先以默认 view=all 拉一次重的组织顺序全量再丢弃
  const cpReady = !counterpartQuery.isLoading;

  const baseParams: ContactsQuery = useMemo(
    () => ({
      search: serverSearch,
      adminOrgId: orgId ?? undefined,
      adminOrgSubtree: orgId ? subtree : undefined,
      adminOrgIds: cpActive ? cpUnion : undefined,
      hasParty: hasParty || undefined,
      inDept: inDept || undefined,
      politicalStatuses: statuses.length ? statuses : undefined,
    }),
    [serverSearch, orgId, subtree, cpActive, cpUnion, hasParty, inDept, statuses],
  );

  const contactsQuery = useInfiniteQuery({
    queryKey: ["contacts", baseParams],
    queryFn: ({ pageParam }) => usersApi.contacts({ ...baseParams, take: PAGE_SIZE, skip: pageParam }),
    initialPageParam: 0,
    enabled: cpReady && !cpEmptySelection,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  const items = useMemo(
    () => (contactsQuery.data?.pages ?? []).flatMap((p) => p.items),
    [contactsQuery.data],
  );
  const total = contactsQuery.data?.pages[0]?.total ?? 0;

  const shown = useMemo(() => {
    if (!pinyinMode) return items;
    return items.filter(
      (u) =>
        matchesPinyin(u.name, debouncedSearch) ||
        matchesPinyin(u.username, debouncedSearch) ||
        (u.admin ? matchesPinyin(u.admin.orgName, debouncedSearch) : false),
    );
  }, [items, pinyinMode, debouncedSearch]);

  const activeFilterCount = (hasParty ? 1 : 0) + (inDept ? 1 : 0) + statuses.length + (orgId ? 1 : 0);

  /* ─── 收藏 toggle(乐观:改动后重拉收藏 + 影响的卡片) ─── */
  const favMut = useMutation({
    mutationFn: ({ userId, on }: { userId: string; on: boolean }) =>
      on ? directoryMeApi.addFavorite(userId) : directoryMeApi.removeFavorite(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["directory", "favorites"] }),
  });
  const toggleFav = (userId: string) => favMut.mutate({ userId, on: !favSet.has(userId) });

  /* ─── 视图/筛选切换 ─── */
  function selectOrg(id: string) {
    setOrgId(id);
    setSubtree(false);
  }
  function showCounterpart() {
    setOrgId(null);
    setView("counterpart");
    if (!cpSuperior && !cpSubordinate) {
      setCpSuperior(superiorOrgs.length > 0);
      setCpSubordinate(subordinateOrgs.length > 0);
    }
  }
  function showAll() {
    setOrgId(null);
    setView("all");
  }
  function clearAll() {
    setHasParty(false);
    setInDept(false);
    setStatuses([]);
    setSearchInput("");
    // 「清空」也回到默认视图(否则选了部门时 orgId 计入角标却清不掉,按钮点了没反应)
    setOrgId(null);
    setSubtree(false);
    setView(hasCounterpart ? "counterpart" : "all");
  }
  function toggleStatus(code: string) {
    setStatuses((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  /* 瀑布流自动加载:底部哨兵进入视口 → 拉下一页 */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = contactsQuery;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || pinyinMode) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, pinyinMode]);

  const inCounterpartView = !orgId && view === "counterpart" && hasCounterpart;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white flex flex-col">
      {/* ════ 顶栏 ════ */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]">
            <ChevronLeft className="h-4 w-4" /> 门户首页
          </Link>
          <span className="text-gray-200">|</span>
          <SiteLogo className="h-6 w-6 flex-shrink-0" />
          <span className="font-bold text-gray-900">通讯录</span>
          <span className="hidden sm:inline text-xs text-gray-400">
            共 {total} 人{pinyinMode && ` · 当前页拼音匹配 ${shown.length}`}
          </span>
          <div className="flex-1" />
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索姓名 / 工号 / 电话 / 部门"
              title="汉字、工号、电话、部门名走全库搜索;纯字母按拼音在当前页匹配"
              className="w-52 sm:w-72 rounded-full border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm focus:border-[var(--party-primary)] focus:outline-none"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-gray-100"
              >
                <XIcon className="h-3.5 w-3.5 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ════ 主体:左中右 ════ */}
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 gap-5 px-4 py-5">
        {/* 左:视图切换 + 部门树 */}
        <aside className="hidden w-60 flex-shrink-0 lg:block">
          <div className="sticky top-[76px] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="space-y-0.5">
              {hasCounterpart && (
                <SideItem
                  label="对口通讯录"
                  icon={Link2Icon}
                  active={!orgId && view === "counterpart"}
                  onClick={showCounterpart}
                />
              )}
              <SideItem label="全部人员" icon={UsersIcon} active={!orgId && view === "all"} onClick={showAll} />
            </div>
            <div className="mb-1 mt-3 flex items-center gap-1.5 px-1 text-xs font-semibold text-gray-500">
              <BuildingIcon className="h-3.5 w-3.5" style={{ color: ADMIN }} />
              按部门浏览
            </div>
            <div className="max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
              {treeQuery.isLoading ? (
                <div className="px-2 py-4 text-xs text-gray-400">加载中…</div>
              ) : (
                (treeQuery.data ?? []).map((node) => (
                  <DeptNode key={node.id} node={node} depth={0} selectedId={orgId} onSelect={selectOrg} />
                ))
              )}
            </div>
          </div>
        </aside>

        {/* 中:筛选 + 联系人瀑布流 */}
        <main className="min-w-0 flex-1">
          {/* 对口视图筛选钮 */}
          {inCounterpartView && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                <Link2Icon className="h-3.5 w-3.5" style={{ color: ADMIN }} /> 对口通讯录
              </span>
              {superiorOrgs.length > 0 && (
                <CpChip
                  label="对口上级机构"
                  count={superiorOrgs.length}
                  icon={ArrowUpRightIcon}
                  active={cpSuperior}
                  onClick={() => setCpSuperior((v) => !v)}
                />
              )}
              {subordinateOrgs.length > 0 && (
                <CpChip
                  label="下级承接部门"
                  count={subordinateOrgs.length}
                  icon={ArrowDownRightIcon}
                  active={cpSubordinate}
                  onClick={() => setCpSubordinate((v) => !v)}
                />
              )}
              {cpUnitOptions.length > 1 && (
                <label className="ml-1 inline-flex items-center gap-1 text-xs text-gray-500">
                  <BuildingIcon className="h-3.5 w-3.5" style={{ color: ADMIN }} /> 所在二级单位
                  <select
                    value={effectiveUnit ?? ""}
                    onChange={(e) => setSelectedUnit(e.target.value || null)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[var(--party-primary)] focus:outline-none"
                  >
                    <option value="">全部({cpUnitOptions.length})</option>
                    {cpUnitOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <span className="text-[10px] text-gray-400">按本部门对口关系显示</span>
            </div>
          )}

          {/* 筛选条 */}
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                style={{
                  backgroundColor: activeFilterCount > 0 || filtersOpen ? PARTY_BG : "white",
                  borderColor: activeFilterCount > 0 || filtersOpen ? PARTY : "#E5E7EB",
                  color: activeFilterCount > 0 || filtersOpen ? PARTY : "#4B5563",
                }}
              >
                <FilterIcon className="h-3.5 w-3.5" />
                筛选
                {activeFilterCount > 0 && (
                  <span
                    className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: PARTY }}
                  >
                    {activeFilterCount}
                  </span>
                )}
                {filtersOpen ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
              </button>
              <FilterChip label="仅党员" active={hasParty} onClick={() => setHasParty((v) => !v)} />
              <FilterChip label="仅部门人员" active={inDept} onClick={() => setInDept((v) => !v)} />
              {orgId && (
                <label className="ml-1 inline-flex select-none items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={subtree} onChange={(e) => setSubtree(e.target.checked)} />
                  含下级机构
                </label>
              )}
              <span className="flex-1" />
              {activeFilterCount > 0 || searchInput ? (
                <button onClick={clearAll} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">
                  清空
                </button>
              ) : null}
            </div>
            {filtersOpen && politicalOptions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
                <span className="text-xs font-medium text-gray-500">政治面貌</span>
                {politicalOptions.map((it) => (
                  <FilterChip key={it.code} label={it.label} active={statuses.includes(it.code)} onClick={() => toggleStatus(it.code)} />
                ))}
              </div>
            )}
          </div>

          {/* 联系人瀑布流 */}
          {cpEmptySelection ? (
            <div className="py-20 text-center text-sm text-gray-400">
              请选择上方的「对口上级机构 / 下级承接部门」查看联系人
            </div>
          ) : !cpReady || contactsQuery.isLoading ? (
            <div className="py-20 text-center text-sm text-gray-400">加载中…</div>
          ) : contactsQuery.isError ? (
            <div className="py-20 text-center text-sm text-red-500">{(contactsQuery.error as Error).message}</div>
          ) : shown.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">
              {pinyinMode
                ? "已加载卡片中无拼音匹配 · 输入汉字/工号/电话可全库搜索"
                : orgId && !subtree && !serverSearch
                ? "该单位暂无直属成员 · 勾选「含下级机构」查看下级单位人员"
                : "没有符合条件的人员"}
            </div>
          ) : (
            <>
              <div className="columns-1 gap-3 sm:columns-2 xl:columns-2 [column-fill:_balance]">
                {shown.map((c) => (
                  <div key={c.id} className="mb-3 break-inside-avoid">
                    <ContactCard
                      c={c}
                      query={debouncedSearch}
                      politicalLabel={politicalLabel}
                      isFav={favSet.has(c.id)}
                      onToggleFav={() => toggleFav(c.id)}
                    />
                  </div>
                ))}
              </div>
              {!pinyinMode && (
                <div ref={sentinelRef} className="py-6 text-center">
                  {hasNextPage ? (
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="text-xs text-[var(--party-primary)] hover:underline disabled:opacity-50"
                    >
                      {isFetchingNextPage ? "加载中…" : "下滑或点击加载更多"}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">已全部加载 · 共 {total} 人</span>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* 右:我的收藏 */}
        <aside className="hidden w-72 flex-shrink-0 xl:block">
          <div className="sticky top-[76px] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-gray-800">
              <StarIcon className="h-4 w-4" style={{ color: LEADER, fill: LEADER }} />
              我的收藏
              <span className="text-xs font-normal text-gray-400">{favoritesQuery.data?.items.length ?? 0}</span>
            </div>
            <div className="max-h-[calc(100vh-160px)] space-y-1.5 overflow-y-auto pr-1">
              {(favoritesQuery.data?.items ?? []).length === 0 ? (
                <div className="px-1 py-6 text-center text-xs text-gray-400">
                  点联系人卡片上的 <StarIcon className="inline h-3 w-3" /> 收藏常用同事,这里随时查
                </div>
              ) : (
                (favoritesQuery.data?.items ?? []).map((f) => (
                  <FavRow key={f.id} c={f} onRemove={() => toggleFav(f.id)} />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── 左栏视图项 ─── */
function SideItem({
  label, icon: Icon, active, onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50"
      style={{
        backgroundColor: active ? "color-mix(in srgb, var(--party-primary) 8%, white)" : "transparent",
        color: active ? PARTY : "#374151",
        fontWeight: active ? 600 : 400,
      }}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

/* ─── 对口筛选 chip ─── */
function CpChip({
  label, count, icon: Icon, active, onClick,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
      style={{
        backgroundColor: active ? ADMIN_BG : "white",
        borderColor: active ? ADMIN : "#E5E7EB",
        color: active ? ADMIN : "#4B5563",
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="rounded-full bg-white/70 px-1 text-[10px]">{count}</span>
    </button>
  );
}

/* ─── 部门树节点(递归 · 折叠 · 选中) ─── */
function DeptNode({
  node, depth, selectedId, onSelect,
}: {
  node: OrgTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // 默认展开前两层(昆仑物流 → 公司机关/基层单位 → 机关部门/分公司可见)
  const [open, setOpen] = useState(depth <= 1);
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
          {node.transitiveMembers > 0 && (
            <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">{node.transitiveMembers}</span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <DeptNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 负责人徽标 ─── */
function LeaderBadge() {
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-bold"
      style={{ backgroundColor: LEADER_BG, color: LEADER, border: `1px solid ${LEADER}` }}
    >
      负责人
    </span>
  );
}

/* ─── 行政归属路径(二级单位 → … → 本部门,末级加重)+ 职务 ─── */
function OrgPath({ path, position }: { path: string[]; position: string | null }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      <BuildingIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: ADMIN }} />
      <span className="min-w-0 text-gray-600">
        {path.map((seg, i) => (
          <span key={i}>
            {i > 0 && <span className="text-gray-300"> / </span>}
            <span className={i === path.length - 1 ? "font-medium text-gray-800" : "text-gray-500"}>{seg}</span>
          </span>
        ))}
        {position && (
          <span className="ml-1 rounded px-1 py-px text-[10px]" style={{ backgroundColor: ADMIN_BG, color: ADMIN }}>
            {position}
          </span>
        )}
      </span>
    </div>
  );
}

/* ─── 联系人卡片 ─── */
function ContactCard({
  c, query, politicalLabel, isFav, onToggleFav,
}: {
  c: ContactItem;
  query: string;
  politicalLabel: (code: string | null) => string | null;
  isFav: boolean;
  onToggleFav: () => void;
}) {
  const avatar = resolveAvatarUrl(c.avatarUrl);
  const political = politicalLabel(c.politicalStatus);
  return (
    <div
      className="relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: c.isLeader ? LEADER : "rgb(243,244,246)" }}
    >
      {/* 收藏星 */}
      <button
        onClick={onToggleFav}
        title={isFav ? "取消收藏" : "收藏"}
        className="absolute right-3 top-3 rounded p-0.5 hover:bg-gray-50"
        style={{ color: isFav ? LEADER : "#D1D5DB" }}
      >
        <StarIcon className="h-4 w-4" style={{ fill: isFav ? LEADER : "none" }} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        {avatar ? (
          <img src={avatar} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover ring-1 ring-gray-100" />
        ) : (
          <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[var(--party-primary)] text-lg font-bold text-white">
            {c.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-gray-900">
              <Highlight text={c.name} query={query} />
            </span>
            {c.isLeader && <LeaderBadge />}
            {c.party && (
              <span className="flex-shrink-0 rounded px-1.5 py-px text-[10px] font-medium" style={{ backgroundColor: PARTY_BG, color: PARTY }}>
                党员
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-400">
            工号 {c.username}
            {political && ` · ${political}`}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {c.admin ? (
          <OrgPath
            path={c.admin.path.length ? c.admin.path : [c.admin.orgName]}
            position={c.admin.position}
          />
        ) : (
          <div className="text-xs text-gray-300">未分配行政机构</div>
        )}
        {c.party && (
          <div className="flex items-start gap-1.5 text-xs">
            <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: PARTY }} />
            <span className="min-w-0 text-gray-600">
              {c.party.orgName}
              {c.party.position && <span className="ml-1 text-gray-400">· {c.party.position}</span>}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-50 pt-3 text-xs">
        {c.phone ? (
          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-gray-600 hover:text-[var(--party-primary)]">
            <PhoneIcon className="h-3.5 w-3.5" /> {c.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-gray-300"><PhoneIcon className="h-3.5 w-3.5" /> 未留电话</span>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 text-gray-600 hover:text-[var(--party-primary)]">
            <MailIcon className="h-3.5 w-3.5 flex-shrink-0" /> <span className="truncate">{c.email}</span>
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── 收藏栏单行(紧凑) ─── */
function FavRow({ c, onRemove }: { c: ContactItem; onRemove: () => void }) {
  const avatar = resolveAvatarUrl(c.avatarUrl);
  return (
    <div className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-gray-50">
      {avatar ? (
        <img src={avatar} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-gray-100" />
      ) : (
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--party-primary)] text-xs font-bold text-white">
          {c.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[13px] font-medium text-gray-800">{c.name}</span>
          {c.isLeader && <span className="flex-shrink-0 text-[9px]" style={{ color: LEADER }}>负责人</span>}
        </div>
        <div className="truncate text-[11px] text-gray-400">
          {(c.admin?.path.length ? c.admin.path.join(" / ") : c.admin?.orgName) ?? "—"}
          {c.phone ? ` · ${c.phone}` : ""}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-0.5">
        {c.phone && (
          <a href={`tel:${c.phone}`} title="拨打" className="rounded p-1 text-gray-400 hover:bg-white hover:text-[var(--party-primary)]">
            <PhoneIcon className="h-3.5 w-3.5" />
          </a>
        )}
        <button onClick={onRemove} title="取消收藏" className="rounded p-1 hover:bg-white" style={{ color: LEADER }}>
          <StarIcon className="h-3.5 w-3.5" style={{ fill: LEADER }} />
        </button>
      </div>
    </div>
  );
}

/* ─── 筛选 chip ─── */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2.5 py-1 text-xs transition-colors"
      style={{
        backgroundColor: active ? PARTY_BG : "white",
        borderColor: active ? PARTY : "#E5E7EB",
        color: active ? PARTY : "#4B5563",
      }}
    >
      {label}
    </button>
  );
}

/* ─── 高亮命中 ─── */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {highlightMatch(text, query).map((s, i) =>
        s.highlight ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-gray-900">{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
