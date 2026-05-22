import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  SearchIcon, UserIcon, BookOpenIcon, FileTextIcon, CreditCardIcon,
  UsersIcon, AwardIcon, CalendarIcon, BarChart2Icon, MapPinIcon,
  BellIcon, ClipboardListIcon, StarIcon, GlobeIcon, ChevronRightIcon,
  TrendingUpIcon, CrownIcon, ScaleIcon, WrenchIcon, GraduationCapIcon,
  ScrollTextIcon, SettingsIcon, VideoIcon, BookMarkedIcon,
  ClipboardCheckIcon, MonitorIcon, DatabaseIcon, PlayCircleIcon,
  LibraryIcon, AlertCircleIcon, BuildingIcon, LayoutDashboardIcon,
  ClockIcon, XIcon, MegaphoneIcon, ShieldIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/* ─── Helper ─── */
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function progressGrad(rank: number): string {
  if (rank <= 3) return `linear-gradient(to right, #F5A623, #E8700A)`;
  if (rank <= 6) return `linear-gradient(to right, #C8001E, #FF6B6B)`;
  return `linear-gradient(to right, #9CA3AF, #D1D5DB)`;
}

/* ─── Types ─── */
interface NavItem {
  id: number;
  icon: React.ElementType;
  label: string;
  color: string;
  common: boolean;
  likes: number;
  views: number;
  desc: string;
}
interface NavCategory {
  id: string;
  label: string;
  color: string;
  bgLight: string;
  icon: React.ElementType;
  items: NavItem[];
}

