import { useState, useRef, useEffect } from "react";
import {
  SearchIcon,
  UserIcon,
  BookOpenIcon,
  FileTextIcon,
  CreditCardIcon,
  UsersIcon,
  MegaphoneIcon,
  ShieldIcon,
  AwardIcon,
  CalendarIcon,
  BarChart2Icon,
  MapPinIcon,
  BellIcon,
  ClipboardListIcon,
  StarIcon,
  GlobeIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  BookmarkIcon,
  CrownIcon,
  ScaleIcon,
  WrenchIcon,
  GraduationCapIcon,
  ScrollTextIcon,
  SettingsIcon,
  VideoIcon,
  BookMarkedIcon,
  ClipboardCheckIcon,
  MonitorIcon,
  DatabaseIcon,
  PlayCircleIcon,
  LibraryIcon,
  AlertCircleIcon,
  BuildingIcon,
  LayoutDashboardIcon,
  ClockIcon,
  XIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/* ─── Mock Data ─── */
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

const HOT_TASKS = [
  {
    id: 1,
    icon: BookOpenIcon,
    color: "rgb(200, 0, 30)",
    bg: "rgb(255, 240, 240)",
    title: `主题教育学习`,
    desc: `深入学习贯彻习近平新时代中国特色社会主义思想，推进理论武装走深走实`,
    tag: `进行中`,
    tagColor: `bg-red-100 text-red-700`,
    date: `2025-06`,
  },
  {
    id: 2,
    icon: ClipboardListIcon,
    color: "rgb(232, 112, 10)",
    bg: "rgb(255, 246, 237)",
    title: `年度党员民主评议`,
    desc: `开展党员民主评议工作，对照标准逐项对照检查，确保评议质量`,
    tag: `待完成`,
    tagColor: `bg-orange-100 text-orange-700`,
    date: `2025-07`,
  },
  {
    id: 3,
    icon: FileTextIcon,
    color: "rgb(26, 107, 200)",
    bg: "rgb(238, 244, 255)",
    title: `党费收缴统计上报`,
    desc: `完成季度党费收缴情况统计，按时向上级党委汇报缴纳数据`,
    tag: `本月截止`,
    tagColor: `bg-blue-100 text-blue-700`,
    date: `2025-06-30`,
  },
  {
    id: 4,
    icon: UsersIcon,
    color: "rgb(45, 160, 88)",
    bg: "rgb(237, 250, 243)",
    title: `发展党员工作`,
    desc: `规范开展入党积极分子培训考察，严格落实发展党员工作程序`,
    tag: `常态化`,
    tagColor: `bg-green-100 text-green-700`,
    date: `全年`,
  },
  {
    id: 5,
    icon: MegaphoneIcon,
    color: "rgb(139, 0, 200)",
    bg: "rgb(247, 238, 255)",
    title: `党建宣传阵地建设`,
    desc: `加强党建文化阵地建设，打造特色党建品牌，提升组织凝聚力`,
    tag: `重点工作`,
    tagColor: `bg-purple-100 text-purple-700`,
    date: `2025-Q3`,
  },
  {
    id: 6,
    icon: ShieldIcon,
    color: "rgb(200, 0, 30)",
    bg: "rgb(255, 240, 240)",
    title: `廉政风险防控排查`,
    desc: `开展廉洁自律专项检查，建立廉政风险排查台账，筑牢党风廉政防线`,
    tag: `专项行动`,
    tagColor: `bg-red-100 text-red-700`,
    date: `2025-Q2`,
  },
];

/* ─── 底部全部导航分组数据 ─── */
const QUICK_NAV_GROUPS = [
  {
    groupLabel: `党务办理`,
    groupColor: `rgb(200, 0, 30)`,
    groupBorderColor: `rgba(200, 0, 30, 0.6)`,
    hoverBorderColor: `#C8001E`,
    hoverShadow: `0 8px 24px rgba(200,0,30,0.15)`,
    items: [
      { id: 1, icon: CreditCardIcon, label: `党费缴纳`, color: `rgb(200, 0, 30)`, common: true, likes: 234, views: 1820 },
      { id: 2, icon: UsersIcon, label: `组织关系`, color: `rgb(200, 0, 30)`, common: true, likes: 187, views: 1430 },
      { id: 3, icon: CalendarIcon, label: `活动报名`, color: `rgb(200, 0, 30)`, common: false, likes: 95, views: 762 },
      { id: 4, icon: BellIcon, label: `通知公告`, color: `rgb(200, 0, 30)`, common: true, likes: 312, views: 2546 },
    ],
  },
  {
    groupLabel: `学习资源`,
    groupColor: `rgb(232, 112, 10)`,
    groupBorderColor: `rgba(232, 112, 10, 0.6)`,
    hoverBorderColor: `#E8700A`,
    hoverShadow: `0 8px 24px rgba(245,166,35,0.15)`,
    items: [
      { id: 5, icon: BookOpenIcon, label: `党章学习`, color: `rgb(232, 112, 10)`, common: true, likes: 408, views: 3210 },
      { id: 6, icon: StarIcon, label: `学习强国`, color: `rgb(232, 112, 10)`, common: false, likes: 276, views: 2088 },
      { id: 7, icon: ScrollTextIcon, label: `经典文献`, color: `rgb(232, 112, 10)`, common: false, likes: 143, views: 986 },
      { id: 8, icon: GlobeIcon, label: `红色网站`, color: `rgb(232, 112, 10)`, common: false, likes: 68, views: 540 },
    ],
  },
  {
    groupLabel: `统计管理`,
    groupColor: `rgb(26, 107, 200)`,
    groupBorderColor: `rgba(26, 107, 200, 0.6)`,
    hoverBorderColor: `#1A6BC8`,
    hoverShadow: `0 8px 24px rgba(26,107,200,0.15)`,
    items: [
      { id: 9, icon: FileTextIcon, label: `党务公开`, color: `rgb(26, 107, 200)`, common: false, likes: 119, views: 930 },
      { id: 10, icon: AwardIcon, label: `积分管理`, color: `rgb(26, 107, 200)`, common: false, likes: 88, views: 674 },
      { id: 11, icon: BarChart2Icon, label: `党建统计`, color: `rgb(26, 107, 200)`, common: false, likes: 201, views: 1576 },
      { id: 12, icon: MapPinIcon, label: `党支部地图`, color: `rgb(26, 107, 200)`, common: false, likes: 54, views: 412 },
    ],
  },
];

/* ─── 右侧分类快捷导航 ─── */
const SIDE_NAV_CATEGORIES = [
  {
    id: "rules",
    label: "条例制度",
    color: "rgb(200, 0, 30)",
    bgLight: "rgb(255, 245, 245)",
    borderColor: "rgba(200, 0, 30, 0.2)",
    icon: ScaleIcon,
    isMostUsed: false,
    items: [
      { id: 1, icon: ScrollTextIcon, label: "党章全文", color: "rgb(200, 0, 30)", clicks: 1820, likes: 312, views: 4560 },
      { id: 2, icon: ScaleIcon, label: "党纪条例", color: "rgb(200, 0, 30)", clicks: 980, likes: 176, views: 2310 },
      { id: 3, icon: ClipboardCheckIcon, label: "廉洁准则", color: "rgb(200, 0, 30)", clicks: 640, likes: 98, views: 1480 },
      { id: 4, icon: BookMarkedIcon, label: "党规汇编", color: "rgb(200, 0, 30)", clicks: 430, likes: 65, views: 890 },
    ],
  },
  {
    id: "tools",
    label: "工具软件",
    color: "rgb(26, 107, 200)",
    bgLight: "rgb(245, 249, 255)",
    borderColor: "rgba(26, 107, 200, 0.2)",
    icon: WrenchIcon,
    isMostUsed: true,
    items: [
      { id: 5, icon: MonitorIcon, label: "党建平台", color: "rgb(26, 107, 200)", clicks: 2340, likes: 407, views: 6820 },
      { id: 6, icon: DatabaseIcon, label: "档案系统", color: "rgb(26, 107, 200)", clicks: 1560, likes: 253, views: 4130 },
      { id: 7, icon: SettingsIcon, label: "党务管理", color: "rgb(26, 107, 200)", clicks: 780, likes: 134, views: 2200 },
      { id: 8, icon: BarChart2Icon, label: "统计报表", color: "rgb(26, 107, 200)", clicks: 520, likes: 87, views: 1350 },
    ],
  },
  {
    id: "tutorial",
    label: "党建教程",
    color: "rgb(45, 160, 88)",
    bgLight: "rgb(245, 255, 250)",
    borderColor: "rgba(45, 160, 88, 0.2)",
    icon: GraduationCapIcon,
    isMostUsed: false,
    items: [
      { id: 9, icon: VideoIcon, label: "视频课程", color: "rgb(45, 160, 88)", clicks: 1290, likes: 228, views: 3870 },
      { id: 10, icon: PlayCircleIcon, label: "学习专栏", color: "rgb(45, 160, 88)", clicks: 870, likes: 155, views: 2640 },
      { id: 11, icon: LibraryIcon, label: "知识库", color: "rgb(45, 160, 88)", clicks: 450, likes: 76, views: 1180 },
      { id: 12, icon: BookOpenIcon, label: "操作手册", color: "rgb(45, 160, 88)", clicks: 310, likes: 42, views: 720 },
    ],
  },
];

const HOT_WORDS = [`党章学习`, `两学一做`, `主题教育`, `党费缴纳`, `廉洁自律`, `组织生活`];
const INITIAL_RECENT_WORDS = [`党章`, `廉洁`];

/* ─── 联想词库 ─── */
const SUGGEST_POOL = [
  `党章学习资料`,
  `党章全文下载`,
  `党章考试题库`,
  `两学一做学习教育`,
  `两学一做专题活动`,
  `主题教育学习安排`,
  `主题教育心得体会`,
  `主题教育工作总结`,
  `党费缴纳标准`,
  `党费缴纳流程`,
  `党费缴纳记录查询`,
  `廉洁自律准则`,
  `廉洁风险排查`,
  `廉洁教育活动`,
  `组织生活会记录`,
  `组织生活会主题`,
  `组织关系转移`,
  `组织关系介绍信`,
  `党员发展流程`,
  `党员民主评议`,
  `党员积分管理`,
  `党建统计报表`,
  `党建宣传阵地`,
  `党建品牌建设`,
  `党支部工作计划`,
  `党支部考核评分`,
  `入党申请书模板`,
  `入党积极分子培训`,
  `党务公开内容`,
  `学习强国积分`,
];

const FRIEND_LINKS = [
  `中央党校网`, `求是网`, `人民网党建频道`, `中国共产党新闻网`, `共产党员网`, `学习强国`,
];

/* ─── Stats Mock ─── */
const STATS = [
  { label: `党支部总数`, value: `10`, unit: `个`, icon: BuildingIcon },
  { label: `本月平均分`, value: `90.2`, unit: `分`, icon: LayoutDashboardIcon },
  { label: `最高分`, value: `98.6`, unit: `分`, icon: CrownIcon },
];

/* ─── 进度条渐变色工具函数 ─── */
function getProgressGradient(rank: number): string {
  if (rank <= 6) return `linear-gradient(to right, #F5A623, #E8700A)`;
  if (rank <= 8) return `linear-gradient(to right, #C8001E, #FF6B6B)`;
  return `linear-gradient(to right, #9CA3AF, #D1D5DB)`;
}

/* ─── 数值格式化 helper ─── */
function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/* ─── 底部导航 hover state ─── */
function NavCard({
  item,
  hoverBorderColor,
  hoverShadow,
}: {
  item: { id: number; icon: React.ElementType; label: string; color: string; common: boolean; likes: number; views: number };
  hoverBorderColor: string;
  hoverShadow: string;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  return (
    <div
      className="bg-white rounded-xl border border-[#E9E9E9] flex flex-col items-center justify-center py-5 px-3 cursor-pointer transition-all duration-200 relative"
      style={
        hovered
          ? { borderColor: hoverBorderColor, transform: `translateY(-4px)`, boxShadow: hoverShadow }
          : {}
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log(`[党建益友] Bottom nav clicked:`, item.label)}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2.5"
        style={{ backgroundColor: `${item.color}22` }}
      >
        <IconComp className="w-6 h-6" style={{ color: item.color }} />
      </div>
      <span className="text-xs font-medium text-[#1A1A1A] text-center leading-tight">{item.label}</span>
      {/* 底部行：常用角标（左）+ 微数据（右） */}
      <div className="mt-1.5 flex items-center justify-between w-full px-0.5">
        <div className={item.common ? `` : `invisible`}>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 font-medium">常用</span>
        </div>
        <span className="text-[9px] text-[#B0B7C3] leading-none">
          👍 {formatCount(item.likes)} · 👁 {formatCount(item.views)}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   方案 A · Tab 分类标签式
   ═══════════════════════════════════════════════ */
function SchemeA() {
  const [activeIdx, setActiveIdx] = useState(0);
  const group = QUICK_NAV_GROUPS[activeIdx];

  return (
    <div className="bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden">
      {/* Tab 栏 */}
      <div className="flex border-b border-[#E9E9E9]">
        {QUICK_NAV_GROUPS.map((g, i) => (
          <button
            key={g.groupLabel}
            onClick={() => setActiveIdx(i)}
            className="flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative"
            style={
              activeIdx === i
                ? { backgroundColor: g.groupColor, color: `white` }
                : { color: `#6B7280`, backgroundColor: `white` }
            }
          >
            {g.groupLabel}
            {/* 激活底部指示条 */}
            <span
              className="absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-200"
              style={{ backgroundColor: activeIdx === i ? `white` : `transparent` }}
            />
          </button>
        ))}
      </div>

      {/* 列表行 */}
      <div className="p-4 flex flex-col gap-1.5">
        {group.items.map((item) => {
          const IconComp = item.icon;
          return (
            <SchemeARow
              key={item.id}
              item={item}
              groupColor={group.groupColor}
              hoverShadow={group.hoverShadow}
            />
          );
        })}
      </div>
    </div>
  );
}

function SchemeARow({
  item,
  groupColor,
  hoverShadow,
}: {
  item: { id: number; icon: React.ElementType; label: string; color: string; common: boolean; likes: number; views: number };
  groupColor: string;
  hoverShadow: string;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 relative overflow-hidden"
      style={
        hovered
          ? { backgroundColor: `${groupColor}08`, boxShadow: hoverShadow }
          : { backgroundColor: `transparent` }
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log(`[党建益友] SchemeA clicked:`, item.label)}
    >
      {/* 左侧颜色竖条 */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-all duration-200"
        style={{ backgroundColor: hovered ? groupColor : `transparent` }}
      />
      {/* 图标块 */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${item.color}18` }}
      >
        <IconComp className="w-5 h-5" style={{ color: item.color }} />
      </div>
      {/* 中间文字 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1A1A1A]">{item.label}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 font-medium ${item.common ? `` : `invisible`}`}>常用</span>
        </div>
        <span className="text-[11px] text-[#B0B7C3]">👍 {formatCount(item.likes)} · 👁 {formatCount(item.views)}</span>
      </div>
      {/* 右侧箭头 */}
      <ChevronRightIcon
        className="w-4 h-4 flex-shrink-0 transition-all duration-200"
        style={{ color: hovered ? groupColor : `#D1D5DB` }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   方案 B · 彩色胶囊徽章式
   ═══════════════════════════════════════════════ */
function SchemeB() {
  return (
    <div className="flex flex-col gap-5">
      {QUICK_NAV_GROUPS.map((group, gIdx) => (
        <div key={group.groupLabel}>
          {/* 组标题 — 细分割线 */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-semibold tracking-wider" style={{ color: group.groupColor }}>
              {group.groupLabel}
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: `${group.groupColor}25` }} />
            <span className="text-[10px] text-[#B0B7C3]">{group.items.length} 项</span>
          </div>
          {/* 胶囊标签流式排列 */}
          <div className="flex flex-wrap gap-2.5">
            {group.items.map((item) => (
              <SchemeBCapsule key={item.id} item={item} groupColor={group.groupColor} />
            ))}
          </div>
          {gIdx < QUICK_NAV_GROUPS.length - 1 && (
            <div className="mt-5 border-b border-dashed border-[#E9E9E9]" />
          )}
        </div>
      ))}
    </div>
  );
}

function SchemeBCapsule({
  item,
  groupColor,
}: {
  item: { id: number; icon: React.ElementType; label: string; color: string; common: boolean; likes: number; views: number };
  groupColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  return (
    <div
      className="relative cursor-pointer transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log(`[党建益友] SchemeB clicked:`, item.label)}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all duration-200"
        style={{
          backgroundColor: hovered ? `${groupColor}20` : `${groupColor}0D`,
          borderColor: hovered ? `${groupColor}60` : `${groupColor}30`,
          transform: hovered ? `translateY(-2px)` : `none`,
        }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${groupColor}25` }}
        >
          <IconComp className="w-3.5 h-3.5" style={{ color: groupColor }} />
        </div>
        <span className="text-sm font-medium" style={{ color: `#1A1A1A` }}>{item.label}</span>
        <span className="text-[10px] text-[#B0B7C3]">
          {formatCount(item.views)}
        </span>
      </div>
      {/* 常用角标 */}
      <span
        className={`absolute -top-1.5 -right-1 text-[8px] px-1 py-0.5 rounded-full font-bold text-white leading-none ${item.common ? `` : `hidden`}`}
        style={{ backgroundColor: `#F5A623` }}
      >
        常用
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   方案 C · 图标宫格磁贴式
   ═══════════════════════════════════════════════ */
function SchemeC() {
  // 把3组12项全部平铺
  const allItems = QUICK_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupColor: group.groupColor, hoverShadow: group.hoverShadow }))
  );
  return (
    <div className="flex flex-wrap gap-3">
      {allItems.map((item) => (
        <SchemeCTile key={item.id} item={item} />
      ))}
    </div>
  );
}

function SchemeCTile({
  item,
}: {
  item: {
    id: number; icon: React.ElementType; label: string; color: string;
    common: boolean; likes: number; views: number; groupColor: string; hoverShadow: string;
  };
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  return (
    <div
      className="relative cursor-pointer rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center py-5 px-3 overflow-hidden"
      style={{
        flex: `1 1 calc(25% - 12px)`,
        minWidth: `150px`,
        background: hovered
          ? `linear-gradient(135deg, ${item.groupColor}25 0%, ${item.groupColor}40 100%)`
          : `linear-gradient(135deg, ${item.groupColor}08 0%, ${item.groupColor}18 100%)`,
        borderColor: hovered ? `${item.groupColor}60` : `${item.groupColor}25`,
        transform: hovered ? `translateY(-4px) scale(1.02)` : `none`,
        boxShadow: hovered ? item.hoverShadow : `none`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log(`[党建益友] SchemeC clicked:`, item.label)}
    >
      {/* 组色提示点 右上角 */}
      <div
        className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full opacity-60"
        style={{ backgroundColor: item.groupColor }}
      />
      {/* 常用星标 */}
      <span className={`absolute top-1.5 left-2 text-[10px] ${item.common ? `` : `hidden`}`} style={{ color: `#F5A623` }}>★</span>

      {/* 图标 */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-all duration-200"
        style={{
          backgroundColor: hovered ? `${item.groupColor}30` : `${item.groupColor}1A`,
          boxShadow: hovered ? `0 4px 12px ${item.groupColor}30` : `none`,
        }}
      >
        <IconComp className="w-6 h-6" style={{ color: item.groupColor }} />
      </div>

      {/* 标签 */}
      <span className="text-sm font-semibold text-[#1A1A1A] text-center">{item.label}</span>

      {/* 微数据 */}
      <span className="text-[10px] text-[#B0B7C3] mt-1.5">
        👍{formatCount(item.likes)} · 👁{formatCount(item.views)}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   方案 D · 侧边分类 + 内容面板式
   ═══════════════════════════════════════════════ */
function SchemeD() {
  const [activeIdx, setActiveIdx] = useState(0);
  const group = QUICK_NAV_GROUPS[activeIdx];

  return (
    <div className="flex gap-0 bg-white rounded-2xl border border-[#E9E9E9] overflow-hidden min-h-[280px]">
      {/* 左侧分类导航栏 */}
      <div className="w-32 flex-shrink-0 border-r border-[#E9E9E9] flex flex-col py-3 bg-[#FAFAFA]">
        {QUICK_NAV_GROUPS.map((g, i) => (
          <button
            key={g.groupLabel}
            onClick={() => setActiveIdx(i)}
            className="relative flex items-center gap-2 px-4 py-3.5 text-sm font-semibold transition-all duration-200 text-left"
            style={
              activeIdx === i
                ? { color: g.groupColor, backgroundColor: `${g.groupColor}0C` }
                : { color: `#6B7280`, backgroundColor: `transparent` }
            }
          >
            {/* 激活左边框 */}
            <span
              className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full transition-all duration-200"
              style={{ backgroundColor: activeIdx === i ? g.groupColor : `transparent` }}
            />
            {g.groupLabel}
          </button>
        ))}
      </div>

      {/* 右侧内容面板 */}
      <div className="flex-1 min-w-0 p-5 flex flex-col gap-3">
        {group.items.map((item) => (
          <SchemeDCard
            key={item.id}
            item={item}
            groupColor={group.groupColor}
            hoverBorderColor={group.hoverBorderColor}
            hoverShadow={group.hoverShadow}
          />
        ))}
      </div>
    </div>
  );
}

function SchemeDCard({
  item,
  groupColor,
  hoverBorderColor,
  hoverShadow,
}: {
  item: { id: number; icon: React.ElementType; label: string; color: string; common: boolean; likes: number; views: number };
  groupColor: string;
  hoverBorderColor: string;
  hoverShadow: string;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = item.icon;
  // 伪描述文字 map
  const descMap: Record<string, string> = {
    党费缴纳: `在线完成党费缴纳登记，支持历史记录查询与导出`,
    组织关系: `办理党员组织关系转接、介绍信开具等事务`,
    活动报名: `查看近期党内活动并完成在线报名登记`,
    通知公告: `查阅党委最新通知、公告与重要文件`,
    党章学习: `在线阅读党章全文，支持逐章标注与学习进度`,
    学习强国: `跳转学习强国平台，完成每日积分学习任务`,
    经典文献: `系统阅读马列经典文献与党的历史文件`,
    红色网站: `精选推荐各类权威红色学习网站导航`,
    党务公开: `查阅本单位党务公开栏目内容与公示信息`,
    积分管理: `查询个人党建积分明细，申请积分兑换`,
    党建统计: `生成党支部组织数据统计报表与分析图表`,
    党支部地图: `查看本单位各党支部地理分布与成员信息`,
  };
  return (
    <div
      className="flex items-center gap-4 bg-white rounded-xl border px-5 py-4 cursor-pointer transition-all duration-200"
      style={
        hovered
          ? { borderColor: hoverBorderColor, transform: `translateY(-3px)`, boxShadow: hoverShadow }
          : { borderColor: `#E9E9E9` }
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => console.log(`[党建益友] SchemeD clicked:`, item.label)}
    >
      {/* 大图标块 */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{
          backgroundColor: hovered ? `${item.color}25` : `${item.color}15`,
          boxShadow: hovered ? `0 4px 14px ${item.color}30` : `none`,
        }}
      >
        <IconComp className="w-7 h-7" style={{ color: item.color }} />
      </div>

      {/* 右侧信息区 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-bold text-[#1A1A1A]">{item.label}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold text-white ${item.common ? `` : `hidden`}`}
            style={{ backgroundColor: `#F5A623` }}>
            常用
          </span>
        </div>
        <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-1 mb-1.5">
          {descMap[item.label] || `党建便民服务，点击即可快速访问`}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#B0B7C3]">👍 {formatCount(item.likes)}</span>
          <span className="text-[10px] text-[#B0B7C3]">👁 {formatCount(item.views)}</span>
        </div>
      </div>

      {/* 箭头 */}
      <ChevronRightIcon
        className="w-4 h-4 flex-shrink-0 transition-all duration-200"
        style={{ color: hovered ? groupColor : `#D1D5DB` }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   全部导航：4套方案容器
   ═══════════════════════════════════════════════ */
const SCHEME_META = [
  {
    tag: `A`,
    name: `Tab 分类标签式`,
    desc: `顶部 Tab 切换分组 · 横向列表行展示 · 激活色填充`,
    tagColor: `#C8001E`,
  },
  {
    tag: `B`,
    name: `彩色胶囊徽章式`,
    desc: `流式胶囊标签 · 按组色渐变填充 · 常用浮标角标`,
    tagColor: `#E8700A`,
  },
  {
    tag: `C`,
    name: `图标宫格磁贴式`,
    desc: `大号磁贴宫格 · 渐变色块背景 · 常用金星标注`,
    tagColor: `#1A6BC8`,
  },
  {
    tag: `D`,
    name: `侧边分类面板式`,
    desc: `左侧竖向导航栏 · 右侧大横向卡片 · 信息层级分明`,
    tagColor: `#2DA058`,
  },
];

function AllNavSection() {
  return (
    <section className="py-12">
      {/* 区块大标题 */}
      <div className="flex items-center justify-between mb-10">
        <h2 className="party-section-title text-xl font-semibold text-[#1A1A1A] flex items-center">
          全部导航
        </h2>
        <span className="text-xs text-[#9CA3AF]">4 种风格对比 · 数据相同 · 点击即可快速访问</span>
      </div>

      <div className="flex flex-col gap-16">

        {/* ── 方案 A ── */}
        <div>
          <SchemeLabelRow meta={SCHEME_META[0]} />
          <SchemeA />
        </div>

        {/* ── 方案 B ── */}
        <div>
          <SchemeLabelRow meta={SCHEME_META[1]} />
          <SchemeB />
        </div>

        {/* ── 方案 C ── */}
        <div>
          <SchemeLabelRow meta={SCHEME_META[2]} />
          <SchemeC />
        </div>

        {/* ── 方案 D ── */}
        <div>
          <SchemeLabelRow meta={SCHEME_META[3]} />
          <SchemeD />
        </div>

      </div>
    </section>
  );
}

function SchemeLabelRow({
  meta,
}: {
  meta: { tag: string; name: string; desc: string; tagColor: string };
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {/* 方案徽章 */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-extrabold text-base flex-shrink-0"
        style={{ backgroundColor: meta.tagColor }}
      >
        {meta.tag}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold text-[#1A1A1A]">
          方案 {meta.tag} · {meta.name}
        </span>
        <span className="text-xs text-[#9CA3AF] mt-0.5">{meta.desc}</span>
      </div>
      {/* 装饰分割线 */}
      <div className="flex-1 h-px bg-[#E9E9E9] ml-2" />
    </div>
  );
}

/* ─── Main Component ─── */
export default function Index() {
  const [searchValue, setSearchValue] = useState(``);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recentWords, setRecentWords] = useState<string[]>(INITIAL_RECENT_WORDS);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  /* 联想词：从词库中过滤 */
  const suggestions = searchValue.trim()
    ? SUGGEST_POOL.filter((w) => w.includes(searchValue.trim())).slice(0, 8)
    : [];

  /* 面板显示逻辑 */
  const showHistoryPanel = panelOpen && !searchValue;     // 无输入 → 历史+热门
  const showSuggestPanel = panelOpen && !!searchValue && suggestions.length > 0; // 有输入 → 联想

  /* 点击外部关闭面板 */
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setSearchFocused(false);
      }
    }
    document.addEventListener(`mousedown`, onClickOutside);
    return () => document.removeEventListener(`mousedown`, onClickOutside);
  }, []);

  function handleSearch() {
    if (searchValue.trim()) {
      /* 追加最近搜索（去重，最多保留 6 条） */
      setRecentWords((prev) => {
        const filtered = prev.filter((w) => w !== searchValue.trim());
        return [searchValue.trim(), ...filtered].slice(0, 6);
      });
      setSearchResult(searchValue.trim());
      setPanelOpen(false);
      console.log(`[党建益友] Search keyword:`, searchValue);
    } else {
      /* 无输入时点击搜索按钮 → 打开历史+热门面板 */
      setPanelOpen(true);
    }
  }

  function handleSelectWord(word: string) {
    setSearchValue(word);
    setRecentWords((prev) => {
      const filtered = prev.filter((w) => w !== word);
      return [word, ...filtered].slice(0, 6);
    });
    setSearchResult(null);
    setPanelOpen(false);
    console.log(`[党建益友] Word selected:`, word);
  }

  function handleRemoveRecent(word: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRecentWords((prev) => prev.filter((w) => w !== word));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchValue(e.target.value);
    setSearchResult(null);
    setPanelOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === `Enter`) handleSearch();
    if (e.key === `Escape`) { setPanelOpen(false); setSearchFocused(false); }
  }

  function handleInputFocus() {
    setSearchFocused(true);
    setPanelOpen(true);
  }

  const hasNoResult = !!searchResult;

  return (
    <div data-cmp="Index" className="min-h-screen flex flex-col bg-[#F7F8FA]">
      {/* ════════ HEADER ════════ */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E9E9E9] shadow-sm">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Left Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[#C8001E] flex-shrink-0">
              <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon
                  points="20,5 23.5,15 34,15 25.5,21.5 28.5,32 20,26 11.5,32 14.5,21.5 6,15 16.5,15"
                  fill="#F5A623"
                />
                <path d="M15,22 Q16,18 20,17 Q18,22 18,26 Z" fill="white" opacity="0.85" />
                <rect x="19" y="16" width="2" height="8" rx="1" fill="white" opacity="0.85" transform="rotate(30 20 20)" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold text-[#C8001E] tracking-wide">党建益友</span>
              <span className="text-[10px] text-[#6B7280] tracking-widest">PARTY BUILDING DIGITAL PORTAL</span>
            </div>
          </div>

          {/* Right Nav */}
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-6 mr-4">
              {[`首页`, `党务公开`, `学习园地`, `通知公告`].map((item) => (
                <a
                  key={item}
                  href="#"
                  className="text-sm text-[#1A1A1A] hover:text-[#C8001E] transition-colors font-medium"
                  onClick={(e) => e.preventDefault()}
                >
                  {item}
                </a>
              ))}
            </nav>
            <Button
              className="flex items-center gap-1.5 text-sm font-medium px-4"
              style={{ backgroundColor: `rgb(200, 0, 30)`, color: `white`, border: `none` }}
            >
              <UserIcon className="w-4 h-4" />
              登录 / 注册
            </Button>
          </div>
        </div>
      </header>

      {/* ════════ HERO SEARCH ════════ */}
      <section className="party-hero-bg pt-16">
        <div className="max-w-[1280px] mx-auto px-6 py-16 flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-16 bg-[#F5A623] opacity-70" />
            <span className="text-[#F5A623] text-xs tracking-[0.3em] font-medium uppercase">
              Party Building Digital Portal
            </span>
            <div className="h-px w-16 bg-[#F5A623] opacity-70" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 leading-tight">
            不忘初心，牢记使命
          </h1>
          <p className="text-red-200 text-base mb-10 tracking-wide">
            凝聚党员力量 · 服务党务工作 · 推进党建高质量发展
          </p>

          {/* Search Box + Suggestions + No Result — 整体容器 */}
          <div className="w-full max-w-2xl relative" ref={searchWrapRef}>
            {/* 搜索框 */}
            <div
              className={`flex gap-0 bg-white rounded-xl overflow-hidden shadow-lg transition-all duration-200 ${
                searchFocused ? `ring-2 ring-[#F5A623]/40` : ``
              }`}
            >
              <Input
                value={searchValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onKeyDown={handleKeyDown}
                placeholder={`请输入党建相关关键词，如：党章、学习教育、党费...`}
                className="flex-1 border-0 focus-visible:ring-0 text-sm h-14 px-5 text-[#1A1A1A] placeholder:text-[#9CA3AF] rounded-none"
              />
              <button
                onClick={handleSearch}
                className="px-8 h-14 text-white font-semibold text-sm flex items-center gap-2 flex-shrink-0 transition-colors"
                style={{ backgroundColor: searchFocused ? `#A80018` : `rgb(200, 0, 30)` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `#A80018`)}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = searchFocused ? `#A80018` : `rgb(200, 0, 30)`)
                }
              >
                <SearchIcon className="w-4 h-4" />
                搜索
              </button>
            </div>

            {/* ── 历史 + 热门面板（无输入时） ── */}
            <div
              className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top ${
                showHistoryPanel
                  ? `opacity-100 scale-y-100 pointer-events-auto`
                  : `opacity-0 scale-y-95 pointer-events-none`
              }`}
            >
              {/* 最近搜索 */}
              {recentWords.length > 0 && (
                <div className="px-4 pt-3 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-[#9CA3AF] font-semibold tracking-wider flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      最近搜索
                    </p>
                    <button
                      onMouseDown={() => setRecentWords([])}
                      className="text-[10px] text-[#9CA3AF] hover:text-[#C8001E] transition-colors"
                    >
                      清空
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentWords.map((word) => (
                      <button
                        key={word}
                        onMouseDown={() => handleSelectWord(word)}
                        className="group flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-[#F7F8FA] text-[#4B5563] border border-[#E9E9E9] hover:bg-[#FFF0F2] hover:border-[#F5A0A8] hover:text-[#C8001E] transition-all"
                      >
                        {word}
                        <span
                          onMouseDown={(e) => handleRemoveRecent(word, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#C8001E] hover:text-[#A80018] leading-none"
                        >
                          <XIcon className="w-2.5 h-2.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── 联想搜索面板（有输入时） ── */}
            <div
              className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 bg-white rounded-xl shadow-xl border border-[#E9E9E9] overflow-hidden transition-all duration-200 origin-top ${
                showSuggestPanel
                  ? `opacity-100 scale-y-100 pointer-events-auto`
                  : `opacity-0 scale-y-95 pointer-events-none`
              }`}
            >
              <div className="py-1">
                {suggestions.map((word, idx) => {
                  const keyword = searchValue.trim();
                  const parts = word.split(keyword);
                  return (
                    <button
                      key={idx}
                      onMouseDown={() => handleSelectWord(word)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FFF5F5] transition-colors group"
                    >
                      <SearchIcon className="w-3.5 h-3.5 text-[#D1D5DB] group-hover:text-[#C8001E] flex-shrink-0 transition-colors" />
                      <span className="text-sm text-[#1A1A1A] flex-1 min-w-0 truncate">
                        {parts.map((part, i) => (
                          <span key={i}>
                            {part}
                            {i < parts.length - 1 && (
                              <span className="text-[#C8001E] font-semibold">{keyword}</span>
                            )}
                          </span>
                        ))}
                      </span>
                      <ChevronRightIcon className="w-3 h-3 text-[#D1D5DB] opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 无结果提示 — 搜索框下方独立白色区块 */}
            <div className={hasNoResult ? `` : `hidden`}>
              <div className="mt-3 bg-white rounded-lg px-4 py-2.5 flex items-center gap-2.5 shadow-sm border border-red-100">
                <AlertCircleIcon className="w-4 h-4 text-[#C8001E] flex-shrink-0" />
                <span className="text-sm text-[#1A1A1A]">
                  <span className="text-[#C8001E] font-medium">「{searchResult}」</span>
                  &nbsp;— 暂无相关结果，请尝试其他关键词
                </span>
              </div>
            </div>

            {/* 热词标签 */}
            <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
              <span className="text-red-200 text-xs mr-1">热门搜索：</span>
              {HOT_WORDS.map((word) => (
                <button
                  key={word}
                  onClick={() => handleSelectWord(word)}
                  className={`text-xs px-3 py-1 rounded-full transition-all border ${
                    searchValue === word
                      ? `bg-[#F5A623] text-white border-[#F5A623]`
                      : `bg-white/20 text-white border-white/30 hover:bg-[#F5A623] hover:text-white hover:border-[#F5A623]`
                  }`}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="h-8 bg-[#F7F8FA]" style={{
          borderRadius: `50% 50% 0 0 / 100% 100% 0 0`,
          marginTop: `-1px`,
        }} />
      </section>

      {/* ════════ MAIN CONTENT ════════ */}
      <main className="flex-1">
        <div className="max-w-[1280px] mx-auto px-6">

          {/* ── 党建考核排行榜 + 右侧分类快捷导航 ── */}
          <section className="py-12">

            {/* 左右两列各自独立标题行 */}
            <div className="flex gap-6 mb-6">
              <div className="flex-1 min-w-0 flex items-center justify-between">
                <h2 className="party-section-title text-xl font-semibold text-[#1A1A1A]">
                  党建考核排行榜
                </h2>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm text-[#C8001E] flex items-center gap-1 hover:opacity-80 transition-opacity"
                >
                  查看全部 <ChevronRightIcon className="w-4 h-4" />
                </a>
              </div>
              <div className="flex-1 min-w-0 flex items-center">
                <h2 className="party-section-title text-xl font-semibold text-[#1A1A1A]">
                  快捷导航
                </h2>
              </div>
            </div>

            {/* 左右容器 */}
            <div className="flex gap-6 items-start">

              {/* ── Left: 排行榜 (50%) ── */}
              <div className="flex-1 min-w-0 flex flex-col">

                {/* Stats Bar 概览条 */}
                <div className="bg-red-50 rounded-xl py-2.5 px-4 flex items-center mb-4 border border-red-100">
                  {STATS.map((stat, idx) => {
                    const StatIcon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className={`flex-1 flex items-center gap-3 ${idx < STATS.length - 1 ? `border-r border-red-100` : ``}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                          <StatIcon className="w-4 h-4 text-[#C8001E]" />
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="text-[#6B7280] text-[10px]">{stat.label}</span>
                          <span className="text-[#C8001E] font-extrabold text-lg leading-tight">
                            {stat.value}
                            <span className="text-xs font-semibold text-[#9CA3AF] ml-0.5">{stat.unit}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 第 1 名卡片 — 重构：移除悬浮皇冠，改为左侧金色竖条 + 右置皇冠 */}
                <div className="mb-4">
                  <div className="relative bg-gradient-to-br from-[#FFF7E6] to-[#FFF0CC] rounded-2xl border border-[#F5A623]/40 overflow-hidden shadow-md flex">
                    {/* 左侧金色竖条 */}
                    <div className="w-1.5 bg-[#F5A623] flex-shrink-0 rounded-l-2xl" />
                    <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow"
                        style={{ background: `linear-gradient(135deg, rgb(245, 166, 35), rgb(232, 112, 10))` }}
                      >
                        1
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-[#1A1A1A] truncate">{RANKING_LIST[0].name}</div>
                        <div className="text-xs text-[#9CA3AF] mt-0.5">综合考核得分</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-2xl font-extrabold text-[#E8700A]">
                          {RANKING_LIST[0].score}
                          <span className="text-sm font-semibold text-[#F5A623] ml-0.5">分</span>
                        </div>
                        <CrownIcon className="w-5 h-5 text-[#F5A623]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2nd and 3rd place — 固定高度 h-20 */}
                <div className="flex gap-3 mb-4">
                  {RANKING_LIST.slice(1, 3).map((item) => {
                    const isSecond = item.rank === 2;
                    const medalColor = isSecond
                      ? { bg: `linear-gradient(135deg, rgb(192, 192, 192), rgb(168, 168, 168))`, text: `rgb(136, 136, 136)`, border: `rgb(192, 192, 192)` }
                      : { bg: `linear-gradient(135deg, rgb(205, 127, 50), rgb(160, 82, 45))`, text: `rgb(160, 82, 45)`, border: `rgb(205, 127, 50)` };
                    return (
                      <div
                        key={item.rank}
                        className="flex-1 bg-white rounded-xl border p-4 flex items-end gap-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 h-20"
                        style={{ borderColor: medalColor.border + `55` }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow"
                          style={{ background: medalColor.bg }}
                        >
                          {item.rank}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[#1A1A1A] truncate">{item.name}</div>
                          <div className="text-[10px] text-[#9CA3AF] mt-0.5">综合考核得分</div>
                        </div>
                        <div className="text-base font-extrabold flex-shrink-0" style={{ color: medalColor.text }}>
                          {item.score}
                          <span className="text-[10px] font-semibold ml-0.5">分</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ranks 4-10 — 固定行高 h-11 */}
                <div className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden">
                  {RANKING_LIST.slice(3).map((item, idx) => (
                    <div
                      key={item.rank}
                      className={`flex items-center gap-3 px-4 h-11 transition-colors hover:bg-[#FFF8F8] ${
                        idx < RANKING_LIST.slice(3).length - 1 ? `border-b border-[#F0F0F0]` : ``
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full bg-[#F7F8FA] border border-[#E9E9E9] flex items-center justify-center text-xs font-bold text-[#6B7280] flex-shrink-0">
                        {item.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-[#1A1A1A] font-medium truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-20 h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${((item.score - 80) / 20) * 100}%`,
                              background: getProgressGradient(item.rank),
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-[#C8001E] w-12 text-right">
                          {item.score} <span className="text-[10px] font-normal text-[#9CA3AF]">分</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Right: 分类快捷导航 (50%) — flex-none 自适应高度 ── */}
              <div className="flex-1 min-w-0 flex flex-col gap-3 justify-start">
                {SIDE_NAV_CATEGORIES.map((category) => {
                  const CatIcon = category.icon;
                  const sortedItems = [...category.items].sort((a, b) => b.clicks - a.clicks).slice(0, 4);
                  return (
                    <div
                      key={category.id}
                      className="rounded-xl border overflow-hidden"
                      style={{
                        borderColor: category.borderColor,
                        backgroundColor: category.bgLight,
                      }}
                    >
                      {/* Category Header */}
                      <div
                        className="flex items-center gap-2 px-4 py-2.5 border-b"
                        style={{
                          borderColor: category.borderColor,
                          backgroundColor: `rgba(255,255,255,0.6)`,
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${category.color}` }}
                        >
                          <CatIcon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-sm font-semibold" style={{ color: category.color }}>
                          {category.label}
                        </span>
                        {/* "使用最多"角标 — 仅 tools 分类 */}
                        <div className={`ml-1 ${category.isMostUsed ? `` : `hidden`}`}>
                          <Badge
                            className="text-[10px] px-1.5 py-0 h-4 font-medium"
                            style={{ backgroundColor: `#F5A623`, color: `white`, border: `none` }}
                          >
                            使用最多
                          </Badge>
                        </div>
                        {/* 更多链接 */}
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); console.log(`[党建益友] 更多 clicked:`, category.label); }}
                          className="ml-auto text-xs opacity-70 hover:opacity-100 transition-opacity flex items-center gap-0.5"
                          style={{ color: category.color }}
                        >
                          更多 ›
                        </a>
                      </div>

                      {/* Nav Items — 2 columns (使用 flex wrap 替代 grid)，按 clicks 降序取前 4 */}
                      <div className="flex flex-wrap gap-2 p-3">
                        {sortedItems.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <button
                              key={item.id}
                              className="flex items-center gap-2.5 bg-white rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm text-left group"
                              style={{ borderColor: `rgba(0,0,0,0.06)`, flex: `1 1 calc(50% - 4px)`, minWidth: 0 }}
                              onClick={() => console.log(`[党建益友] Side nav clicked:`, item.label)}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-200 group-hover:opacity-90"
                                style={{ backgroundColor: `${item.color}22` }}
                              >
                                <ItemIcon className="w-4 h-4" style={{ color: item.color }} />
                              </div>
                              {/* 中间：名称 */}
                              <span className="text-xs font-medium text-[#1A1A1A] leading-tight truncate flex-1 min-w-0">
                                {item.label}
                              </span>
                              {/* 右侧：点赞量 + 访问量 */}
                              <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                                <span className="text-[9px] leading-none text-[#B0B7C3]">👍 {formatCount(item.likes)}</span>
                                <span className="text-[9px] leading-none text-[#B0B7C3]">👁 {formatCount(item.views)}</span>
                              </div>
                              <ChevronRightIcon
                                className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ color: item.color }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </section>

          <Separator className="bg-[#E9E9E9]" />

          {/* ── 热点任务区 ── */}
          <section className="py-12">
            <div className="flex items-center justify-between mb-8">
              <h2 className="party-section-title text-xl font-semibold text-[#1A1A1A] flex items-center">
                热点任务
              </h2>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm text-[#C8001E] flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                查看全部 <ChevronRightIcon className="w-4 h-4" />
              </a>
            </div>

            <div className="flex flex-wrap gap-5">
              {HOT_TASKS.map((task) => {
                const IconComp = task.icon;
                return (
                  <div
                    key={task.id}
                    className="party-task-card bg-white rounded-xl border border-[#E9E9E9] p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1"
                    style={{ flex: `1 1 calc(25% - 20px)`, minWidth: `200px` }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: task.bg }}
                      >
                        <IconComp className="w-5 h-5" style={{ color: task.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#1A1A1A] mb-1 truncate">{task.title}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${task.tagColor}`}>
                          {task.tag}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-2 mb-3">{task.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9CA3AF]">截止：{task.date}</span>
                      <ChevronRightIcon className="w-3.5 h-3.5 text-[#C8001E]" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 查看我的任务按钮 */}
            <div className="mt-8 flex justify-center">
              <button
                className="border border-[#C8001E] text-[#C8001E] rounded-lg px-6 py-2 text-sm hover:bg-red-50 transition-colors flex items-center gap-1.5 font-medium"
                onClick={() => console.log(`[党建益友] 查看我的任务`)}
              >
                查看我的任务
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </section>

          <Separator className="bg-[#E9E9E9]" />

          {/* ── 全部导航：4套风格对比展示 ── */}
          <AllNavSection />

          <Separator className="bg-[#E9E9E9]" />

          {/* ── 党建资讯 ── */}
          <section className="py-12">
            <div className="flex items-center justify-between mb-8">
              <h2 className="party-section-title text-xl font-semibold text-[#1A1A1A] flex items-center">
                党建资讯
              </h2>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-sm text-[#C8001E] flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                更多资讯 <ChevronRightIcon className="w-4 h-4" />
              </a>
            </div>

            <div className="flex gap-5 flex-wrap">
              {/* Big card */}
              <div
                className="bg-white rounded-xl border border-[#E9E9E9] overflow-hidden cursor-pointer party-task-card transition-all duration-200"
                style={{ flex: `2 1 400px` }}
              >
                <div
                  className="h-40 flex items-end p-5"
                  style={{ background: `linear-gradient(135deg, rgb(200, 0, 30) 0%, rgb(232, 0, 45) 60%, rgb(255, 107, 107) 100%)` }}
                >
                  <div>
                    <Badge
                      className="mb-2 text-[10px]"
                      style={{ backgroundColor: `rgb(245, 166, 35)`, color: `white`, border: `none` }}
                    >
                      重要精神
                    </Badge>
                    <h3 className="text-white font-bold text-base leading-snug">
                      深入学习贯彻党的二十大精神<br />推动党建工作高质量发展
                    </h3>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">2025-06-15 · 党务工作部</span>
                  <div className="flex items-center gap-1 text-xs text-[#C8001E]">
                    <TrendingUpIcon className="w-3.5 h-3.5" />
                    热点
                  </div>
                </div>
              </div>

              {/* List card */}
              <div
                className="bg-white rounded-xl border border-[#E9E9E9] p-5 flex flex-col gap-0"
                style={{ flex: `3 1 400px` }}
              >
                {[
                  { title: `关于做好2025年度党员发展工作的通知`, date: `2025-06-18`, hot: true },
                  { title: `组织开展"学党史·强信念·跟党走"专题活动`, date: `2025-06-12`, hot: false },
                  { title: `第二季度党支部书记述职报告工作安排`, date: `2025-06-08`, hot: false },
                  { title: `党风廉政建设责任书签订工作部署会召开`, date: `2025-06-02`, hot: false },
                ].map((news, idx) => (
                  <div key={idx}>
                    <div
                      className="flex items-center justify-between py-3.5 cursor-pointer hover:text-[#C8001E] transition-colors group"
                      onClick={() => console.log(`[党建益友] News clicked:`, news.title)}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: `rgb(200, 0, 30)` }} />
                        <span className="text-sm text-[#1A1A1A] group-hover:text-[#C8001E] transition-colors truncate">
                          {news.title}
                        </span>
                        {news.hot && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">
                            HOT
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#9CA3AF] flex-shrink-0 ml-4">{news.date}</span>
                    </div>
                    {idx < 3 && <Separator className="bg-[#F0F0F0]" />}
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* ════════ FOOTER ════════ */}
      <footer className="party-footer-bg mt-8">
        <div className="max-w-[1280px] mx-auto px-6 py-10">
          {/* Friend links */}
          <div className="mb-6">
            <p className="text-red-200 text-xs mb-3 tracking-wide">友情链接</p>
            <div className="flex flex-wrap gap-3">
              {FRIEND_LINKS.map((link) => (
                <a
                  key={link}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-xs text-white/70 hover:text-[#F5A623] transition-colors border border-white/20 px-3 py-1 rounded-full hover:border-[#F5A623]"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10 mb-6" />

          {/* Copyright */}
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
            <p className="text-red-300 text-xs">
              京ICP备XXXXXXXX号
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
