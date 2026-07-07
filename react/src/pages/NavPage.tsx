import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SearchIcon, UserIcon, StarIcon, ChevronRightIcon,
  TrendingUpIcon, CrownIcon, FileTextIcon,
  BookOpenIcon, ClipboardListIcon, UsersIcon,
  ClockIcon, XIcon, MegaphoneIcon, ShieldIcon,
  AlertCircleIcon, BuildingIcon, LayoutDashboardIcon,
  SettingsIcon, FlameIcon,
  LockIcon, LogOutIcon, ChevronDownIcon,
} from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { useAuth } from "../stores/auth";
import { siteSettingApi, FALLBACK_SITE_SETTINGS, SiteLogo } from "@/features/site-setting";
import { navApi, type NavCategoryDto, type NavItemDto } from "@/features/nav-category";
import { resolveAvatarUrl } from "@/features/avatar";
import { knowledgeApi } from "@/features/knowledge";
import { rankBarGradient } from "@/shared/lib/ranking-demo";
import { usePortalAssessmentBoard } from "@/features/assessment";
import { LucideIcon } from "@/shared/components/IconPicker";

/* ─── Login gate: 未登录直接跳登录页 ─── */
function useLoginGate() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!me;

  /** 跳到登录页,带 redirect 回到当前位置 */
  function goLogin() {
    navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }

  /** 公共项 (common=true) 总是允许;非公共项未登录 → 直接跳登录页(无中间提示) */
  function gate(item: { common: boolean; label: string }, onAllowed: () => void) {
    if (item.common || isLoggedIn) {
      onAllowed();
    } else {
      goLogin();
    }
  }

  return { isLoggedIn, me, goLogin, gate };
}

/* ─── Helper ─── */
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
// 排名层级色统一在 shared/lib/ranking-demo(门户 + 桌面挂件共用)
const progressGrad = rankBarGradient;

/* ─── Navigation data hook:统一从后端拉,React Query 缓存共享 ─── */
function useNavCategories() {
  return useQuery({
    queryKey: ["nav-categories", "portal"],
    queryFn: () => navApi.listForPortal(),
    staleTime: 60 * 1000,   // 1 分钟内不重拉
  });
}

/* ─── Rankings:概览 + 榜单均为真实实时考核结果(usePortalAssessmentBoard),演示数据已替换 ─── */

/* ─── Hot Tasks ─── */
const HOT_TASKS = [
  { id: 1, icon: BookOpenIcon, color: "var(--party-primary)", bg: "color-mix(in srgb, var(--party-primary) 8%, white)", title: `主题教育学习`, tag: `进行中`, tagColor: `bg-red-100 text-red-700`, date: `2025-06` },
  { id: 2, icon: ClipboardListIcon, color: "rgb(232, 112, 10)", bg: "rgb(255, 246, 237)", title: `年度党员民主评议`, tag: `待完成`, tagColor: `bg-orange-100 text-orange-700`, date: `2025-07` },
  { id: 3, icon: FileTextIcon, color: "rgb(26, 107, 200)", bg: "rgb(238, 244, 255)", title: `党费收缴统计上报`, tag: `本月截止`, tagColor: `bg-blue-100 text-blue-700`, date: `2025-06-30` },
  { id: 4, icon: UsersIcon, color: "rgb(45, 160, 88)", bg: "rgb(237, 250, 243)", title: `发展党员工作`, tag: `常态化`, tagColor: `bg-green-100 text-green-700`, date: `全年` },
  { id: 5, icon: MegaphoneIcon, color: "rgb(139, 0, 200)", bg: "rgb(247, 238, 255)", title: `党建宣传阵地建设`, tag: `重点工作`, tagColor: `bg-purple-100 text-purple-700`, date: `2025-Q3` },
  { id: 6, icon: ShieldIcon, color: "var(--party-primary)", bg: "color-mix(in srgb, var(--party-primary) 8%, white)", title: `廉政风险防控排查`, tag: `专项行动`, tagColor: `bg-red-100 text-red-700`, date: `2025-Q2` },
];

