import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useRoutes, type RouteObject } from "react-router-dom";
import {
  HomeIcon, ChevronLeftIcon, XIcon,
  NetworkIcon, BarChart2Icon, SettingsIcon, LayoutDashboardIcon,
  BuildingIcon, ShieldIcon, UserIcon, BookTextIcon,
  EyeIcon, ThumbsUpIcon, MessageSquareIcon,
  LogOutIcon, KeyIcon, SlidersHorizontalIcon, PaletteIcon, LayoutGridIcon,
  AwardIcon, BriefcaseIcon, SendIcon, ListChecksIcon, UploadIcon, InboxIcon, ClipboardCheckIcon, ClipboardListIcon, BadgeCheckIcon,
  PanelLeftCloseIcon, PanelLeftOpenIcon,
  ChevronDownIcon, ChevronRightIcon, SparklesIcon, ImageIcon, BoxIcon, MessageSquareTextIcon, MoreHorizontalIcon,
  ArmchairIcon, PlusIcon, LandmarkIcon, PackageIcon, LibraryIcon,
} from "lucide-react";
import { useAuth } from "../stores/auth";
import type { AuthMe } from "@/features/auth";
import { useDesktopInboxAlerts } from "@/features/task";
import { useMyAssessmentBadge } from "@/features/assessment";
import { SiteLogo } from "@/features/site-setting";
import { resolveAvatarUrl } from "@/features/avatar";

/* ─── 顶部一级分类 → 联动左侧二级菜单 ─── */
/** group:可选的二级菜单分组标题(同 group 的项聚在一个小标题下) */
/** perm:需要的权限点(无则人人可见;platform_admin 直通看全部) */
interface MenuItem { path: string; label: string; icon: React.ElementType; disabled?: boolean; group?: string; perm?: string; badgeKey?: string; }
interface Category { id: string; label: string; icon: React.ElementType; items: MenuItem[]; }

