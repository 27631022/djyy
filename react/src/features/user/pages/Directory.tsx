import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, SearchIcon, XIcon, PhoneIcon, MailIcon, BuildingIcon,
  ChevronRightIcon, ChevronDownIcon, UsersIcon, FilterIcon,
} from "lucide-react";
import { usersApi, type ContactItem, type ContactsQuery } from "@/features/user";
import { organizationsApi, type OrgTreeNode } from "@/features/organization";
import { dictionariesApi, DICT_CODES } from "@/features/dictionary";
import { resolveAvatarUrl } from "@/features/avatar";
import { SiteLogo } from "@/features/site-setting";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { matchesPinyin, highlightMatch } from "@/shared/lib/pinyinSearch";

/* 语义色:行政机构蓝 / 党组织红(与 organization ORG_TYPE_COLORS 呼应,不跟主题色) */
const PARTY = "var(--party-primary)";
const ADMIN = "rgb(26, 107, 200)";
const ADMIN_BG = "rgb(238, 244, 255)";
const PARTY_BG = "rgb(255, 240, 242)";
const PAGE_SIZE = 30;

/* ═══════════════════════════════════════════════════════════════
   通讯录(门户页 /directory):所有登录员工可查同事联系方式。
   左=行政机构树(按部门浏览)· 右=联系人卡片 + 搜索 + 筛选 + 分页。
   ═══════════════════════════════════════════════════════════════ */