/* ─── Navigation Data ─── */
const NAV_CATEGORIES: NavCategory[] = [
  {
    id: "party-affairs",
    label: "党务办理",
    color: "rgb(200, 0, 30)",
    bgLight: "rgb(255, 245, 245)",
    icon: ClipboardListIcon,
    items: [
      { id: 1, icon: CreditCardIcon, label: "党费缴纳", color: "rgb(200, 0, 30)", common: true, likes: 234, views: 1820, desc: "在线完成党费缴纳登记，支持历史查询" },
      { id: 2, icon: UsersIcon, label: "组织关系", color: "rgb(200, 0, 30)", common: true, likes: 187, views: 1430, desc: "党员组织关系转接、介绍信开具" },
      { id: 3, icon: CalendarIcon, label: "活动报名", color: "rgb(200, 0, 30)", common: false, likes: 95, views: 762, desc: "查看近期党内活动并完成在线报名" },
      { id: 4, icon: BellIcon, label: "通知公告", color: "rgb(200, 0, 30)", common: true, likes: 312, views: 2546, desc: "查阅党委最新通知、公告与文件" },
    ],
  },
  {
    id: "learning",
    label: "学习资源",
    color: "rgb(232, 112, 10)",
    bgLight: "rgb(255, 246, 237)",
    icon: BookOpenIcon,
    items: [
      { id: 5, icon: BookOpenIcon, label: "党章学习", color: "rgb(232, 112, 10)", common: true, likes: 408, views: 3210, desc: "在线阅读党章全文，支持逐章标注" },
      { id: 6, icon: StarIcon, label: "学习强国", color: "rgb(232, 112, 10)", common: false, likes: 276, views: 2088, desc: "跳转学习强国平台，完成每日积分" },
      { id: 7, icon: ScrollTextIcon, label: "经典文献", color: "rgb(232, 112, 10)", common: false, likes: 143, views: 986, desc: "系统阅读马列经典文献与历史文件" },
      { id: 8, icon: GlobeIcon, label: "红色网站", color: "rgb(232, 112, 10)", common: false, likes: 68, views: 540, desc: "精选推荐权威红色学习资源网站" },
    ],
  },
  {
    id: "statistics",
    label: "统计管理",
    color: "rgb(26, 107, 200)",
    bgLight: "rgb(238, 244, 255)",
    icon: BarChart2Icon,
    items: [
      { id: 9, icon: FileTextIcon, label: "党务公开", color: "rgb(26, 107, 200)", common: false, likes: 119, views: 930, desc: "查阅本单位党务公开信息与公示" },
      { id: 10, icon: AwardIcon, label: "积分管理", color: "rgb(26, 107, 200)", common: false, likes: 88, views: 674, desc: "查询个人党建积分明细与兑换" },
      { id: 11, icon: BarChart2Icon, label: "党建统计", color: "rgb(26, 107, 200)", common: false, likes: 201, views: 1576, desc: "生成党支部组织数据统计报表" },
      { id: 12, icon: MapPinIcon, label: "支部地图", color: "rgb(26, 107, 200)", common: false, likes: 54, views: 412, desc: "查看各党支部地理分布信息" },
    ],
  },
  {
    id: "rules",
    label: "条例制度",
    color: "rgb(139, 0, 200)",
    bgLight: "rgb(247, 238, 255)",
    icon: ScaleIcon,
    items: [
      { id: 13, icon: ScrollTextIcon, label: "党章全文", color: "rgb(139, 0, 200)", common: true, likes: 312, views: 4560, desc: "中国共产党章程全文在线阅读" },
      { id: 14, icon: ScaleIcon, label: "党纪条例", color: "rgb(139, 0, 200)", common: false, likes: 176, views: 2310, desc: "中国共产党纪律处分条例查询" },
      { id: 15, icon: ClipboardCheckIcon, label: "廉洁准则", color: "rgb(139, 0, 200)", common: false, likes: 98, views: 1480, desc: "中国共产党廉洁自律准则" },
      { id: 16, icon: BookMarkedIcon, label: "党规汇编", color: "rgb(139, 0, 200)", common: false, likes: 65, views: 890, desc: "党内法规规章制度汇编查询" },
    ],
  },
  {
    id: "tools",
    label: "工具软件",
    color: "rgb(0, 120, 180)",
    bgLight: "rgb(235, 248, 255)",
    icon: WrenchIcon,
    items: [
      { id: 17, icon: MonitorIcon, label: "党建平台", color: "rgb(0, 120, 180)", common: true, likes: 407, views: 6820, desc: "综合党建信息化管理平台入口" },
      { id: 18, icon: DatabaseIcon, label: "档案系统", color: "rgb(0, 120, 180)", common: false, likes: 253, views: 4130, desc: "党员档案数字化管理系统" },
      { id: 19, icon: SettingsIcon, label: "党务管理", color: "rgb(0, 120, 180)", common: false, likes: 134, views: 2200, desc: "党务工作流程化管理工具" },
      { id: 20, icon: BarChart2Icon, label: "统计报表", color: "rgb(0, 120, 180)", common: false, likes: 87, views: 1350, desc: "一键生成各类党建统计报表" },
    ],
  },
  {
    id: "tutorials",
    label: "党建教程",
    color: "rgb(45, 160, 88)",
    bgLight: "rgb(237, 250, 243)",
    icon: GraduationCapIcon,
    items: [
      { id: 21, icon: VideoIcon, label: "视频课程", color: "rgb(45, 160, 88)", common: false, likes: 228, views: 3870, desc: "党建工作专题视频培训课程" },
      { id: 22, icon: PlayCircleIcon, label: "学习专栏", color: "rgb(45, 160, 88)", common: false, likes: 155, views: 2640, desc: "系列化党建学习专题专栏" },
      { id: 23, icon: LibraryIcon, label: "知识库", color: "rgb(45, 160, 88)", common: false, likes: 76, views: 1180, desc: "党建工作知识库与问答中心" },
      { id: 24, icon: BookOpenIcon, label: "操作手册", color: "rgb(45, 160, 88)", common: false, likes: 42, views: 720, desc: "各类党务工作操作指南手册" },
    ],
  },
];

const COMMON_ITEMS = NAV_CATEGORIES.flatMap(c => c.items.filter(i => i.common));