const CATEGORIES: Category[] = [
  {
    id: "home",
    label: "工作台",
    icon: LayoutDashboardIcon,
    items: [
      // 无 perm = 人人可见;/admin 默认落到这里
      { path: "/admin/home", label: "我的工作台", icon: LayoutDashboardIcon },
    ],
  },
  {
    id: "biz",
    label: "业务功能",
    icon: BriefcaseIcon,
    items: [
      { path: "/admin/certificate-templates", label: "证书模板",   icon: AwardIcon,      group: "证书管理", perm: "certificate:issue" },
      { path: "/admin/certificates/issue",    label: "颁发证书",   icon: SendIcon,       group: "证书管理", perm: "certificate:issue" },
      { path: "/admin/certificates/external", label: "外部证书录入", icon: UploadIcon,    group: "证书管理", perm: "certificate:issue" },
      { path: "/admin/certificates",          label: "已发证书",   icon: ListChecksIcon, group: "证书管理", perm: "certificate:issue" },
      // 报送统一入口:发布报送(单次/多次 二选一)/ 单次=task / 多次=report;我的待办人人可见(单次+多次待办并列)
      { path: "/admin/reports/publish",       label: "发布报送",     icon: SendIcon,          group: "报送管理", perm: "task:manage" },
      { path: "/admin/tasks",                 label: "单次报送",     icon: ClipboardListIcon, group: "报送管理", perm: "task:manage" },
      { path: "/admin/tasks/inbox",           label: "我的待办",     icon: InboxIcon,         group: "报送管理" },
      { path: "/admin/halls",                 label: "展厅管理",     icon: LandmarkIcon,      group: "3D 展厅", perm: "exhibition:manage" },
      { path: "/admin/model-library",         label: "模型库",       icon: PackageIcon,       group: "3D 展厅", perm: "exhibition:manage" },
      { path: "/admin/exhibition-assets",     label: "素材中心",     icon: LibraryIcon,       group: "3D 展厅", perm: "exhibition:manage" },
      { path: "/admin/model3d",               label: "3D 生成",      icon: BoxIcon,           group: "3D 展厅", perm: "admin:menu" },
      { path: "/admin/venue/rooms",              label: "会议室 / 会场图", icon: LayoutGridIcon, group: "会场管理", perm: "venue:manage" },
      { path: "/admin/venue/seating",            label: "会议管理",        icon: ArmchairIcon,   group: "会场管理", perm: "venue:manage" },
      { path: "/admin/venue/seating/new/wizard", label: "新建会议",        icon: PlusIcon,       group: "会场管理", perm: "venue:manage" },
      { path: "/admin/assessment/schemes",       label: "考核表",          icon: ClipboardCheckIcon, group: "考核管理", perm: "assessment:manage" },
      { path: "/admin/assessment/rounds",        label: "考核打分",        icon: ClipboardListIcon,  group: "考核管理", perm: "assessment:manage" },
      { path: "/admin/assessment/mine",          label: "我的考核",        icon: BadgeCheckIcon,     group: "考核管理", badgeKey: "myAssessment" }, // 无 perm = 人人可见(打分人入口 + 实时角标)
      { path: "/admin/assessment/managed",       label: "我维护的考核",    icon: SlidersHorizontalIcon, group: "考核管理" }, // 无 perm = 人人可见(节点管理员入口;非节点管理员看到空页)
      { path: "/admin/reports",                  label: "多次报送",        icon: ClipboardCheckIcon, group: "报送管理", perm: "report:manage" },
      { path: "/admin/reports/catalog",          label: "报送清单",        icon: PackageIcon,        group: "报送管理", perm: "report:manage" },
    ],
  },
  {
    id: "stats",
    label: "数据统计",
    icon: BarChart2Icon,
    items: [
      { path: "/admin/stats/views", label: "浏览统计", icon: EyeIcon,         disabled: true, perm: "admin:menu" },
      { path: "/admin/stats/likes", label: "点赞统计", icon: ThumbsUpIcon,    disabled: true, perm: "admin:menu" },
      { path: "/admin/feedback",    label: "用户反馈", icon: MessageSquareIcon, disabled: true, perm: "admin:menu" },
    ],
  },
  {
    id: "org",
    label: "组织与权限",
    icon: NetworkIcon,
    items: [
      { path: "/admin/organizations", label: "党组织 / 行政机构", icon: BuildingIcon, perm: "admin:org:read" },
      { path: "/admin/users",         label: "用户管理",           icon: UserIcon,    perm: "admin:user:read" },
      { path: "/admin/roles",         label: "角色与权限",         icon: ShieldIcon,  perm: "admin:role:read" },
    ],
  },
  {
    id: "sys",
    label: "系统设置",
    icon: SlidersHorizontalIcon,
    items: [
      { path: "/admin/dictionaries",   label: "数据字典",         icon: BookTextIcon, perm: "admin:menu" },
      { path: "/admin/custom-fields",  label: "用户自定义字段",   icon: SlidersHorizontalIcon, perm: "admin:menu" },
      { path: "/admin/site-settings",  label: "站点设置",         icon: PaletteIcon,  perm: "admin:menu" },
      { path: "/admin/navigation",     label: "首页导航",         icon: LayoutGridIcon, perm: "admin:menu" },
      { path: "/admin/external-apis",  label: "AI 接入管理",      icon: SparklesIcon, perm: "admin:menu" },
      { path: "/admin/prompts",        label: "AI 提示词",        icon: MessageSquareTextIcon, perm: "admin:menu" },
      { path: "/admin/icon-library",   label: "图标库",           icon: ImageIcon, perm: "admin:menu" },
    ],
  },
];

/* 通过路径反查所属 category 和 item */
function findMenuItem(path: string): { category: Category; item: MenuItem } | null {
  for (const c of CATEGORIES) {
    const it = c.items.find((i) => i.path === path);
    if (it) return { category: c, item: it };
  }
  return null;
}