export default function DirectoryPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  // 默认只看本单位直属成员(按组织/通讯录统一 sortOrder 展示);勾「含下级」再看整棵子树
  const [subtree, setSubtree] = useState(false);
  const [hasParty, setHasParty] = useState(false);
  const [inDept, setInDept] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [skip, setSkip] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** 任何筛选/搜索/部门变化都回第 1 页 */
  const resetPage = () => setSkip(0);

  /* 搜索分流:汉字/工号/电话/邮箱/部门名 → 服务端全库;纯字母视为拼音 → 仅当前页过滤 */
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
  const politicalOptions = useMemo(
    () => (politicalDict.data?.items ?? []).filter((it) => it.active),
    [politicalDict.data],
  );
  const politicalLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of politicalDict.data?.items ?? []) m.set(it.code, it.label);
    return (code: string | null) => (code ? m.get(code) ?? null : null);
  }, [politicalDict.data]);

  const query: ContactsQuery = useMemo(
    () => ({
      search: serverSearch,
      adminOrgId: orgId ?? undefined,
      adminOrgSubtree: orgId ? subtree : undefined,
      hasParty: hasParty || undefined,
      inDept: inDept || undefined,
      politicalStatuses: statuses.length ? statuses : undefined,
      take: PAGE_SIZE,
      skip,
    }),
    [serverSearch, orgId, subtree, hasParty, inDept, statuses, skip],
  );

  const contactsQuery = useQuery({
    queryKey: ["contacts", query],
    queryFn: () => usersApi.contacts(query),
    placeholderData: (prev) => prev, // 翻页/改筛选保留上页,避免闪空
  });

  /* 渲染期对账(免 effect;else-if 一轮只改一处):① 服务端搜索词变化回第 1 页;
     ② skip 越过当前 total → 钳到末页(过滤收窄后不自愈会停空页) */
  const [searchSnap, setSearchSnap] = useState<string | undefined>(undefined);
  const fresh = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data;
  if (searchSnap !== serverSearch) {
    setSearchSnap(serverSearch);
    setSkip(0);
  } else if (fresh && skip > 0 && skip >= fresh.total) {
    setSkip(fresh.total === 0 ? 0 : Math.floor((fresh.total - 1) / PAGE_SIZE) * PAGE_SIZE);
  }

  const items = useMemo(() => contactsQuery.data?.items ?? [], [contactsQuery.data]);
  const total = contactsQuery.data?.total ?? 0;

  /* 拼音模式:仅当前页客户端过滤(服务端 LIKE 搜不到拼音) */
  const shown = useMemo(() => {
    if (!pinyinMode) return items;
    return items.filter(
      (u) =>
        matchesPinyin(u.name, debouncedSearch) ||
        matchesPinyin(u.username, debouncedSearch) ||
        (u.admin ? matchesPinyin(u.admin.orgName, debouncedSearch) : false),
    );
  }, [items, pinyinMode, debouncedSearch]);

  const activeFilterCount =
    (hasParty ? 1 : 0) + (inDept ? 1 : 0) + statuses.length + (orgId ? 1 : 0);

  function toggleStatus(code: string) {
    setStatuses((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    resetPage();
  }

  function selectOrg(id: string | null) {
    setOrgId(id);
    setSubtree(false); // 每次切单位都先看本单位直属花名册(统一排序);需要时再展开含下级
    resetPage();
  }

  function clearAll() {
    setOrgId(null);
    setHasParty(false);
    setInDept(false);
    setStatuses([]);
    setSearchInput("");
    resetPage();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF7F2] via-[#FDFCFA] to-white flex flex-col">
      {/* ════ 顶栏 ════ */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--party-primary)]"
          >
            <ChevronLeft className="h-4 w-4" /> 门户首页
          </Link>
          <span className="text-gray-200">|</span>
          <SiteLogo className="h-6 w-6 flex-shrink-0" />
          <span className="font-bold text-gray-900">通讯录</span>
          <span className="hidden sm:inline text-xs text-gray-400">
            共 {total} 人{pinyinMode && ` · 当前页拼音匹配 ${shown.length}`}
          </span>

          <div className="flex-1" />

          {/* 搜索 */}
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

      {/* ════ 主体 ════ */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-5 px-4 py-5">
        {/* 左:行政机构树 */}
        <aside className="hidden w-64 flex-shrink-0 lg:block">
          <div className="sticky top-[76px] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-gray-800">
              <BuildingIcon className="h-4 w-4" style={{ color: ADMIN }} />
              按部门浏览
            </div>
            <div className="max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
              <button
                onClick={() => selectOrg(null)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                style={{
                  backgroundColor: orgId === null ? "color-mix(in srgb, var(--party-primary) 8%, white)" : "transparent",
                  color: orgId === null ? PARTY : "#374151",
                  fontWeight: orgId === null ? 600 : 400,
                }}
              >
                <UsersIcon className="h-3.5 w-3.5 flex-shrink-0" />
                全部人员
              </button>
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

        {/* 右:筛选 + 联系人 */}
        <main className="min-w-0 flex-1">
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

              <FilterChip label="仅党员" active={hasParty} onClick={() => { setHasParty((v) => !v); resetPage(); }} />
              <FilterChip label="仅部门人员" active={inDept} onClick={() => { setInDept((v) => !v); resetPage(); }} />

              {orgId && (
                <label className="ml-1 inline-flex select-none items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={subtree} onChange={(e) => { setSubtree(e.target.checked); resetPage(); }} />
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

          {/* 联系人网格 */}
          {contactsQuery.isLoading ? (
            <div className="py-20 text-center text-sm text-gray-400">加载中…</div>
          ) : contactsQuery.isError ? (
            <div className="py-20 text-center text-sm text-red-500">
              {(contactsQuery.error as Error).message}
            </div>
          ) : shown.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">
              {pinyinMode
                ? "当前页无拼音匹配 · 输入汉字/工号/电话可全库搜索"
                : orgId && !subtree && !serverSearch
                ? "该单位暂无直属成员 · 勾选「含下级机构」查看下级单位人员"
                : "没有符合条件的人员"}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3"
              style={{ opacity: contactsQuery.isFetching && !contactsQuery.isLoading ? 0.6 : 1 }}
            >
              {shown.map((c) => (
                <ContactCard key={c.id} c={c} query={debouncedSearch} politicalLabel={politicalLabel} />
              ))}
            </div>
          )}

          {/* 分页(拼音模式仅当前页,不显示分页) */}
          {!pinyinMode && total > PAGE_SIZE && (
            <Pagination total={total} skip={skip} onChange={setSkip} />
          )}
        </main>
      </div>
    </div>
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
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const selected = node.id === selectedId;
  return (
    <div>
      <div
        className="flex items-center rounded-lg transition-colors hover:bg-gray-50"
        style={{
          backgroundColor: selected ? "color-mix(in srgb, var(--party-primary) 8%, white)" : undefined,
        }}
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

/* ─── 联系人卡片 ─── */
function ContactCard({
  c, query, politicalLabel,
}: {
  c: ContactItem;
  query: string;
  politicalLabel: (code: string | null) => string | null;
}) {
  const avatar = resolveAvatarUrl(c.avatarUrl);
  const political = politicalLabel(c.politicalStatus);
  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        {avatar ? (
          <img src={avatar} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover ring-1 ring-gray-100" />
        ) : (
          <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[var(--party-primary)] text-lg font-bold text-white">
            {c.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-gray-900">
              <Highlight text={c.name} query={query} />
            </span>
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

      {/* 归属 */}
      <div className="mt-3 space-y-1.5">
        {c.admin ? (
          <div className="flex items-start gap-1.5 text-xs">
            <BuildingIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: ADMIN }} />
            <span className="min-w-0 text-gray-600">
              <span className="text-gray-800">{c.admin.orgName}</span>
              {c.admin.position && (
                <span className="ml-1 rounded px-1 py-px text-[10px]" style={{ backgroundColor: ADMIN_BG, color: ADMIN }}>
                  {c.admin.position}
                </span>
              )}
            </span>
          </div>
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

      {/* 联系方式 */}
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

/* ─── 分页 ─── */
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

function Pagination({ total, skip, onChange }: { total: number; skip: number; onChange: (skip: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(pages, Math.floor(skip / PAGE_SIZE) + 1);
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-xs">
      <button
        disabled={current <= 1}
        onClick={() => onChange((current - 2) * PAGE_SIZE)}
        className="rounded border border-gray-200 bg-white px-2.5 py-1.5 disabled:opacity-40 hover:bg-gray-50"
      >
        上一页
      </button>
      {pageWindow(current, pages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-gray-300">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange((p - 1) * PAGE_SIZE)}
            className="min-w-[30px] rounded border px-1.5 py-1.5 text-center"
            style={
              p === current
                ? { backgroundColor: PARTY, borderColor: PARTY, color: "white", fontWeight: 600 }
                : { borderColor: "#E5E7EB", backgroundColor: "white" }
            }
          >
            {p}
          </button>
        ),
      )}
      <button
        disabled={current >= pages}
        onClick={() => onChange(current * PAGE_SIZE)}
        className="rounded border border-gray-200 bg-white px-2.5 py-1.5 disabled:opacity-40 hover:bg-gray-50"
      >
        下一页
      </button>
    </div>
  );
}