/* ─── Rankings ─── */
const RANKING_LIST = [
  { rank: 1, name: `第一党支部·机关综合处`, score: 98.6 },
  { rank: 2, name: `第二党支部·财务审计处`, score: 96.2 },
  { rank: 3, name: `第三党支部·人力资源处`, score: 94.8 },
  { rank: 4, name: `第四党支部·业务发展部`, score: 93.1 },
  { rank: 5, name: `第五党支部·信息技术中心`, score: 91.7 },
  { rank: 6, name: `第六党支部·市场运营部`, score: 90.4 },
  { rank: 7, name: `第七党支部·法律合规处`, score: 89.0 },
  { rank: 8, name: `第八党支部·后勤保障处`, score: 87.5 },
  { rank: 9, name: `第九党支部·安全管理处`, score: 86.3 },
  { rank: 10, name: `第十党支部·宣传文化处`, score: 85.1 },
];

const STATS = [
  { label: `党支部总数`, value: `10`, unit: `个`, icon: BuildingIcon },
  { label: `本月平均分`, value: `90.2`, unit: `分`, icon: LayoutDashboardIcon },
  { label: `最高得分`, value: `98.6`, unit: `分`, icon: CrownIcon },
];

/* ─── Hot Tasks ─── */
const HOT_TASKS = [
  { id: 1, icon: BookOpenIcon, color: "rgb(200, 0, 30)", bg: "rgb(255, 240, 240)", title: `主题教育学习`, tag: `进行中`, tagColor: `bg-red-100 text-red-700`, date: `2025-06` },
  { id: 2, icon: ClipboardListIcon, color: "rgb(232, 112, 10)", bg: "rgb(255, 246, 237)", title: `年度党员民主评议`, tag: `待完成`, tagColor: `bg-orange-100 text-orange-700`, date: `2025-07` },
  { id: 3, icon: FileTextIcon, color: "rgb(26, 107, 200)", bg: "rgb(238, 244, 255)", title: `党费收缴统计上报`, tag: `本月截止`, tagColor: `bg-blue-100 text-blue-700`, date: `2025-06-30` },
  { id: 4, icon: UsersIcon, color: "rgb(45, 160, 88)", bg: "rgb(237, 250, 243)", title: `发展党员工作`, tag: `常态化`, tagColor: `bg-green-100 text-green-700`, date: `全年` },
  { id: 5, icon: MegaphoneIcon, color: "rgb(139, 0, 200)", bg: "rgb(247, 238, 255)", title: `党建宣传阵地建设`, tag: `重点工作`, tagColor: `bg-purple-100 text-purple-700`, date: `2025-Q3` },
  { id: 6, icon: ShieldIcon, color: "rgb(200, 0, 30)", bg: "rgb(255, 240, 240)", title: `廉政风险防控排查`, tag: `专项行动`, tagColor: `bg-red-100 text-red-700`, date: `2025-Q2` },
];

