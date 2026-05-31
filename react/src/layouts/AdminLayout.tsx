import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon, ChevronLeftIcon, XIcon,
  NetworkIcon, BarChart2Icon, SettingsIcon,
  BuildingIcon, ShieldIcon, UserIcon, BookTextIcon,
  EyeIcon, ThumbsUpIcon, MessageSquareIcon,
  LogOutIcon, KeyIcon, SlidersHorizontalIcon, PaletteIcon, LayoutGridIcon,
  AwardIcon, BriefcaseIcon, SendIcon, ListChecksIcon, UploadIcon,
  KeyRoundIcon, PanelLeftCloseIcon, PanelLeftOpenIcon,
  ChevronDownIcon, ChevronRightIcon,
} from "lucide-react";
import { useAuth } from "../stores/auth";

/* ─── 顶部一级分类 → 联动左侧二级菜单 ─── */
/** group:可选的二级菜单分组标题(同 group 的项聚在一个小标题下) */
interface MenuItem { path: string; label: string; icon: React.ElementType; disabled?: boolean; group?: string; }
interface Category { id: string; label: string; icon: React.ElementType; items: MenuItem[]; }

const CATEGORIES: Category[] = [
  {
    id: "org",
    label: "组织与权限",
    icon: NetworkIcon,
    items: [
      { path: "/admin/organizations", label: "党组织 / 行政机构", icon: BuildingIcon },
      { path: "/admin/users",         label: "用户管理",           icon: UserIcon    },
      { path: "/admin/roles",         label: "角色与权限",         icon: ShieldIcon  },
    ],
  },
  {
    id: "sys",
    label: "系统设置",
    icon: SlidersHorizontalIcon,
    items: [
      { path: "/admin/dictionaries",   label: "数据字典",         icon: BookTextIcon },
      { path: "/admin/custom-fields",  label: "用户自定义字段",   icon: SlidersHorizontalIcon },
      { path: "/admin/site-settings",  label: "站点设置",         icon: PaletteIcon  },
      { path: "/admin/navigation",     label: "首页导航",         icon: LayoutGridIcon },
      { path: "/admin/external-apis",  label: "外部 API 接入",    icon: KeyRoundIcon },
    ],
  },
  {
    id: "biz",
    label: "业务功能",
    icon: BriefcaseIcon,
    items: [
      { path: "/admin/certificate-templates", label: "证书模板",   icon: AwardIcon,      group: "证书管理" },
      { path: "/admin/certificates/issue",    label: "颁发证书",   icon: SendIcon,       group: "证书管理" },
      { path: "/admin/certificates/external", label: "外部证书录入", icon: UploadIcon,    group: "证书管理" },
      { path: "/admin/certificates",          label: "已发证书",   icon: ListChecksIcon, group: "证书管理" },
    ],
  },
  {
    id: "stats",
    label: "数据统计",
    icon: BarChart2Icon,
    items: [
      { path: "/admin/stats/views", label: "浏览统计", icon: EyeIcon,         disabled: true },
      { path: "/admin/stats/likes", label: "点赞统计", icon: ThumbsUpIcon,    disabled: true },
      { path: "/admin/feedback",    label: "用户反馈", icon: MessageSquareIcon, disabled: true },
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
}: {
  item: MenuItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: (path: string) => void;
}) {
  const Icon = item.icon;
  const base = `flex items-center gap-2 rounded-lg text-sm transition-all ${
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
    </button>
  );
}

interface Tab { path: string; label: string; icon: React.ElementType; }

const TABS_STORAGE_KEY = "djyy_admin_tabs_v1";
const CAT_STORAGE_KEY  = "djyy_admin_active_cat_v1";
const SIDEBAR_COLLAPSED_KEY = "djyy_admin_sidebar_collapsed_v1";
const GROUP_COLLAPSED_KEY = "djyy_admin_collapsed_groups_v1";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  /* ── 当前所在 category(基于当前路径或本地存储) ── */
  const [activeCatId, setActiveCatId] = useState<string>(() => {
    const fromPath = findMenuItem(location.pathname)?.category.id;
    if (fromPath) return fromPath;
    return localStorage.getItem(CAT_STORAGE_KEY) ?? "org";
  });

  /* ── 已打开 Tabs ── */
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      if (!raw) return [];
      const parsed: { path: string; label: string }[] = JSON.parse(raw);
      // 恢复 icon 引用
      return parsed
        .map((p) => {
          const found = findMenuItem(p.path);
          return found ? { path: p.path, label: found.item.label, icon: found.item.icon } : null;
        })
        .filter(Boolean) as Tab[];
    } catch {
      return [];
    }
  });

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
    if (found) {
      setActiveCatId(found.category.id);
      setTabs((prev) => {
        if (prev.some((t) => t.path === currentPath)) return prev;
        return [...prev, { path: currentPath, label: found.item.label, icon: found.item.icon }];
      });
    }
  }, [currentPath]);

  /* 持久化 */
  useEffect(() => {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs.map((t) => ({ path: t.path, label: t.label }))));
  }, [tabs]);
  useEffect(() => {
    localStorage.setItem(CAT_STORAGE_KEY, activeCatId);
  }, [activeCatId]);

  const activeCat = useMemo(() => CATEGORIES.find((c) => c.id === activeCatId) ?? CATEGORIES[0], [activeCatId]);

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

  function closeTab(path: string, e: React.MouseEvent) {
    e.stopPropagation();
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

  function switchCategory(catId: string) {
    setActiveCatId(catId);
    // 切换分类时,如果当前路径不在该分类下,自动跳到该分类首项(若可用)
    const cat = CATEGORIES.find((c) => c.id === catId);
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
          <div className="w-8 h-8 rounded-full bg-[var(--party-primary)] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 40 40" width="22" height="22">
              <polygon points="20,5 23.5,15 34,15 25.5,21.5 28.5,32 20,26 11.5,32 14.5,21.5 6,15 16.5,15" fill="var(--party-accent)" />
            </svg>
          </div>
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

        {/* 右上中:一级分类菜单 */}
        <nav className="flex-1 flex items-center gap-1 px-3 overflow-x-auto">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.id === activeCatId;
            return (
              <button
                key={c.id}
                onClick={() => switchCategory(c.id)}
                className="flex items-center gap-1.5 px-4 h-9 rounded-md text-sm font-medium transition-all flex-shrink-0"
                style={{
                  color: active ? "var(--party-primary)" : "#4B5563",
                  backgroundColor: active ? "color-mix(in srgb, var(--party-primary) 8%, white)" : "transparent",
                  boxShadow: active ? "inset 0 -2px 0 0 var(--party-primary)" : "none",
                }}
              >
                <Icon className="w-4 h-4" />
                {c.label}
              </button>
            );
          })}
        </nav>

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
                      />
                    ))}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* 右下:Tab 栏 + 内容区 */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Tab 栏 */}
          <div className="h-10 bg-white border-b border-[#E9E9E9] flex items-center gap-0 overflow-x-auto flex-shrink-0">
            {tabs.length === 0 ? (
              <div className="px-4 text-xs text-[#9CA3AF]">从左侧菜单打开一个页面</div>
            ) : (
              tabs.map((t) => {
                const Icon = t.icon;
                const active = t.path === currentPath;
                return (
                  <div
                    key={t.path}
                    onClick={() => navigate(t.path)}
                    className="group flex items-center gap-1.5 h-full px-3 cursor-pointer border-r border-[#F0F0F0] transition-colors flex-shrink-0"
                    style={{
                      backgroundColor: active ? "#F7F8FA" : "transparent",
                      borderBottom: active ? "2px solid var(--party-primary)" : "2px solid transparent",
                      color: active ? "#1A1A1A" : "#6B7280",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{t.label}</span>
                    <button
                      onClick={(e) => closeTab(t.path, e)}
                      className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all ml-1"
                      title="关闭"
                    >
                      <XIcon className="w-2.5 h-2.5 text-[#6B7280] hover:text-red-600" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* 内容区 */}
          <div className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </div>
        </main>
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

  return (
    <div className="relative w-56 flex-shrink-0 px-3 flex items-center justify-end border-l border-[#F0F0F0]">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[#F7F8FA] transition-colors max-w-full"
      >
        <div className="w-7 h-7 rounded-full bg-[var(--party-primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {avatarInitial}
        </div>
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