/* ─── Search ─── */
const HOT_WORDS = [`党章学习`, `两学一做`, `主题教育`, `党费缴纳`, `廉洁自律`, `组织生活`];
const SUGGEST_POOL = [
  `党章学习资料`, `党章全文下载`, `党章考试题库`, `两学一做学习教育`, `主题教育学习安排`,
  `主题教育心得体会`, `党费缴纳标准`, `党费缴纳流程`, `廉洁自律准则`, `廉洁风险排查`,
  `组织生活会记录`, `组织关系转移`, `党员发展流程`, `党员民主评议`, `党建统计报表`,
  `党支部工作计划`, `入党申请书模板`, `学习强国积分`, `党务公开内容`,
];
const NEWS_LIST = [
  { title: `关于做好2025年度党员发展工作的通知`, date: `2025-06-18`, hot: true },
  { title: `组织开展"学党史·强信念·跟党走"专题活动`, date: `2025-06-12`, hot: false },
  { title: `第二季度党支部书记述职报告工作安排`, date: `2025-06-08`, hot: false },
  { title: `党风廉政建设责任书签订工作部署会召开`, date: `2025-06-02`, hot: false },
];

/* ══════════════════════════════════
   Sub-components
   ══════════════════════════════════ */

/* ─── Nav Item Card ─── */
function NavItemCard({ item, showDesc = false }: { item: NavItemDto; showDesc?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { isLoggedIn, gate } = useLoginGate();
  const navigate = useNavigate();
  const locked = !item.common && !isLoggedIn;

  function handleClick() {
    gate(item, () => {
      if (!item.url) {
        console.log("[党建益友] Nav clicked (no url):", item.label);
        return;
      }
      // 外链 → 新窗口;站内 → SPA 路由
      if (/^https?:\/\//.test(item.url)) {
        window.open(item.url, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.url);
      }
    });
  }

  return (
    <div
      className="bg-white rounded-xl border transition-all duration-200 flex items-center gap-3 px-4 py-3.5 relative"
      style={{
        borderColor: hovered ? (locked ? "#D1D5DB" : item.color) : "#E9E9E9",
        transform: hovered && !locked ? "translateY(-2px)" : "none",
        boxShadow: hovered && !locked ? `0 6px 20px ${item.color}25` : "none",
        opacity: locked ? 0.55 : 1,
        cursor: locked ? "not-allowed" : "pointer",
        filter: locked ? "grayscale(0.5)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      title={locked ? `${item.label} · 需要登录后访问` : (item.desc ?? "")}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200"
        style={{ backgroundColor: hovered && !locked ? `color-mix(in srgb, ${item.color} 18%, white)` : `color-mix(in srgb, ${item.color} 8%, white)` }}
      >
        <LucideIcon name={item.icon} className="w-5 h-5" style={{ color: locked ? "#9CA3AF" : item.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-base font-semibold text-[#1A1A1A]">{item.label}</span>
          {item.common && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 font-bold">常用</span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
              <LockIcon className="w-2.5 h-2.5" />
              需登录
            </span>
          )}
        </div>
        {showDesc && <p className="text-sm text-[#9CA3AF] mt-0.5 truncate">{item.desc ?? ""}</p>}
        {!showDesc && <span className="text-[12px] text-[#C0C6D0]">👁 {fmt(item.views)}</span>}
      </div>
      <ChevronRightIcon
        className="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200"
        style={{ color: locked ? "#D1D5DB" : (hovered ? item.color : "#D1D5DB") }}
      />
    </div>
  );
}

/* ─── 快捷入口 strip ─── */
function QuickAccessBar() {
  const { gate } = useLoginGate();
  const navigate = useNavigate();
  const { data: cats } = useNavCategories();
  const commonItems = (cats ?? []).flatMap((c) => c.items.filter((i) => i.common));

  if (commonItems.length === 0) return null;

  function handleClick(item: NavItemDto) {
    gate(item, () => {
      if (!item.url) return;
      if (/^https?:\/\//.test(item.url)) {
        window.open(item.url, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.url);
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] px-5 py-4 mb-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-[#6B7280] flex-shrink-0 flex items-center gap-1">
          <StarIcon className="w-3.5 h-3.5 text-[var(--party-accent)]" />
          常用快捷
        </span>
        <div className="w-px h-4 bg-[#E9E9E9]" />
        <div className="flex flex-wrap gap-2">
          {commonItems.map((item) => (
            <button
              key={item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
              style={{
                borderColor: `color-mix(in srgb, ${item.color} 30%, transparent)`,
                color: item.color,
                backgroundColor: `color-mix(in srgb, ${item.color} 5%, white)`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = `color-mix(in srgb, ${item.color} 12%, white)`;
                (e.currentTarget as HTMLElement).style.borderColor = item.color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = `color-mix(in srgb, ${item.color} 5%, white)`;
                (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${item.color} 30%, transparent)`;
              }}
              onClick={() => handleClick(item)}
            >
              <LucideIcon name={item.icon} className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 全部导航目录 ─── */
function NavigationDirectory() {
  const [activeId, setActiveId] = useState("all");
  const { data: cats, isLoading } = useNavCategories();
  const allCats: NavCategoryDto[] = cats ?? [];
  const displayCategories = activeId === "all" ? allCats : allCats.filter((c) => c.id === activeId);
  const totalItems = allCats.reduce((a, c) => a + c.items.length, 0);

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E9E9E9]">
        <h2 className="party-section-title text-lg font-bold text-[#1A1A1A]">全部导航</h2>
        <span className="text-sm text-[#9CA3AF]">{allCats.length} 分类 · 共 {totalItems} 项</span>
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-[#E9E9E9] overflow-x-auto scrollbar-none">
        {/* 全部 tab */}
        <button
          onClick={() => setActiveId("all")}
          className="flex-shrink-0 px-5 py-3 text-base font-semibold transition-all border-b-2"
          style={{
            borderBottomColor: activeId === "all" ? "var(--party-primary)" : "transparent",
            color: activeId === "all" ? "var(--party-primary)" : "#6B7280",
            backgroundColor: activeId === "all" ? "color-mix(in srgb, var(--party-primary) 4%, white)" : "transparent",
          }}
        >
          全部
        </button>
        {allCats.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveId(cat.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-base font-semibold transition-all border-b-2"
              style={{
                borderBottomColor: isActive ? cat.color : "transparent",
                color: isActive ? cat.color : "#6B7280",
                backgroundColor: isActive ? `color-mix(in srgb, ${cat.color} 5%, white)` : "transparent",
              }}
            >
              <LucideIcon name={cat.icon} className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div className="p-5">
        {isLoading && allCats.length === 0 && (
          <div className="text-center text-sm text-[#9CA3AF] py-10">加载中…</div>
        )}
        {!isLoading && allCats.length === 0 && (
          <div className="text-center text-sm text-[#9CA3AF] py-10">
            暂无导航数据。前往 后台 → 首页导航 配置
          </div>
        )}
        {displayCategories.map((cat, idx) => (
          <div key={cat.id} className={idx > 0 ? "mt-6" : ""}>
            {activeId === "all" && (
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  <LucideIcon name={cat.icon} className="w-3 h-3 text-white" />
                </div>
                <span className="text-base font-bold" style={{ color: cat.color }}>{cat.label}</span>
                <div className="flex-1 h-px bg-[#F0F0F0]" />
                <span className="text-[12px] text-[#C0C6D0]">{cat.items.length} 项</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {cat.items.map((item) => (
                <NavItemCard key={item.id} item={item} showDesc={activeId !== "all"} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 排行榜侧边栏(概览 + 榜单同一份实时考核数据)─── */
function RankingSidebar() {
  const board = usePortalAssessmentBoard();
  // 本期概览:从实时榜推导(未登录/无数据显示 —)
  const n = board.rows.length;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const stats = [
    { label: "参评单位", value: n ? String(n) : "—", unit: n ? "个" : "", icon: BuildingIcon },
    {
      label: "平均总分",
      value: n ? String(r1(board.rows.reduce((a, r) => a + r.score, 0) / n)) : "—",
      unit: n ? "分" : "",
      icon: LayoutDashboardIcon,
    },
    { label: "最高总分", value: n ? String(r1(board.maxScore)) : "—", unit: n ? "分" : "", icon: CrownIcon },
  ];
  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-[#E9E9E9] p-4">
        <h3 className="party-section-title text-base font-bold text-[#1A1A1A] mb-3">本期概览</h3>
        <div className="grid grid-cols-3 gap-2">
          {stats.map(stat => {
            const SI = stat.icon;
            return (
              <div key={stat.label} className="flex flex-col items-center bg-party-soft rounded-xl p-3">
                <SI className="w-4 h-4 text-[var(--party-primary)] mb-1" />
                <span className="text-xl font-extrabold text-[var(--party-primary)] leading-tight">
                  {stat.value}<span className="text-[12px] text-[#9CA3AF] font-normal ml-0.5">{stat.unit}</span>
                </span>
                <span className="text-[12px] text-[#9CA3AF] mt-0.5 text-center leading-tight">{stat.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rankings:最新考核轮次的实时结果(60s 自动跟新,别人保存录入后榜单自动变) */}
      <AssessmentRankingCard board={board} />
    </div>
  );
}

/* ─── 考核排行榜卡片(真实实时数据)─── */
function AssessmentRankingCard({ board }: { board: ReturnType<typeof usePortalAssessmentBoard> }) {
  const { goLogin } = useLoginGate();
  const top10 = board.rows.slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E9E9E9]">
        <div className="min-w-0">
          <h3 className="party-section-title text-base font-bold text-[#1A1A1A]">党建考核排行榜</h3>
          {board.roundName && <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">{board.roundName} · 实时</p>}
        </div>
        {board.schemeId ? (
          <Link
            to={`/admin/assessment/schemes/${board.schemeId}/results`}
            className="text-sm text-[var(--party-primary)] flex items-center gap-0.5 hover:opacity-70 flex-shrink-0"
          >
            全部 <ChevronRightIcon className="w-3 h-3" />
          </Link>
        ) : null}
      </div>

      {board.loggedOut ? (
        /* 首页公开访问,考核数据登录可见 —— 不发请求(避免 401 拦截器把访客踢去登录页),给登录引导 */
        <div className="p-6 flex flex-col items-center gap-2.5 text-center">
          <LockIcon className="w-6 h-6 text-[#C0C6D0]" />
          <p className="text-sm text-[#6B7280]">登录后查看各单位实时考核排名</p>
          <button
            type="button"
            onClick={goLogin}
            className="px-4 py-1.5 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: "var(--party-primary)" }}
          >
            登录查看
          </button>
        </div>
      ) : board.loading ? (
        <div className="p-6 text-center text-sm text-[#9CA3AF]">加载中…</div>
      ) : top10.length === 0 ? (
        <div className="p-6 text-center text-sm text-[#9CA3AF]">暂无进行中的考核</div>
      ) : (
        <>
          {/* Top 3 */}
          <div className="p-3 flex flex-col gap-2">
            {top10.slice(0, 3).map(item => {
              // 经典金/银/铜奖牌色,与主题色解耦 —— 这是奖牌的固有语义色
              const medals = [
                { bg: "linear-gradient(135deg, #F5A623, #E8700A)", text: "#E8700A", border: "#F5A623" },  // 金
                { bg: "linear-gradient(135deg, #C0C0C0, #A8A8A8)", text: "#888", border: "#C0C0C0" },     // 银
                { bg: "linear-gradient(135deg, #CD7F32, #A0522D)", text: "#A0522D", border: "#CD7F32" },  // 铜
              ];
              const m = medals[item.rank - 1] ?? medals[2];
              return (
                <div
                  key={item.rank}
                  className="flex items-center gap-2.5 bg-[#FAFAFA] rounded-xl px-3 py-2.5 border hover:-translate-y-0.5 transition-transform duration-200"
                  style={{ borderColor: `${m.border}40` }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
                    style={{ background: m.bg }}
                  >
                    {item.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">{item.name}</p>
                    {item.grade && <p className="text-[11px] text-[#9CA3AF] leading-tight">{item.grade}</p>}
                  </div>
                  <span className="text-base font-extrabold flex-shrink-0" style={{ color: m.text }}>
                    {item.score}<span className="text-[11px] font-normal text-[#9CA3AF] ml-0.5">分</span>
                  </span>
                  {item.rank === 1 && <CrownIcon className="w-3.5 h-3.5 text-[#F5A623] flex-shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* 4–10 list(进度条按榜内最高分相对宽度 —— 实分是小数,不能按满分 100 画) */}
          <div className="border-t border-[#F0F0F0]">
            {top10.slice(3).map((item, idx) => (
              <div
                key={item.rank}
                className={`flex items-center gap-2.5 px-4 py-2.5 hover:bg-party-softer transition-colors ${
                  idx < 6 ? "border-b border-[#F5F5F5]" : ""
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[12px] font-bold text-[#6B7280] flex-shrink-0">
                  {item.rank}
                </div>
                <span className="text-sm text-[#1A1A1A] flex-1 min-w-0 truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-14 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${board.maxScore > 0 ? Math.max(4, (item.score / board.maxScore) * 100) : 0}%`,
                        background: progressGrad(item.rank),
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-[var(--party-primary)] w-10 text-right">{item.score}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── 热点问答(知识库 FAQ 点击热度榜;首页右侧栏卡片,登录后可见、无数据自动隐藏)─── */
function HotFaqCard() {
  const { isLoggedIn } = useLoginGate();
  const navigate = useNavigate();
  const hot = useQuery({
    queryKey: ["knowledge", "hot-faqs", "portal"],
    queryFn: () => knowledgeApi.hotFaqs(8),
    enabled: isLoggedIn, // 未登录不发请求(避免 401 拦截器把访客踢去登录页)
    staleTime: 60 * 1000,
  });
  const items = hot.data ?? [];
  if (!isLoggedIn || items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E9E9E9]">
        <h3 className="party-section-title text-base font-bold text-[#1A1A1A] flex items-center gap-1.5">
          <FlameIcon className="w-4 h-4 text-[var(--party-primary)]" /> 热点问答
        </h3>
        <button
          onClick={() => navigate("/knowledge")}
          className="text-sm text-[var(--party-primary)] flex items-center gap-0.5 hover:opacity-70 flex-shrink-0"
        >
          更多 <ChevronRightIcon className="w-3 h-3" />
        </button>
      </div>
      <div className="divide-y divide-[#F5F5F5]">
        {items.map((f, idx) => (
          <button
            key={`${f.articleId}-${f.id}`}
            onClick={() => navigate(`/knowledge/articles/${f.articleId}`)}
            className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-party-softer transition-colors"
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                idx < 3 ? "text-white" : "text-[#6B7280] bg-[#F0F0F0]"
              }`}
              style={idx < 3 ? { background: "var(--party-primary)" } : undefined}
            >
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[#1A1A1A] leading-snug line-clamp-2">{f.q}</span>
              <span className="block text-[11px] text-[#9CA3AF] mt-0.5 truncate">🔥 {f.clicks} · {f.articleTitle}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── 热点任务 ─── */
function HotTasksSection() {
  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="party-section-title text-xl font-bold text-[#1A1A1A]">热点任务</h2>
        <a href="#" onClick={e => e.preventDefault()} className="text-base text-[var(--party-primary)] flex items-center gap-1 hover:opacity-70">
          查看全部 <ChevronRightIcon className="w-4 h-4" />
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {HOT_TASKS.map(task => {
          const TI = task.icon;
          return (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-[#E9E9E9] p-4 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              onClick={() => console.log("[党建益友] Task:", task.title)}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: task.bg }}
              >
                <TI className="w-5 h-5" style={{ color: task.color }} />
              </div>
              <p className="text-base font-semibold text-[#1A1A1A] mb-2 line-clamp-2 leading-snug">{task.title}</p>
              <div className="flex items-center justify-between">
                <span className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${task.tagColor}`}>{task.tag}</span>
                <span className="text-[12px] text-[#9CA3AF]">{task.date}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── 党建资讯 ─── */
function NewsSection() {
  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="party-section-title text-xl font-bold text-[#1A1A1A]">党建资讯</h2>
        <a href="#" onClick={e => e.preventDefault()} className="text-base text-[var(--party-primary)] flex items-center gap-1 hover:opacity-70">
          更多资讯 <ChevronRightIcon className="w-4 h-4" />
        </a>
      </div>
      <div className="flex gap-5 flex-wrap">
        {/* Featured card */}
        <div
          className="rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
          style={{ flex: "1 1 280px" }}
        >
          <div
            className="h-36 flex items-end p-5"
            style={{ background: "linear-gradient(135deg, var(--party-primary) 0%, color-mix(in srgb, var(--party-primary) 55%, black) 60%, color-mix(in srgb, var(--party-primary) 35%, black) 100%)" }}
          >
            <div>
              <Badge className="mb-2 text-[12px]" style={{ backgroundColor: "var(--party-accent)", color: "white", border: "none" }}>
                重要精神
              </Badge>
              <h3 className="text-white font-bold text-base leading-snug">
                深入学习贯彻党的二十大精神<br />推动党建工作高质量发展
              </h3>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center justify-between border border-t-0 border-[#E9E9E9] rounded-b-xl">
            <span className="text-sm text-[#6B7280]">2025-06-15 · 党务工作部</span>
            <div className="flex items-center gap-1 text-sm text-[var(--party-primary)]">
              <TrendingUpIcon className="w-3.5 h-3.5" /> 热点
            </div>
          </div>
        </div>

        {/* News list */}
        <div className="bg-white rounded-xl border border-[#E9E9E9] p-4 flex flex-col gap-0" style={{ flex: "2 1 360px" }}>
          {NEWS_LIST.map((news, idx) => (
            <div key={idx}>
              <div
                className="flex items-center justify-between py-3 cursor-pointer group hover:text-[var(--party-primary)] transition-colors"
                onClick={() => console.log("[党建益友] News:", news.title)}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--party-primary)]" />
                  <span className="text-base text-[#1A1A1A] group-hover:text-[var(--party-primary)] transition-colors truncate">{news.title}</span>
                  {news.hot && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">HOT</span>
                  )}
                </div>
                <span className="text-sm text-[#9CA3AF] flex-shrink-0 ml-4">{news.date}</span>
              </div>
              {idx < NEWS_LIST.length - 1 && <Separator className="bg-[#F5F5F5]" />}
            </div>
          ))}
          <div className="pt-3 mt-1 border-t border-[#F5F5F5]">
            <button className="w-full text-sm text-[var(--party-primary)] hover:opacity-70 transition-opacity flex items-center justify-center gap-1 py-1">
              查看更多资讯 <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 头部用户区域:根据登录状态切换 ─── */
function HeaderUserArea() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const { goLogin } = useLoginGate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  /* 加载中:骨架占位,避免闪烁 */
  if (me === undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-8 rounded-lg bg-[#F3F4F6] animate-pulse" />
      </div>
    );
  }

  /* 未登录:显示「管理后台 (灰显需登录)」+「登录/注册」按钮 */
  if (me === null) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={goLogin}
          className="flex items-center gap-1.5 text-base font-medium px-3 py-2 rounded-lg text-[#9CA3AF] hover:text-[var(--party-primary)] hover:bg-party-soft transition-colors cursor-pointer"
          title="管理后台 · 需要登录后访问"
        >
          <LockIcon className="w-3.5 h-3.5" />
          管理后台
        </button>
        <button
          onClick={goLogin}
          className="flex items-center gap-1.5 text-base font-medium px-4 py-2 rounded-lg text-white transition-colors"
          style={{ backgroundColor: "var(--party-primary)" }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--party-primary) 80%, black)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--party-primary)")}
        >
          <UserIcon className="w-4 h-4" />
          登录 / 注册
        </button>
      </div>
    );
  }

  /* 已登录:显示用户头像 + 名字 + 下拉菜单 */
  const initial = (me.name || me.username || "?").trim().charAt(0).toUpperCase();
  const avatarSrc = resolveAvatarUrl(me.avatarUrl);
  return (
    <div className="flex items-center gap-2" ref={menuRef}>
      <Link
        to="/admin"
        className="hidden md:flex items-center gap-1.5 text-base font-medium px-3 py-2 rounded-lg text-[#4B5563] hover:text-[var(--party-primary)] hover:bg-party-soft transition-colors"
        title="管理后台"
      >
        <SettingsIcon className="w-4 h-4" />
        管理后台
      </Link>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-party-soft transition-colors"
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={me.name} className="w-8 h-8 rounded-full object-cover border border-[#E9E9E9]" />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
              style={{
                background: "linear-gradient(to bottom right, var(--party-primary), color-mix(in srgb, var(--party-primary) 80%, black))",
              }}
            >
              {initial}
            </div>
          )}
          <span className="text-base font-medium text-[#1A1A1A] max-w-[6rem] truncate">{me.name || me.username}</span>
          <ChevronDownIcon className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        {/* 下拉菜单 */}
        <div
          className={`absolute right-0 top-[calc(100%+8px)] w-52 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top-right ${
            menuOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
          }`}
        >
          <div className="px-4 py-3 border-b border-[#F0F0F0] bg-[#FAFAFA]">
            <p className="text-base font-semibold text-[#1A1A1A] truncate">{me.name || me.username}</p>
            {me.email && <p className="text-sm text-[#9CA3AF] truncate mt-0.5">{me.email}</p>}
          </div>
          <button
            onClick={() => { setMenuOpen(false); navigate("/admin"); }}
            className="md:hidden w-full flex items-center gap-2 px-4 py-2.5 text-base text-[#1A1A1A] hover:bg-party-soft hover:text-[var(--party-primary)] transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
            管理后台
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              logout();
              toast.success("已退出登录");
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-base text-[#1A1A1A] hover:bg-party-soft hover:text-[var(--party-primary)] transition-colors"
          >
            <LogOutIcon className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   Main NavPage Component
   ══════════════════════════════════ */
export default function NavPage() {
  const [searchValue, setSearchValue] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recentWords, setRecentWords] = useState<string[]>([`党章`, `廉洁`]);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  /* ─── 站点配置(后台「站点设置」页面维护) ─── */
  const settingsQuery = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingApi.get(),
    staleTime: 5 * 60 * 1000,    // 5 分钟内不再请求
  });
  const settings = settingsQuery.data ?? FALLBACK_SITE_SETTINGS;
  // theme 已通过 App.tsx 的 ThemeBootstrap 注入到 :root,这里只解构需要文案的字段
  const { brand, hero, footer, topNav } = settings;

  const suggestions = searchValue.trim()
    ? SUGGEST_POOL.filter(w => w.includes(searchValue.trim())).slice(0, 8)
    : [];
  const showHistoryPanel = panelOpen && !searchValue && recentWords.length > 0;
  const showSuggestPanel = panelOpen && !!searchValue && suggestions.length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSearch() {
    if (searchValue.trim()) {
      setRecentWords(prev => [searchValue.trim(), ...prev.filter(w => w !== searchValue.trim())].slice(0, 6));
      setSearchResult(searchValue.trim());
      setPanelOpen(false);
    } else {
      setPanelOpen(true);
    }
  }

  function handleSelectWord(word: string) {
    setSearchValue(word);
    setRecentWords(prev => [word, ...prev.filter(w => w !== word)].slice(0, 6));
    setSearchResult(null);
    setPanelOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchValue(e.target.value);
    setSearchResult(null);
    setPanelOpen(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8FA]">
      {/* ════ HEADER ════ */}
      {/* 注:--party-primary / --party-accent 已由 App.tsx 的 ThemeBootstrap 注入到 :root */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E9E9E9] shadow-sm">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <SiteLogo className="w-10 h-10 flex-shrink-0" alt={brand.title} />
            <div className="flex flex-col leading-tight">
              <span className="text-2xl font-bold tracking-wide" style={{ color: "var(--party-primary)" }}>{brand.title}</span>
              <span className="text-[12px] text-[#6B7280] tracking-widest">{brand.subtitle}</span>
            </div>
          </div>

          {/* Nav links — 后台「站点设置 → 首页顶端」可改文字/URL/排序/增删 */}
          <nav className="hidden md:flex items-center gap-6 mr-4">
            {topNav.items.map((item, idx) => {
              const isPlaceholder = !item.url || item.url === "#";
              return (
                <a
                  key={`${item.label}-${idx}`}
                  href={isPlaceholder ? "#" : item.url}
                  onClick={isPlaceholder ? (e) => e.preventDefault() : undefined}
                  className="text-base text-[#1A1A1A] hover:text-[var(--party-primary)] transition-colors font-medium"
                  title={isPlaceholder ? "暂未启用,请到「站点设置 → 首页顶端」配置 URL" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <HeaderUserArea />
        </div>
      </header>

      {/* ════ HERO SEARCH ════ */}
      <section className="party-hero-bg pt-16">
        <div className="max-w-[1280px] mx-auto px-6 py-12 flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-12 opacity-60" style={{ backgroundColor: "var(--party-accent)" }} />
            <span className="text-sm tracking-[0.3em] font-medium uppercase" style={{ color: "var(--party-accent)" }}>{hero.bannerLineEn}</span>
            <div className="h-px w-12 opacity-60" style={{ backgroundColor: "var(--party-accent)" }} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 leading-tight">{hero.mainSlogan}</h1>
          <p className="text-white/75 text-base mb-8 tracking-wide">{hero.subSlogan}</p>

          {/* Search box */}
          <div className="w-full max-w-xl relative" ref={searchWrapRef}>
            <div className={`flex bg-white rounded-xl overflow-hidden shadow-xl transition-all duration-200 ${searchFocused ? "ring-2 ring-party-accent-40" : ""}`}>
              <Input
                value={searchValue}
                onChange={handleInputChange}
                onFocus={() => { setSearchFocused(true); setPanelOpen(true); }}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSearch();
                  if (e.key === "Escape") { setPanelOpen(false); setSearchFocused(false); }
                }}
                placeholder="请输入党建相关关键词，如：党章、党费、廉洁..."
                className="flex-1 border-0 focus-visible:ring-0 text-base h-12 px-4 text-[#1A1A1A] placeholder:text-[#9CA3AF] rounded-none"
              />
              <button
                onClick={handleSearch}
                className="px-6 h-12 text-white font-semibold text-base flex items-center gap-2 flex-shrink-0 transition-colors"
                style={{ backgroundColor: searchFocused ? "color-mix(in srgb, var(--party-primary) 80%, black)" : "var(--party-primary)" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "color-mix(in srgb, var(--party-primary) 80%, black)")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = searchFocused ? "color-mix(in srgb, var(--party-primary) 80%, black)" : "var(--party-primary)")}
              >
                <SearchIcon className="w-4 h-4" />
                搜索
              </button>
            </div>

            {/* History panel */}
            <div className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top ${showHistoryPanel ? "opacity-100 scale-y-100 pointer-events-auto" : "opacity-0 scale-y-95 pointer-events-none"}`}>
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-[#9CA3AF] font-semibold flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" /> 最近搜索
                  </p>
                  <button onMouseDown={() => setRecentWords([])} className="text-[12px] text-[#9CA3AF] hover:text-[var(--party-primary)] transition-colors">清空</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentWords.map(word => (
                    <button
                      key={word}
                      onMouseDown={() => handleSelectWord(word)}
                      className="group flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-[#F7F8FA] text-[#4B5563] border border-[#E9E9E9] hover:bg-party-soft hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] transition-all"
                    >
                      {word}
                      <XIcon className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={e => { e.stopPropagation(); setRecentWords(p => p.filter(w => w !== word)); }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggest panel */}
            <div className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top ${showSuggestPanel ? "opacity-100 scale-y-100 pointer-events-auto" : "opacity-0 scale-y-95 pointer-events-none"}`}>
              <div className="py-1">
                {suggestions.map((word, idx) => {
                  const kw = searchValue.trim();
                  const parts = word.split(kw);
                  return (
                    <button key={idx} onMouseDown={() => handleSelectWord(word)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-party-soft transition-colors group">
                      <SearchIcon className="w-3.5 h-3.5 text-[#D1D5DB] group-hover:text-[var(--party-primary)] flex-shrink-0 transition-colors" />
                      <span className="text-base text-[#1A1A1A] flex-1 truncate">
                        {parts.map((part, i) => (
                          <span key={i}>{part}{i < parts.length - 1 && <span className="text-[var(--party-primary)] font-semibold">{kw}</span>}</span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* No result */}
            {searchResult && (
              <div className="mt-3 bg-white rounded-lg px-4 py-2.5 flex items-center gap-2.5 shadow-sm border border-red-100">
                <AlertCircleIcon className="w-4 h-4 text-[var(--party-primary)] flex-shrink-0" />
                <span className="text-base text-[#1A1A1A]">
                  <span className="text-[var(--party-primary)] font-medium">「{searchResult}」</span> — 暂无相关结果，请尝试其他关键词
                </span>
              </div>
            )}

            {/* Hot words */}
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <span className="text-white/75 text-sm mr-1">热门搜索：</span>
              {HOT_WORDS.map(word => (
                <button
                  key={word}
                  onClick={() => handleSelectWord(word)}
                  className={`text-sm px-3 py-1 rounded-full transition-all border ${
                    searchValue === word
                      ? "bg-[var(--party-accent)] text-white border-[var(--party-accent)]"
                      : "bg-white/20 text-white border-white/30 hover:bg-[var(--party-accent)] hover:text-white hover:border-[var(--party-accent)]"
                  }`}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Wave */}
        <div className="h-8 bg-[#F7F8FA]" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0", marginTop: "-1px" }} />
      </section>

      {/* ════ MAIN CONTENT ════ */}
      <main className="flex-1">
        <div className="max-w-[1280px] mx-auto px-6 pb-12">
          {/* Quick access */}
          <div className="mt-6">
            <QuickAccessBar />
          </div>

          {/* Two-column: Navigation + Rankings (在 lg 以下自动换行为纵向叠放) */}
          <div className="flex flex-col lg:flex-row gap-5 items-stretch lg:items-start">
            {/* Left: Navigation directory */}
            <div className="flex-1 min-w-0 w-full">
              <NavigationDirectory />
            </div>
            {/* Right: Rankings + 热点问答(知识库 FAQ 点击热度;无数据自动隐藏) */}
            <div className="w-full lg:w-72 xl:w-80 lg:flex-shrink-0 flex flex-col gap-4">
              <RankingSidebar />
              <HotFaqCard />
            </div>
          </div>

          <Separator className="bg-[#E9E9E9] mt-6" />

          {/* Hot Tasks */}
          <HotTasksSection />

          <Separator className="bg-[#E9E9E9]" />

          {/* News */}
          <NewsSection />
        </div>
      </main>

      {/* ════ FOOTER ════ */}
      <footer className="party-footer-bg">
        <div className="max-w-[1280px] mx-auto px-6 py-8">
          <div className="mb-5">
            <p className="text-white/75 text-sm mb-3 tracking-wide">友情链接</p>
            <div className="flex flex-wrap gap-2">
              {footer.friendLinks.map((link, idx) => (
                <a
                  key={`${link.label}-${idx}`}
                  href={link.url || "#"}
                  target={link.url && link.url !== "#" ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  onClick={e => { if (!link.url || link.url === "#") e.preventDefault(); }}
                  className="text-sm text-white/70 transition-colors border border-white/20 px-3 py-1 rounded-full"
                  style={{
                    transitionProperty: "color, border-color",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = "var(--party-accent)";
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--party-accent)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = "";
                    (e.currentTarget as HTMLElement).style.borderColor = "";
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <Separator className="bg-white/10 mb-5" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--party-accent)" }}>
                <StarIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-white font-semibold text-base">{brand.title}</span>
            </div>
            <p className="text-white/75 text-sm text-center">{footer.copyright}</p>
            <p className="text-white/60 text-sm">{footer.icp}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
