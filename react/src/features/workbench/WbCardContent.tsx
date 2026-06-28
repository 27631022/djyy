import { useNavigate } from "react-router-dom";
import {
  LandmarkIcon,
  AwardIcon,
  SendIcon,
  FileTextIcon,
  WalletIcon,
  UsersIcon,
  BarChart3Icon,
  GraduationCapIcon,
  CalendarDaysIcon,
  FilePlus2Icon,
  UploadIcon,
  ClipboardCheckIcon,
  ArrowUpRightIcon,
} from "lucide-react";
import type { ElementType } from "react";
import type { WbCardType, WbCardSize } from "./wbLayout";
import { TodoWidget } from "./TodoWidget";

const C = {
  red: "#C8001E",
  gold: "#F5A623",
  blue: "#246BFE",
  cyan: "#0891B2",
  green: "#159F62",
};

type Go = (to?: string) => void;

/** 全卡片内容:按 type(+ size)渲染各卡 body(只渲染内容,标题由 WbCardFrame 提供)。
 *  多尺寸真数据卡(如 todo)按 size 切换独立排版;其余卡暂为单尺寸,忽略 size。 */
export function WbCardContent({ type, size }: { type: WbCardType; size: WbCardSize }) {
  const navigate = useNavigate();
  const go: Go = (to) => {
    if (to) navigate(to);
  };
  switch (type) {
    case "todo":
      return <TodoWidget size={size} />;
    case "notice":
      return <Notice />;
    case "governance":
      return <Governance />;
    case "apps":
      return <Apps go={go} />;
    case "recommend":
      return <Recommend />;
    case "calendar":
      return <CalendarBody />;
    case "persona":
      return <Persona />;
    case "kpi":
      return <Kpi />;
    case "quick":
      return <Quick go={go} />;
    case "assistant":
      return <Assistant />;
    default:
      return null;
  }
}