/* ─── Search ─── */
const HOT_WORDS = [`党章学习`, `两学一做`, `主题教育`, `党费缴纳`, `廉洁自律`, `组织生活`];
const SUGGEST_POOL = [
  `党章学习资料`, `党章全文下载`, `党章考试题库`, `两学一做学习教育`, `主题教育学习安排`,
  `主题教育心得体会`, `党费缴纳标准`, `党费缴纳流程`, `廉洁自律准则`, `廉洁风险排查`,
  `组织生活会记录`, `组织关系转移`, `党员发展流程`, `党员民主评议`, `党建统计报表`,
  `党支部工作计划`, `入党申请书模板`, `学习强国积分`, `党务公开内容`,
];
const FRIEND_LINKS = [`中央党校网`, `求是网`, `人民网党建频道`, `中国共产党新闻网`, `共产党员网`, `学习强国`];
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
function NavItemCard({ item, showDesc = false }: { item: NavItem; showDesc?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  return (
    <div
      className="bg-white rounded-xl border cursor-pointer transition-all duration-200 flex items-center gap-3 px-4 py-3.5"
      style={{
        borderColor: hovered ? item.color : "#E9E9E9",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? `0 6px 20px ${item.color}25` : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log("[党建益友] Nav clicked:", item.label)}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200"
        style={{ backgroundColor: hovered ? `${item.color}22` : `${item.color}14` }}
      >
        <IconComp className="w-5 h-5" style={{ color: item.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-[#1A1A1A]">{item.label}</span>
          {item.common && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 font-bold">常用</span>
          )}
        </div>
        {showDesc && <p className="text-xs text-[#9CA3AF] mt-0.5 truncate">{item.desc}</p>}
        {!showDesc && <span className="text-[10px] text-[#C0C6D0]">👁 {fmt(item.views)}</span>}
      </div>
      <ChevronRightIcon
        className="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200"
        style={{ color: hovered ? item.color : "#D1D5DB" }}
      />
    </div>
  );
}

/* ─── 快捷入口 strip ─── */
function QuickAccessBar() {
  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] px-5 py-4 mb-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-[#6B7280] flex-shrink-0 flex items-center gap-1">
          <StarIcon className="w-3.5 h-3.5 text-[#F5A623]" />
          常用快捷
        </span>
        <div className="w-px h-4 bg-[#E9E9E9]" />
        <div className="flex flex-wrap gap-2">
          {COMMON_ITEMS.map(item => {
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  borderColor: `${item.color}40`,
                  color: item.color,
                  backgroundColor: `${item.color}08`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = `${item.color}18`;
                  (e.currentTarget as HTMLElement).style.borderColor = item.color;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = `${item.color}08`;
                  (e.currentTarget as HTMLElement).style.borderColor = `${item.color}40`;
                }}
                onClick={() => console.log("[党建益友] Quick:", item.label)}
              >
                <IconComp className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── 全部导航目录 ─── */
function NavigationDirectory() {
  const [activeId, setActiveId] = useState("all");
  const displayCategories = activeId === "all" ? NAV_CATEGORIES : NAV_CATEGORIES.filter(c => c.id === activeId);
  const activeColor = activeId === "all" ? "rgb(200, 0, 30)" : (NAV_CATEGORIES.find(c => c.id === activeId)?.color ?? "rgb(200, 0, 30)");

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E9E9E9]">
        <h2 className="party-section-title text-base font-bold text-[#1A1A1A]">全部导航</h2>
        <span className="text-xs text-[#9CA3AF]">{NAV_CATEGORIES.length} 分类 · 共 {NAV_CATEGORIES.reduce((a, c) => a + c.items.length, 0)} 项</span>
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-[#E9E9E9] overflow-x-auto scrollbar-none">
        {/* 全部 tab */}
        <button
          onClick={() => setActiveId("all")}
          className="flex-shrink-0 px-5 py-3 text-sm font-semibold transition-all border-b-2"
          style={{
            borderBottomColor: activeId === "all" ? "rgb(200, 0, 30)" : "transparent",
            color: activeId === "all" ? "rgb(200, 0, 30)" : "#6B7280",
            backgroundColor: activeId === "all" ? "rgb(255, 248, 248)" : "transparent",
          }}
        >
          全部
        </button>
        {NAV_CATEGORIES.map(cat => {
          const CatIcon = cat.icon;
          const isActive = activeId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveId(cat.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-all border-b-2"
              style={{
                borderBottomColor: isActive ? cat.color : "transparent",
                color: isActive ? cat.color : "#6B7280",
                backgroundColor: isActive ? `${cat.color}08` : "transparent",
              }}
            >
              <CatIcon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Items */}
      <div className="p-5">
        {displayCategories.map((cat, idx) => {
          const CatIcon = cat.icon;
          return (
            <div key={cat.id} className={idx > 0 ? "mt-6" : ""}>
              {activeId === "all" && (
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    <CatIcon className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-bold" style={{ color: cat.color }}>{cat.label}</span>
                  <div className="flex-1 h-px bg-[#F0F0F0]" />
                  <span className="text-[10px] text-[#C0C6D0]">{cat.items.length} 项</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                {cat.items.map(item => (
                  <NavItemCard key={item.id} item={item} showDesc={activeId !== "all"} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 排行榜侧边栏 ─── */
function RankingSidebar() {
  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-[#E9E9E9] p-4">
        <h3 className="party-section-title text-sm font-bold text-[#1A1A1A] mb-3">本期概览</h3>
        <div className="grid grid-cols-3 gap-2">
          {STATS.map(stat => {
            const SI = stat.icon;
            return (
              <div key={stat.label} className="flex flex-col items-center bg-red-50 rounded-xl p-3">
                <SI className="w-4 h-4 text-[#C8001E] mb-1" />
                <span className="text-lg font-extrabold text-[#C8001E] leading-tight">
                  {stat.value}<span className="text-[10px] text-[#9CA3AF] font-normal ml-0.5">{stat.unit}</span>
                </span>
                <span className="text-[10px] text-[#9CA3AF] mt-0.5 text-center leading-tight">{stat.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rankings */}
      <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E9E9E9]">
          <h3 className="party-section-title text-sm font-bold text-[#1A1A1A]">党建考核排行榜</h3>
          <a href="#" onClick={e => e.preventDefault()} className="text-xs text-[#C8001E] flex items-center gap-0.5 hover:opacity-70">
            全部 <ChevronRightIcon className="w-3 h-3" />
          </a>
        </div>

        {/* Top 3 */}
        <div className="p-3 flex flex-col gap-2">
          {RANKING_LIST.slice(0, 3).map(item => {
            const medals = [
              { bg: "linear-gradient(135deg, #F5A623, #E8700A)", text: "#E8700A", border: "#F5A623" },
              { bg: "linear-gradient(135deg, #C0C0C0, #A8A8A8)", text: "#888", border: "#C0C0C0" },
              { bg: "linear-gradient(135deg, #CD7F32, #A0522D)", text: "#A0522D", border: "#CD7F32" },
            ];
            const m = medals[item.rank - 1];
            return (
              <div
                key={item.rank}
                className="flex items-center gap-2.5 bg-[#FAFAFA] rounded-xl px-3 py-2.5 border hover:-translate-y-0.5 transition-transform duration-200"
                style={{ borderColor: `${m.border}40` }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm"
                  style={{ background: m.bg }}
                >
                  {item.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1A1A1A] truncate">{item.name}</p>
                </div>
                <span className="text-sm font-extrabold flex-shrink-0" style={{ color: m.text }}>
                  {item.score}<span className="text-[9px] font-normal text-[#9CA3AF] ml-0.5">分</span>
                </span>
                {item.rank === 1 && <CrownIcon className="w-3.5 h-3.5 text-[#F5A623] flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* 4–10 list */}
        <div className="border-t border-[#F0F0F0]">
          {RANKING_LIST.slice(3).map((item, idx) => (
            <div
              key={item.rank}
              className={`flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#FFF8F8] transition-colors ${
                idx < 6 ? "border-b border-[#F5F5F5]" : ""
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[10px] font-bold text-[#6B7280] flex-shrink-0">
                {item.rank}
              </div>
              <span className="text-xs text-[#1A1A1A] flex-1 min-w-0 truncate">{item.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-14 h-1 rounded-full bg-[#F0F0F0] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${((item.score - 80) / 20) * 100}%`, background: progressGrad(item.rank) }}
                  />
                </div>
                <span className="text-xs font-bold text-[#C8001E] w-10 text-right">{item.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 热点任务 ─── */
function HotTasksSection() {
  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-5">
        <h2 className="party-section-title text-lg font-bold text-[#1A1A1A]">热点任务</h2>
        <a href="#" onClick={e => e.preventDefault()} className="text-sm text-[#C8001E] flex items-center gap-1 hover:opacity-70">
          查看全部 <ChevronRightIcon className="w-4 h-4" />
        </a>
      </div>
      <div className="grid grid-cols-3 gap-4 xl:grid-cols-6">
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
              <p className="text-sm font-semibold text-[#1A1A1A] mb-2 line-clamp-2 leading-snug">{task.title}</p>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${task.tagColor}`}>{task.tag}</span>
                <span className="text-[10px] text-[#9CA3AF]">{task.date}</span>
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
        <h2 className="party-section-title text-lg font-bold text-[#1A1A1A]">党建资讯</h2>
        <a href="#" onClick={e => e.preventDefault()} className="text-sm text-[#C8001E] flex items-center gap-1 hover:opacity-70">
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
            style={{ background: "linear-gradient(135deg, rgb(200,0,30) 0%, rgb(139,0,0) 60%, rgb(100,0,0) 100%)" }}
          >
            <div>
              <Badge className="mb-2 text-[10px]" style={{ backgroundColor: "#F5A623", color: "white", border: "none" }}>
                重要精神
              </Badge>
              <h3 className="text-white font-bold text-sm leading-snug">
                深入学习贯彻党的二十大精神<br />推动党建工作高质量发展
              </h3>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center justify-between border border-t-0 border-[#E9E9E9] rounded-b-xl">
            <span className="text-xs text-[#6B7280]">2025-06-15 · 党务工作部</span>
            <div className="flex items-center gap-1 text-xs text-[#C8001E]">
              <TrendingUpIcon className="w-3.5 h-3.5" /> 热点
            </div>
          </div>
        </div>

        {/* News list */}
        <div className="bg-white rounded-xl border border-[#E9E9E9] p-4 flex flex-col gap-0" style={{ flex: "2 1 360px" }}>
          {NEWS_LIST.map((news, idx) => (
            <div key={idx}>
              <div
                className="flex items-center justify-between py-3 cursor-pointer group hover:text-[#C8001E] transition-colors"
                onClick={() => console.log("[党建益友] News:", news.title)}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#C8001E]" />
                  <span className="text-sm text-[#1A1A1A] group-hover:text-[#C8001E] transition-colors truncate">{news.title}</span>
                  {news.hot && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">HOT</span>
                  )}
                </div>
                <span className="text-xs text-[#9CA3AF] flex-shrink-0 ml-4">{news.date}</span>
              </div>
              {idx < NEWS_LIST.length - 1 && <Separator className="bg-[#F5F5F5]" />}
            </div>
          ))}
          <div className="pt-3 mt-1 border-t border-[#F5F5F5]">
            <button className="w-full text-xs text-[#C8001E] hover:opacity-70 transition-opacity flex items-center justify-center gap-1 py-1">
              查看更多资讯 <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </section>
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E9E9E9] shadow-sm">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#C8001E] flex-shrink-0">
              <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                <polygon points="20,5 23.5,15 34,15 25.5,21.5 28.5,32 20,26 11.5,32 14.5,21.5 6,15 16.5,15" fill="#F5A623" />
                <path d="M15,22 Q16,18 20,17 Q18,22 18,26 Z" fill="white" opacity="0.85" />
                <rect x="19" y="16" width="2" height="8" rx="1" fill="white" opacity="0.85" transform="rotate(30 20 20)" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold text-[#C8001E] tracking-wide">党建益友</span>
              <span className="text-[10px] text-[#6B7280] tracking-widest">PARTY BUILDING DIGITAL PORTAL</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 mr-4">
            {[`首页`, `党务公开`, `学习园地`, `通知公告`, `联系我们`].map(item => (
              <a key={item} href="#" onClick={e => e.preventDefault()}
                className="text-sm text-[#1A1A1A] hover:text-[#C8001E] transition-colors font-medium">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-[#4B5563] hover:text-[#C8001E] hover:bg-[#FFF0F2] transition-colors"
              title="管理后台"
            >
              <SettingsIcon className="w-4 h-4" />
              管理后台
            </Link>
            <button
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: "rgb(200, 0, 30)" }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "#A80018")}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgb(200, 0, 30)")}
            >
              <UserIcon className="w-4 h-4" />
              登录 / 注册
            </button>
          </div>
        </div>
      </header>

      {/* ════ HERO SEARCH ════ */}
      <section className="party-hero-bg pt-16">
        <div className="max-w-[1280px] mx-auto px-6 py-12 flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-12 bg-[#F5A623] opacity-60" />
            <span className="text-[#F5A623] text-xs tracking-[0.3em] font-medium uppercase">Party Building Digital Portal</span>
            <div className="h-px w-12 bg-[#F5A623] opacity-60" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight">不忘初心，牢记使命</h1>
          <p className="text-red-200 text-sm mb-8 tracking-wide">凝聚党员力量 · 服务党务工作 · 推进党建高质量发展</p>

          {/* Search box */}
          <div className="w-full max-w-xl relative" ref={searchWrapRef}>
            <div className={`flex bg-white rounded-xl overflow-hidden shadow-xl transition-all duration-200 ${searchFocused ? "ring-2 ring-[#F5A623]/40" : ""}`}>
              <Input
                value={searchValue}
                onChange={handleInputChange}
                onFocus={() => { setSearchFocused(true); setPanelOpen(true); }}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSearch();
                  if (e.key === "Escape") { setPanelOpen(false); setSearchFocused(false); }
                }}
                placeholder="请输入党建相关关键词，如：党章、党费、廉洁..."
                className="flex-1 border-0 focus-visible:ring-0 text-sm h-12 px-4 text-[#1A1A1A] placeholder:text-[#9CA3AF] rounded-none"
              />
              <button
                onClick={handleSearch}
                className="px-6 h-12 text-white font-semibold text-sm flex items-center gap-2 flex-shrink-0 transition-colors"
                style={{ backgroundColor: searchFocused ? "#A80018" : "rgb(200, 0, 30)" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = "#A80018")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = searchFocused ? "#A80018" : "rgb(200, 0, 30)")}
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
                  <button onMouseDown={() => setRecentWords([])} className="text-[10px] text-[#9CA3AF] hover:text-[#C8001E] transition-colors">清空</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentWords.map(word => (
                    <button
                      key={word}
                      onMouseDown={() => handleSelectWord(word)}
                      className="group flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-[#F7F8FA] text-[#4B5563] border border-[#E9E9E9] hover:bg-[#FFF0F2] hover:border-[#F5A0A8] hover:text-[#C8001E] transition-all"
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FFF5F5] transition-colors group">
                      <SearchIcon className="w-3.5 h-3.5 text-[#D1D5DB] group-hover:text-[#C8001E] flex-shrink-0 transition-colors" />
                      <span className="text-sm text-[#1A1A1A] flex-1 truncate">
                        {parts.map((part, i) => (
                          <span key={i}>{part}{i < parts.length - 1 && <span className="text-[#C8001E] font-semibold">{kw}</span>}</span>
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
                <AlertCircleIcon className="w-4 h-4 text-[#C8001E] flex-shrink-0" />
                <span className="text-sm text-[#1A1A1A]">
                  <span className="text-[#C8001E] font-medium">「{searchResult}」</span> — 暂无相关结果，请尝试其他关键词
                </span>
              </div>
            )}

            {/* Hot words */}
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <span className="text-red-200 text-xs mr-1">热门搜索：</span>
              {HOT_WORDS.map(word => (
                <button
                  key={word}
                  onClick={() => handleSelectWord(word)}
                  className={`text-xs px-3 py-1 rounded-full transition-all border ${
                    searchValue === word
                      ? "bg-[#F5A623] text-white border-[#F5A623]"
                      : "bg-white/20 text-white border-white/30 hover:bg-[#F5A623] hover:text-white hover:border-[#F5A623]"
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

          {/* Two-column: Navigation + Rankings */}
          <div className="flex gap-5 items-start">
            {/* Left: Navigation directory */}
            <div className="flex-[3] min-w-0">
              <NavigationDirectory />
            </div>
            {/* Right: Rankings sidebar */}
            <div className="w-72 flex-shrink-0 xl:w-80">
              <RankingSidebar />
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
            <p className="text-red-200 text-xs mb-3 tracking-wide">友情链接</p>
            <div className="flex flex-wrap gap-2">
              {FRIEND_LINKS.map(link => (
                <a key={link} href="#" onClick={e => e.preventDefault()}
                  className="text-xs text-white/70 hover:text-[#F5A623] transition-colors border border-white/20 px-3 py-1 rounded-full hover:border-[#F5A623]">
                  {link}
                </a>
              ))}
            </div>
          </div>
          <Separator className="bg-white/10 mb-5" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#F5A623] flex items-center justify-center">
                <StarIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-white font-semibold text-sm">党建益友</span>
            </div>
            <p className="text-red-200 text-xs text-center">
              © 2025 党建益友门户 · 服务于党员与党务工作者 · 弘扬党建文化 · 凝聚奋进力量
            </p>
            <p className="text-red-300 text-xs">京ICP备XXXXXXXX号</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