/* ─── 二级菜单单项(收缩态=图标轨 + tooltip;展开态=图标 + 文字) ─── */
function SidebarMenuItem({
  item,
  active,
  collapsed,
  onNavigate,
  badge = 0,
}: {
  item: MenuItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: (path: string) => void;
  badge?: number;
}) {
  const Icon = item.icon;
  const base = `relative flex items-center gap-2 rounded-lg text-sm transition-all ${
    collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
  }`;
  if (item.disabled) {
    return (
      <div
        title={collapsed ? `${item.label}(待实现)` : "后续切片实现"}
        className={`${base} text-[#C0C6D0] cursor-not-allowed`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <span className="text-[9px] text-[#D1D5DB]">待实现</span>
          </>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={() => onNavigate(item.path)}
      title={collapsed ? item.label : undefined}
      className={`${base} ${
        active
          ? "bg-party-soft text-[var(--party-primary)] font-semibold"
          : "text-[#4B5563] hover:bg-[#F7F8FA]"
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span className="ml-auto px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white bg-red-500 flex-shrink-0">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {collapsed && badge > 0 && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
    </button>
  );
}

interface Tab { path: string; label: string; icon: React.ElementType; }

/** 标签存储:按用户 id 分桶,杜绝换账号串号 */
const TABS_STORAGE_PREFIX = "djyy_admin_tabs_v1";
const LEGACY_TABS_KEY = "djyy_admin_tabs_v1"; // 旧的全局键(不分用户),首次挂载清理
const tabsKeyFor = (uid: string) => `${TABS_STORAGE_PREFIX}::${uid}`;
const CAT_STORAGE_KEY  = "djyy_admin_active_cat_v1";
const SIDEBAR_COLLAPSED_KEY = "djyy_admin_sidebar_collapsed_v1";
const GROUP_COLLAPSED_KEY = "djyy_admin_collapsed_groups_v1";
/** 标签数量上限;超出按「最久未访问」挤掉(LRU) */
const MAX_TABS = 12;

/** 某菜单项当前用户是否可见(platform_admin 直通;无 perm 人人可见) */
function canSeeItem(it: MenuItem, me: AuthMe | null | undefined): boolean {
  return !it.perm || !!me?.isPlatformAdmin || (me?.permissions ?? []).includes(it.perm);
}
/** 当前用户有权访问的全部菜单路径(恢复标签时按此过滤,防越权暴露) */
function visiblePathSet(me: AuthMe | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const c of CATEGORIES) for (const it of c.items) if (canSeeItem(it, me)) s.add(it.path);
  return s;
}
/** 当前用户「第一个有权限且可用」的菜单路径(用于 /admin 首跳落地);兜底 organizations */
function firstVisiblePath(me: AuthMe | null | undefined): string {
  for (const c of CATEGORIES) for (const it of c.items) if (!it.disabled && canSeeItem(it, me)) return it.path;
  return "/admin/organizations";
}

/** /admin 默认首跳:不再写死 organizations,落到当前用户第一个有权限的页面 */
export function AdminIndexRedirect() {
  const { me } = useAuth();
  return <Navigate to={firstVisiblePath(me)} replace />;
}
/** 超出上限时挤掉「最久未访问」且非当前页的标签,直到回到上限内 */
function evictLRU(list: Tab[], keep: string, recency: Map<string, number>): Tab[] {
  let out = list;
  while (out.length > MAX_TABS) {
    let victim: string | null = null;
    let min = Infinity;
    for (const t of out) {
      if (t.path === keep) continue;
      const r = recency.get(t.path) ?? 0;
      if (r < min) { min = r; victim = t.path; }
    }
    if (!victim) break;
    out = out.filter((t) => t.path !== victim);
  }
  return out;
}

/* ─── 多标签 keep-alive 内容区 ─── */
/** 每个打开过的标签各渲染一份(用 useRoutes 按其路径匹配),只显示当前页;
    切换标签 = 显隐切换,组件不卸载 → 数据/滚动/页内状态全部保活。 */
function KeepAliveRoutes({
  routes,
  alivePaths,
  currentPath,
}: {
  routes: RouteObject[];
  alivePaths: string[];
  currentPath: string;
}) {
  return (
    <div className="flex-1 min-h-0 relative">
      {alivePaths.map((p) => {
        const active = p === currentPath;
        return (
          <div
            key={p}
            className="absolute inset-0 overflow-auto"
            style={{ display: active ? "block" : "none" }}
            aria-hidden={!active}
            inert={active ? undefined : true}
          >
            <RouteSlot routes={routes} path={p} />
          </div>
        );
      })}
    </div>
  );
}
/** 把 routes 按指定 path 匹配渲染(location 覆盖),与当前真实 URL 解耦 */
function RouteSlot({ routes, path }: { routes: RouteObject[]; path: string }) {
  return useRoutes(routes, path);
}

export default function AdminLayout({ routes }: { routes: RouteObject[] }) {
  const { me } = useAuth();
  // 切换账号 = uid 变化 → 内层整体重挂载,标签/分类等状态按新用户从其专属存储重新初始化(杜绝串号)
  const uid = me?.id ?? "anon";
  return <AdminLayoutInner key={uid} uid={uid} routes={routes} />;
}

function AdminLayoutInner({ uid, routes }: { uid: string; routes: RouteObject[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { me } = useAuth();
  // 桌面客户端(Tauri)后台待办提醒;浏览器里 no-op
  useDesktopInboxAlerts(!!me);
  // 「我的考核」实时角标:待我确认的指标项数(登录后轮询)
  const myAssessBadge = useMyAssessmentBadge(!!me);

  /* ── 按权限过滤菜单(platform_admin 直通;无 perm 的项人人可见,如「我的待办」)── */
  const visibleCategories = useMemo(
    () =>
      CATEGORIES.map((c) => ({ ...c, items: c.items.filter((it) => canSeeItem(it, me)) })).filter(
        (c) => c.items.length > 0,
      ),
    [me],
  );

  /* ── 当前所在 category(基于当前路径或本地存储) ── */
  const [activeCatId, setActiveCatId] = useState<string>(() => {
    const fromPath = findMenuItem(location.pathname)?.category.id;
    if (fromPath) return fromPath;
    return localStorage.getItem(CAT_STORAGE_KEY) ?? "org";
  });

  /* ── 已打开 Tabs(按用户分桶恢复 + 按权限过滤) ── */
  const [tabs, setTabs] = useState<Tab[]>(() => {
    // 清理旧的全局标签键(不分用户,曾导致换账号串号)
    localStorage.removeItem(LEGACY_TABS_KEY);
    try {
      const raw = localStorage.getItem(tabsKeyFor(uid));
      if (!raw) return [];
      const parsed: { path: string; label: string }[] = JSON.parse(raw);
      const allowed = visiblePathSet(me); // 越权防护:只恢复当前用户有权访问的标签
      return parsed
        .filter((p) => allowed.has(p.path))
        .map((p) => {
          const found = findMenuItem(p.path);
          return found ? { path: p.path, label: found.item.label, icon: found.item.icon } : null;
        })
        .filter(Boolean) as Tab[];
    } catch {
      return [];
    }
  });

  /* ── 标签栏:LRU 访问时序 / 横向滚动 / 右键菜单 ── */
  const seqRef = useRef(0);
  const recencyRef = useRef<Map<string, number>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  /* ── 左侧二级菜单是否收缩 ── */
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  );
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  /* ── 二级菜单分组(如「证书管理」)折叠态 ── */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(GROUP_COLLAPSED_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    localStorage.setItem(GROUP_COLLAPSED_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);
  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  /* 当前 tab 等于 URL */
  const currentPath = location.pathname;

  /* 当 URL 变化时:
       1. 若是受管菜单路径但不在 tabs 中,自动加 tab
       2. 同步 activeCatId
  */
  useEffect(() => {
    const found = findMenuItem(currentPath);
    // 记录访问时序(供 LRU 挤出最久未访问的标签)
    seqRef.current += 1;
    recencyRef.current.set(currentPath, seqRef.current);
    if (!found) return;
    // URL(外部系统)→ 状态:tab 是逐次累计的「访问历史」,直链/后退也要进 tab,
    // 无法渲染期派生 —— useLocation 的变化就是订阅回调,此处 setState 属合法同步。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveCatId(found.category.id);
    setTabs((prev) => {
      if (prev.some((t) => t.path === currentPath)) return prev;
      const next = [...prev, { path: currentPath, label: found.item.label, icon: found.item.icon }];
      return next.length > MAX_TABS ? evictLRU(next, currentPath, recencyRef.current) : next;
    });
  }, [currentPath]);

  /* 标签溢出检测(显隐 ‹ › 滚动按钮);标签增减 + 容器尺寸变化时重测 */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const o = el.scrollWidth > el.clientWidth + 1;
      setOverflowing((prev) => (prev === o ? prev : o));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  /* 当前标签自动滚入可视区 */
  useEffect(() => {
    scrollerRef.current
      ?.querySelector<HTMLElement>('[data-tab-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPath, tabs.length]);

  /* 右键菜单:点击 / 右键空白 / 失焦 / Esc 关闭 */
  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTabMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [tabMenu]);

  /* 持久化(标签按用户分桶) */
  useEffect(() => {
    localStorage.setItem(tabsKeyFor(uid), JSON.stringify(tabs.map((t) => ({ path: t.path, label: t.label }))));
  }, [tabs, uid]);
  useEffect(() => {
    localStorage.setItem(CAT_STORAGE_KEY, activeCatId);
  }, [activeCatId]);

  /* keep-alive 渲染集 = 已打开标签 ∪ 当前页(详情页虽不进标签,也要渲染) */
  const alivePaths = useMemo(() => {
    const set = new Set(tabs.map((t) => t.path));
    set.add(currentPath);
    return [...set];
  }, [tabs, currentPath]);

  const activeCat = useMemo(
    () => visibleCategories.find((c) => c.id === activeCatId) ?? visibleCategories[0] ?? CATEGORIES[0],
    [activeCatId, visibleCategories],
  );

  /* 把二级菜单项按 group 聚合(保持出现顺序);无 group 的归到匿名组 "" */
  const menuGroups = useMemo(() => {
    const out: { name: string; items: MenuItem[] }[] = [];
    for (const it of activeCat.items) {
      const g = it.group ?? "";
      let bucket = out.find((x) => x.name === g);
      if (!bucket) {
        bucket = { name: g, items: [] };
        out.push(bucket);
      }
      bucket.items.push(it);
    }
    return out;
  }, [activeCat]);

  function closeTabByPath(path: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      // 如果关掉的是当前 tab,跳到旁边一个 tab(或者第一个,或者菜单首项)
      if (path === currentPath) {
        const idx = prev.findIndex((t) => t.path === path);
        const fallback = next[idx] ?? next[idx - 1] ?? next[0];
        if (fallback) navigate(fallback.path);
        else navigate(activeCat.items[0]?.path ?? "/admin");
      }
      return next;
    });
  }
  function closeTab(path: string, e: React.MouseEvent) {
    e.stopPropagation();
    closeTabByPath(path);
  }
  /** 关闭其他:只留下指定标签 */
  function closeOthers(path: string) {
    setTabs((prev) => prev.filter((t) => t.path === path));
    if (path !== currentPath) navigate(path);
  }
  /** 关闭右侧:留下指定标签及其左侧 */
  function closeRight(path: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx < 0) return prev;
      const next = prev.slice(0, idx + 1);
      if (!next.some((t) => t.path === currentPath)) navigate(path);
      return next;
    });
  }
  /** 关闭全部:保留当前页(若是菜单页),其余全关 */
  function closeAll() {
    setTabs((prev) => prev.filter((t) => t.path === currentPath));
  }
  function scrollTabs(dir: number) {
    scrollerRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  }

  function switchCategory(catId: string) {
    setActiveCatId(catId);
    // 切换分类时,如果当前路径不在该分类下,自动跳到该分类首项(若可用;只取有权限的可见项)
    const cat = visibleCategories.find((c) => c.id === catId);
    const stillInCat = cat?.items.some((i) => i.path === currentPath);
    if (!stillInCat) {
      const firstEnabled = cat?.items.find((i) => !i.disabled);
      if (firstEnabled) navigate(firstEnabled.path);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#F7F8FA]">
      {/* ════ 顶栏 (TopBar) ════ */}
      <header className="h-14 flex items-center bg-white border-b border-[#E9E9E9] shadow-sm flex-shrink-0">
        {/* 左上:Logo + 返回门户 */}
        <div className="w-60 flex-shrink-0 flex items-center gap-2 px-4 border-r border-[#F0F0F0]">
          <SiteLogo className="w-8 h-8 flex-shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold text-[var(--party-primary)] truncate">党建益友</span>
            <span className="text-[10px] text-[#9CA3AF]">管理后台</span>
          </div>
          <Link
            to="/"
            title="返回门户首页"
            className="ml-auto flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] text-[#6B7280] hover:text-[var(--party-primary)] hover:bg-party-soft transition-colors flex-shrink-0"
          >
            <ChevronLeftIcon className="w-3 h-3" />
            <HomeIcon className="w-3 h-3" />
          </Link>
        </div>

        {/* 右上中:一级分类菜单(放不下自动折叠进「更多」) */}
        <CategoryNav categories={visibleCategories} activeId={activeCat.id} onSwitch={switchCategory} />

        {/* 右上右:用户设置 */}
        <UserSettingsMenu />
      </header>

      {/* ════ 主体 (Sidebar + Content) ════ */}
      <div className="flex-1 flex min-h-0">

        {/* 左下:二级菜单(可收缩 + 分组标题) */}
        <aside
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: sidebarCollapsed ? "56px" : "240px" }}
          className="min-w-0 overflow-hidden bg-white border-r border-[#E9E9E9] flex flex-col"
        >
          <div
            className={`border-b border-[#F0F0F0] flex items-center ${
              sidebarCollapsed ? "justify-center px-0 py-3" : "gap-2 px-4 py-3"
            }`}
          >
            {!sidebarCollapsed && (
              <>
                <activeCat.icon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />
                <span className="text-sm font-bold text-[#1A1A1A] flex-1 truncate">{activeCat.label}</span>
              </>
            )}
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              className="p-1 rounded hover:bg-[#F7F8FA] text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpenIcon className="w-4 h-4" />
              ) : (
                <PanelLeftCloseIcon className="w-4 h-4" />
              )}
            </button>
          </div>
          <nav className="flex-1 py-2 px-2 flex flex-col gap-0.5 overflow-y-auto">
            {menuGroups.map((g, gi) => {
              // 仅在侧栏展开态生效:点分组标题折叠/展开其子项
              const groupCollapsed = !!g.name && collapsedGroups.has(g.name);
              const hideItems = groupCollapsed && !sidebarCollapsed;
              return (
                <div key={g.name || `__anon_${gi}`} className="flex flex-col gap-0.5">
                  {g.name && !sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.name)}
                      title={groupCollapsed ? "展开分组" : "收起分组"}
                      className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[13px] font-bold text-[#374151] hover:text-[var(--party-primary)] transition-colors"
                    >
                      {groupCollapsed ? (
                        <ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span className="flex-1 text-left truncate">{g.name}</span>
                    </button>
                  )}
                  {g.name && sidebarCollapsed && gi > 0 && (
                    <div className="my-1 mx-2 border-t border-[#F0F0F0]" />
                  )}
                  {!hideItems &&
                    g.items.map((it) => (
                      <SidebarMenuItem
                        key={it.path}
                        item={it}
                        active={it.path === currentPath}
                        collapsed={sidebarCollapsed}
                        onNavigate={navigate}
                        badge={it.badgeKey === "myAssessment" ? myAssessBadge : 0}
                      />
                    ))}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* 右下:Tab 栏 + 内容区 */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Tab 栏:‹ › 滚动按钮 + 可滚动标签区 + 关闭全部 */}
          <div className="h-10 bg-white border-b border-[#E9E9E9] flex items-center flex-shrink-0">
            {overflowing && (
              <button
                onClick={() => scrollTabs(-1)}
                title="向左滚动"
                className="h-full px-1.5 flex items-center text-[#9CA3AF] hover:text-[var(--party-primary)] hover:bg-[#F7F8FA] border-r border-[#F0F0F0] flex-shrink-0"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
            )}
            <div
              ref={scrollerRef}
              className="flex-1 min-w-0 flex items-center h-full overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {tabs.length === 0 ? (
                <div className="px-4 text-xs text-[#9CA3AF]">从左侧菜单打开一个页面</div>
              ) : (
                tabs.map((t) => {
                  const Icon = t.icon;
                  const active = t.path === currentPath;
                  return (
                    <div
                      key={t.path}
                      data-tab-active={active ? "true" : "false"}
                      onClick={() => navigate(t.path)}
                      onAuxClick={(e) => {
                        if (e.button === 1) closeTab(t.path, e); // 中键关闭
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation(); // 不冒泡到 window,避免刚弹出就被关闭
                        setTabMenu({ x: e.clientX, y: e.clientY, path: t.path });
                      }}
                      className="group flex items-center gap-1.5 h-full px-3 cursor-pointer border-r border-[#F0F0F0] transition-colors flex-shrink-0"
                      style={{
                        backgroundColor: active ? "#F7F8FA" : "transparent",
                        borderBottom: active ? "2px solid var(--party-primary)" : "2px solid transparent",
                        color: active ? "#1A1A1A" : "#6B7280",
                      }}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs font-medium whitespace-nowrap">{t.label}</span>
                      <button
                        onClick={(e) => closeTab(t.path, e)}
                        className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all ml-1 flex-shrink-0"
                        title="关闭"
                      >
                        <XIcon className="w-2.5 h-2.5 text-[#6B7280] hover:text-red-600" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            {overflowing && (
              <button
                onClick={() => scrollTabs(1)}
                title="向右滚动"
                className="h-full px-1.5 flex items-center text-[#9CA3AF] hover:text-[var(--party-primary)] hover:bg-[#F7F8FA] border-l border-[#F0F0F0] flex-shrink-0"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            )}
            {tabs.length > 1 && (
              <button
                onClick={closeAll}
                title="关闭全部(保留当前页)"
                className="h-full px-2 flex items-center text-[#9CA3AF] hover:text-red-600 hover:bg-[#F7F8FA] border-l border-[#F0F0F0] flex-shrink-0"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 内容区(多标签 keep-alive) */}
          <KeepAliveRoutes routes={routes} alivePaths={alivePaths} currentPath={currentPath} />
        </main>
      </div>

      {/* 标签右键菜单 */}
      {tabMenu && (
        <div
          className="fixed z-50 min-w-[132px] bg-white rounded-md shadow-lg border border-[#E9E9E9] py-1 text-xs"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <TabMenuItem label="关闭" onClick={() => { closeTabByPath(tabMenu.path); setTabMenu(null); }} />
          <TabMenuItem label="关闭其他" onClick={() => { closeOthers(tabMenu.path); setTabMenu(null); }} />
          <TabMenuItem label="关闭右侧" onClick={() => { closeRight(tabMenu.path); setTabMenu(null); }} />
          <div className="h-px bg-[#F0F0F0] my-1" />
          <TabMenuItem label="关闭全部" onClick={() => { closeAll(); setTabMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function TabMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-[#4B5563] hover:bg-[#F7F8FA] hover:text-[var(--party-primary)] transition-colors"
    >
      {label}
    </button>
  );
}

/* ─── 顶部一级分类菜单(放不下自动折叠进「更多」) ─── */
function CatButton({ cat, active, onClick }: { cat: Category; active: boolean; onClick: () => void }) {
  const Icon = cat.icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap"
      style={{
        color: active ? "var(--party-primary)" : "#4B5563",
        backgroundColor: active ? "color-mix(in srgb, var(--party-primary) 8%, white)" : "transparent",
        boxShadow: active ? "inset 0 -2px 0 0 var(--party-primary)" : "none",
      }}
    >
      <Icon className="w-4 h-4" />
      {cat.label}
    </button>
  );
}

function CategoryNav({
  categories,
  activeId,
  onSwitch,
}: {
  categories: Category[];
  activeId: string;
  onSwitch: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(categories.length);
  const [moreOpen, setMoreOpen] = useState(false);

  /* 容器宽度 / 分类数变化 → 算出能完整放下几个,其余折进「更多」 */
  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const RESERVE = 100; // 给「更多」按钮预留的宽度
    const GAP = 4;
    const recompute = () => {
      const avail = wrap.clientWidth;
      const widths = [...measure.children].map((c) => (c as HTMLElement).offsetWidth);
      const total = widths.reduce((s, w, i) => s + w + (i > 0 ? GAP : 0), 0);
      let n: number;
      if (total <= avail) {
        n = widths.length; // 全放得下,不要「更多」
      } else {
        let used = 0;
        n = 0;
        for (let i = 0; i < widths.length; i++) {
          const add = widths[i] + (i > 0 ? GAP : 0);
          if (used + add + RESERVE <= avail) {
            used += add;
            n++;
          } else break;
        }
        n = Math.max(1, n); // 至少留一个可见
      }
      setVisibleCount((prev) => (prev === n ? prev : n));
    };
    recompute();
    // 初次挂载时测量层可能尚未完成布局/字体加载(宽度读到 0)→ 下一帧 + 字体就绪后再算一次
    let cancelled = false;
    const raf = requestAnimationFrame(recompute);
    if (document.fonts?.ready) document.fonts.ready.then(() => { if (!cancelled) recompute(); });
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [categories]);

  /* 点外部关闭「更多」下拉 */
  useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [moreOpen]);

  const visible = categories.slice(0, visibleCount);
  const overflow = categories.slice(visibleCount);
  const activeInOverflow = overflow.some((c) => c.id === activeId);

  return (
    <div ref={wrapRef} className="flex-1 min-w-0 px-3 relative flex items-center">
      {/* 测量层:0×0 裁剪,不影响布局也不撑出滚动条;只为读取每个按钮真实宽度 */}
      <div className="absolute left-0 top-0 w-0 h-0 overflow-hidden" aria-hidden>
        <div ref={measureRef} className="flex items-center gap-1">
          {categories.map((c) => (
            <CatButton key={c.id} cat={c} active={false} onClick={() => {}} />
          ))}
        </div>
      </div>

      {/* 可见层 */}
      <div className="flex items-center gap-1 min-w-0">
        {visible.map((c) => (
          <CatButton key={c.id} cat={c} active={c.id === activeId} onClick={() => onSwitch(c.id)} />
        ))}
        {overflow.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((v) => !v);
              }}
              className="flex items-center gap-1 px-3 h-9 rounded-md text-sm font-medium transition-all"
              style={{
                color: activeInOverflow ? "var(--party-primary)" : "#4B5563",
                backgroundColor: activeInOverflow ? "color-mix(in srgb, var(--party-primary) 8%, white)" : "transparent",
                boxShadow: activeInOverflow ? "inset 0 -2px 0 0 var(--party-primary)" : "none",
              }}
            >
              <MoreHorizontalIcon className="w-4 h-4" />
              更多
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {moreOpen && (
              <div
                className="absolute top-full left-0 mt-1 w-44 bg-white rounded-md shadow-lg border border-[#E9E9E9] py-1 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                {overflow.map((c) => {
                  const Icon = c.icon;
                  const active = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSwitch(c.id);
                        setMoreOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        active
                          ? "text-[var(--party-primary)] bg-party-soft font-semibold"
                          : "text-[#4B5563] hover:bg-[#F7F8FA]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 用户设置下拉 ─── */
function UserSettingsMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { me, logout } = useAuth();

  // 主行政岗位摘要,作为身份副标题
  const primaryAdmin = me?.memberships.admin.find((m) => m.isPrimary);
  const primaryParty = me?.memberships.party.find((m) => m.isPrimary);
  const subtitle = primaryAdmin
    ? `${primaryAdmin.org.name}${primaryAdmin.position ? " · " + primaryAdmin.position : ""}`
    : me?.username
    ? `员工编号 ${me.username}`
    : "";

  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  const displayName = me?.name ?? "未登录";
  const avatarInitial = me?.name?.charAt(0) ?? "?";
  const avatarSrc = resolveAvatarUrl(me?.avatarUrl);

  return (
    <div className="relative w-56 flex-shrink-0 px-3 flex items-center justify-end border-l border-[#F0F0F0]">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[#F7F8FA] transition-colors max-w-full"
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt=""
            className="w-7 h-7 rounded-full object-cover border border-[#E9E9E9] flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {avatarInitial}
          </div>
        )}
        <div className="flex flex-col leading-tight items-start min-w-0">
          <span className="text-xs font-medium text-[#1A1A1A] truncate max-w-[140px]">
            {displayName}
            {primaryParty && (
              <span className="ml-1 text-[9px] px-1 py-px rounded bg-party-soft text-[var(--party-primary)] font-normal align-middle">
                党员
              </span>
            )}
          </span>
          <span className="text-[10px] text-[#9CA3AF] truncate max-w-[140px]">{subtitle}</span>
        </div>
        <SettingsIcon className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full right-3 mt-1 w-56 bg-white rounded-md shadow-lg border border-[#E9E9E9] py-1 z-50">
          {/* 身份概要 */}
          {me && (
            <div className="px-3 py-2 border-b border-[#F0F0F0]">
              <div className="text-xs font-semibold text-[#1A1A1A]">{me.name}</div>
              <div className="text-[10px] text-[#9CA3AF]">员工编号 {me.username}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {me.memberships.admin.slice(0, 3).map((m) => (
                  <span
                    key={m.orgId}
                    className="text-[9px] px-1.5 py-px rounded bg-[#EEF4FF] text-[rgb(26,107,200)]"
                    title={`${m.org.name} · ${m.position ?? ""}`}
                  >
                    {m.position ?? m.org.name}
                  </span>
                ))}
                {primaryParty && (
                  <span
                    className="text-[9px] px-1.5 py-px rounded bg-party-soft text-[var(--party-primary)]"
                    title={primaryParty.org.name}
                  >
                    {primaryParty.org.name}
                  </span>
                )}
              </div>
            </div>
          )}
          <MenuButton icon={UserIcon} label="个人资料" disabled />
          <MenuButton icon={KeyIcon}  label="修改密码" disabled />
          <div className="h-px bg-[#F0F0F0] my-1" />
          <MenuButton icon={LogOutIcon} label="退出登录" onClick={handleLogout} />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#4B5563] hover:bg-[#F7F8FA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="flex-1">{label}</span>
      {disabled && <span className="text-[9px] text-[#D1D5DB]">待实现</span>}
    </button>
  );
}