/* ── 管理员卡 ── */
function Notice() {
  const rows = [
    { t: "关于开展“七一”表彰工作的通知", d: "党办 · 2天前", hot: true },
    { t: "第二季度党费收缴提醒", d: "组织部 · 5天前", hot: false },
    { t: "2026年度民主评议党员安排", d: "组织部 · 上周", hot: false },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.t} className="flex items-start gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: r.hot ? C.red : "#C0C6D0" }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-[#172033] truncate">{r.t}</div>
            <div className="text-[11px] text-[#667085]">{r.d}</div>
          </div>
          {r.hot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#fff2f3] text-[var(--party-primary)] font-bold flex-shrink-0">
              置顶
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Governance() {
  const rows = [
    { t: "权限自动过滤", s: "仅显示可访问应用", n: "86", color: C.blue },
    { t: "虚拟组织推荐", s: "项目组 · 专班 · 临时任务", n: "18", color: C.green },
  ];
  // 2 列并排,适配 2×1 footprint
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map((r) => (
        <div key={r.t} className="grid grid-cols-[8px_1fr_auto] items-center gap-2 min-w-0">
          <span className="w-2 h-9 rounded-full" style={{ background: r.color }} />
          <div className="min-w-0">
            <strong className="block text-[13px] text-[#172033] font-semibold truncate">{r.t}</strong>
            <span className="block mt-0.5 text-[11px] text-[#667085] truncate">{r.s}</span>
          </div>
          <span className="text-[12px] font-extrabold text-[#475467]">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 个人卡 ── */
interface WbApp {
  name: string;
  desc: string;
  icon: ElementType;
  color: string;
  to?: string;
}
const WB_APPS: WbApp[] = [
  { name: "党务工作台", desc: "组织生活 · 党员管理", icon: LandmarkIcon, color: C.red },
  { name: "证书管理", desc: "模板 · 发证 · 验证", icon: AwardIcon, color: C.red, to: "/admin/certificates" },
  { name: "任务派发", desc: "下发 · 填报 · 汇总", icon: SendIcon, color: C.blue, to: "/admin/tasks" },
  { name: "公文流转", desc: "收文 · 发文 · 传阅", icon: FileTextIcon, color: C.gold },
  { name: "费用报销", desc: "发起 · 审批 · 归档", icon: WalletIcon, color: C.green },
  { name: "通讯录", desc: "组织架构 · 虚拟组", icon: UsersIcon, color: C.blue, to: "/admin/users" },
  { name: "数据报表", desc: "个人 · 部门 · 专题", icon: BarChart3Icon, color: C.cyan },
  { name: "学习中心", desc: "课程 · 考试 · 积分", icon: GraduationCapIcon, color: C.green },
];
function Apps({ go }: { go: Go }) {
  // 4×2 footprint:桌面 4 列 × 2 行正好放下 8 个磁贴,无右侧/底部留白
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 h-full content-stretch">
      {WB_APPS.map((app) => {
        const Icon = app.icon;
        return (
          <button
            key={app.name}
            onClick={() => go(app.to)}
            className={`min-w-0 px-3 py-2.5 rounded-lg border border-[#e2e8f0] bg-white/70 text-left transition-all ${
              app.to ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : "cursor-default"
            }`}
          >
            <span className="w-8 h-8 grid place-items-center rounded-lg text-white" style={{ background: app.color }}>
              <Icon className="w-[17px] h-[17px]" />
            </span>
            <strong className="block mt-2 text-[13px] text-[#172033] font-semibold truncate">{app.name}</strong>
            <span className="block mt-0.5 text-[11px] leading-snug text-[#667085] truncate">{app.desc}</span>
          </button>
        );
      })}
    </div>
  );
}


function Recommend() {
  const rows = [
    { name: "会议纪要助手", why: "检测到你 14:30 有部门例会", reason: "日程相关", icon: CalendarDaysIcon, color: C.blue },
    { name: "学习任务核验", why: "同组 72% 成员已完成", reason: "组织同步", icon: GraduationCapIcon, color: C.red },
    { name: "报销单草稿", why: "识别到上周交通票据待提交", reason: "行为预测", icon: WalletIcon, color: C.gold },
  ];
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <div key={r.name} className="grid grid-cols-[34px_1fr_auto] items-center gap-2.5">
            <span className="w-[34px] h-[34px] grid place-items-center rounded-lg text-white" style={{ background: r.color }}>
              <Icon className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <strong className="block text-[13px] text-[#172033] font-semibold">{r.name}</strong>
              <span className="block mt-0.5 text-[11px] text-[#667085] truncate">{r.why}</span>
            </div>
            <span className="px-2 py-1 rounded-full text-[11px] font-extrabold bg-[#fff2f3] text-[var(--party-primary)]">
              {r.reason}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CalendarBody() {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const soft = new Date(today);
  soft.setDate(today.getDate() + 2);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
        <span key={w} className="h-7 grid place-items-center text-[12px] text-[#9CA3AF]">
          {w}
        </span>
      ))}
      {days.map((d, i) => {
        const hot = same(d, today);
        const isSoft = same(d, soft);
        return (
          <span
            key={i}
            className={`h-7 grid place-items-center rounded-md text-[12px] ${
              hot ? "text-white font-black" : isSoft ? "font-extrabold text-[#a15c00] bg-[rgba(245,166,35,0.14)]" : "text-[#475467]"
            }`}
            style={hot ? { background: C.red } : undefined}
          >
            {d.getDate()}
          </span>
        );
      })}
    </div>
  );
}

function Persona() {
  const rows = [
    { label: "岗位匹配", pct: 86 },
    { label: "常用应用", pct: 74 },
    { label: "组织任务", pct: 68 },
    { label: "学习偏好", pct: 52 },
  ];
  // 2 列紧排,适配 2×1 footprint(横 2 格 × 纵 1 格)
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2">
      {rows.map((p) => (
        <div key={p.label} className="min-w-0">
          <div className="flex items-center justify-between text-[12px] text-[#667085] mb-0.5">
            <span className="truncate">{p.label}</span>
            <span className="font-bold text-[#475467]">{p.pct}%</span>
          </div>
          <span className="block w-full h-1.5 rounded-full overflow-hidden bg-[#e8edf4]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${p.pct}%`, background: `linear-gradient(90deg, ${C.red}, ${C.gold})` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function Kpi() {
  const items = [
    { label: "本月发证", value: "128", delta: "+12" },
    { label: "任务完成率", value: "86%", delta: "+4%" },
    { label: "我的待办", value: "6", delta: "" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((k) => (
        <div key={k.label} className="p-1">
          <div className="text-[12px] text-[#9CA3AF]">{k.label}</div>
          <div className="text-xl font-bold text-[#172033] mt-1 flex items-end gap-1">
            {k.value}
            {k.delta && (
              <span className="text-[11px] text-emerald-600 font-normal flex items-center">
                <ArrowUpRightIcon className="w-3 h-3" />
                {k.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Quick({ go }: { go: Go }) {
  const actions = [
    { label: "新建任务", icon: FilePlus2Icon, to: "/admin/tasks/new" },
    { label: "颁发证书", icon: SendIcon, to: "/admin/certificates/issue" },
    { label: "报送数据", icon: UploadIcon },
    { label: "发起审批", icon: ClipboardCheckIcon },
  ];
  // 紧凑排布,适配 2×1 footprint
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.label}
            onClick={() => go(a.to)}
            className="flex flex-col items-center gap-1 py-1 rounded-xl hover:bg-[#F2F3F5] text-[#4B5563]"
          >
            <span className="w-8 h-8 rounded-full grid place-items-center bg-party-soft" style={{ color: "var(--party-primary)" }}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-[12px]">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Assistant() {
  const acts = [
    { t: "生成本周工作摘要", k: "Enter" },
    { t: "查我的未完成学习", k: "⌘K" },
    { t: "打开报销审批", k: "AI" },
  ];
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-[#667085]">输入自然语言即可打开应用、生成流程草稿或汇总待办。</p>
      <div className="grid gap-2 mt-3">
        {acts.map((a) => (
          <div
            key={a.t}
            className="grid grid-cols-[1fr_auto] items-center min-h-[34px] px-2.5 rounded-lg text-[12px] text-[#1f2937] bg-[rgba(36,107,254,0.06)]"
          >
            <span>{a.t}</span>
            <strong className="text-[#1d4ed8]">{a.k}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
