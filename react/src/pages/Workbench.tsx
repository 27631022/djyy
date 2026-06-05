import { useState, type ElementType } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import {
  SearchIcon,
  BellIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  UsersIcon,
  FileTextIcon,
  BarChart3Icon,
  Wand2Icon,
  PencilRulerIcon,
  CheckIcon,
  RotateCcwIcon,
  HomeIcon,
  ShieldIcon,
  SettingsIcon,
  LogOutIcon,
} from "lucide-react";
import { useAuth } from "@/stores/auth";
import { SiteLogo } from "@/features/site-setting";
import {
  WbCardFrame,
  WbCardContent,
  WbCatalog,
  getEffectiveLayout,
  savePersonalLayout,
  clearPersonalLayout,
  nextSize,
  CARD_META,
  isLockedFor,
  type WbLayout,
  type WbCardType,
} from "@/features/workbench";

const C = { red: "#C8001E" };
const PAGE_BG =
  "linear-gradient(120deg, rgba(200,0,30,0.08), transparent 34%), linear-gradient(315deg, rgba(36,107,254,0.12), transparent 36%), #eef2f7";

const NAV = [
  { label: "我的工作台", icon: LayoutDashboardIcon, count: 12, active: true },
  { label: "全部应用", icon: LayoutGridIcon, count: 86 },
  { label: "组织应用", icon: UsersIcon, count: 24 },
  { label: "流程中心", icon: FileTextIcon, count: 9 },
  { label: "数据看板", icon: BarChart3Icon, count: 7 },
  { label: "我的编排", icon: Wand2Icon, count: 5 },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "凌晨好";
  if (h < 11) return "上午好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export default function WorkbenchPage() {
  const { me } = useAuth();
  const uid = me?.id ?? "anon";
  const roleCodes = me?.roles?.map((r) => r.code) ?? [];
  const isAdmin = roleCodes.includes("platform_admin");
  const primaryAdmin = me?.memberships.admin.find((m) => m.isPrimary) ?? me?.memberships.admin[0];
  const subtitle = [primaryAdmin?.org.name, me?.memberships.party.length ? "党员" : null].filter(Boolean).join(" · ");

  const [layout, setLayout] = useState<WbLayout>(() => getEffectiveLayout(uid, isAdmin, roleCodes));
  const [editing, setEditing] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function persist(next: WbLayout) {
    setLayout(next);
    savePersonalLayout(uid, next);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.findIndex((c) => c.id === active.id);
    const newIndex = layout.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persist(arrayMove(layout, oldIndex, newIndex));
  }
  function addCard(type: WbCardType) {
    if (layout.some((c) => c.type === type)) return; // 单例:每种卡只一张
    persist([...layout, { id: type, type, size: CARD_META[type].defaultSize }]);
  }
  function removeType(type: WbCardType) {
    if (isLockedFor(type, isAdmin)) return; // 管理员卡对非管理员锁定,不可移除
    persist(layout.filter((c) => c.type !== type));
  }
  function removeCard(id: string) {
    const card = layout.find((c) => c.id === id);
    if (!card || isLockedFor(card.type, isAdmin)) return;
    persist(layout.filter((c) => c.id !== id));
  }
  function cycleSize(id: string) {
    persist(layout.map((c) => (c.id === id ? { ...c, size: nextSize(c.size) } : c)));
  }
  function resetDefault() {
    clearPersonalLayout(uid);
    setLayout(getEffectiveLayout(uid, isAdmin, roleCodes));
  }

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>
      <TopBar name={me?.name ?? "未登录"} subtitle={subtitle} isAdmin={isAdmin} />

      <main className="max-w-[1440px] mx-auto grid grid-cols-1 xl:grid-cols-[236px_minmax(0,1fr)] gap-5 px-6 py-5">
        <SideNav />

        <section className="min-w-0 grid gap-4 content-start">
          {/* 问候 banner(固定壳,不可编辑) */}
          <div
            className="relative overflow-hidden rounded-lg border border-white/70 px-6 py-5 shadow-[0_18px_48px_rgba(28,42,68,0.12)]"
            style={{
              background:
                "linear-gradient(105deg, rgba(255,255,255,0.92), rgba(255,245,245,0.78)), linear-gradient(135deg, rgba(200,0,30,0.08), rgba(36,107,254,0.06))",
            }}
          >
            <div className="absolute -right-14 -top-16 w-[180px] h-[180px] rounded-full" style={{ border: "30px solid rgba(200,0,30,0.08)" }} />
            <h1 className="relative z-10 text-[24px] font-bold text-[#172033]">
              {greeting()},{me?.name ?? "同志"}。今天优先处理 3 件事
            </h1>
            <div className="relative z-10 flex flex-wrap gap-2 mt-3">
              {["综合处专班", "本周高频:流程审批", "推荐:会议纪要助手", "已同步桌面日历"].map((s) => (
                <span key={s} className="px-2.5 py-1.5 rounded-lg border border-[#dce4ef]/80 bg-white/70 text-[12px] font-bold text-[#344054]">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* 工具条:tabs + 编辑桌面 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5 p-1 rounded-lg border border-[#dce4ef] bg-white/70">
              {["为我推荐", "常用", "组织", "收藏", "最近"].map((t, i) => (
                <button
                  key={t}
                  className={`h-[30px] px-3 rounded-md text-[13px] ${
                    i === 0 ? "bg-white text-[var(--party-primary)] font-extrabold shadow-[0_6px_16px_rgba(28,42,68,0.08)]" : "text-[#667085]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {editing && (
                <>
                  <WbCatalog
                    isAdmin={isAdmin}
                    present={(t) => layout.some((c) => c.type === t)}
                    onAdd={addCard}
                    onRemove={removeType}
                  />
                  <button
                    onClick={resetDefault}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] border border-[#dce4ef] bg-white/80 hover:bg-[#F7F8FA] text-[#667085]"
                  >
                    <RotateCcwIcon className="w-3.5 h-3.5" />
                    重置默认
                  </button>
                </>
              )}
              <button
                onClick={() => setEditing((v) => !v)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-bold ${
                  editing ? "text-white" : "border border-[#dce4ef] bg-white/80 text-[#344054]"
                }`}
                style={editing ? { background: C.red } : undefined}
              >
                {editing ? <CheckIcon className="w-3.5 h-3.5" /> : <PencilRulerIcon className="w-3.5 h-3.5" />}
                {editing ? "完成" : "编辑桌面"}
              </button>
            </div>
          </div>

          {/* 全卡片画布 */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={layout.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                {layout.map((card) => (
                  <WbCardFrame
                    key={card.id}
                    card={card}
                    editing={editing}
                    locked={isLockedFor(card.type, isAdmin)}
                    onRemove={() => removeCard(card.id)}
                    onCycleSize={() => cycleSize(card.id)}
                  >
                    <WbCardContent type={card.type} />
                  </WbCardFrame>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      </main>
    </div>
  );
}

/* ─── 顶栏(固定壳) ─── */
function TopBar({ name, subtitle, isAdmin }: { name: string; subtitle: string; isAdmin: boolean }) {
  return (
    <header className="h-[68px] grid grid-cols-[1fr] sm:grid-cols-[286px_minmax(280px,1fr)_auto] items-center gap-4 px-6 border-b border-[#e2e8f0]/90 bg-white/75 backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        <SiteLogo className="w-10 h-10 flex-shrink-0" />
        <div className="leading-tight min-w-0">
          <strong className="block text-[16px] font-bold text-[#172033] truncate">党建益友 · 智能应用中台</strong>
          <span className="block text-[12px] text-[#667085] mt-0.5">员工登录后的统一工作入口</span>
        </div>
      </div>
      <label className="hidden sm:grid grid-cols-[38px_1fr_auto] items-center h-11 rounded-lg border border-[#dce4ef] bg-white/90 shadow-[0_8px_24px_rgba(36,107,254,0.06)]">
        <SearchIcon className="w-[18px] h-[18px] justify-self-center text-[#667085]" />
        <input placeholder="帮我找一下本周需要处理的报销、学习和会议…" className="min-w-0 bg-transparent outline-none text-sm text-[#172033] placeholder:text-[#9CA3AF]" />
        <span className="mr-2 px-2 py-1.5 rounded-md text-[12px] font-bold bg-[rgba(36,107,254,0.09)] text-[#1d4ed8]">AI 搜索</span>
      </label>
      <div className="flex items-center justify-end gap-2.5">
        <button className="w-9 h-9 grid place-items-center rounded-lg border border-[#dce4ef] bg-white/85 text-[#475467] hover:text-[var(--party-primary)]" title="消息">
          <BellIcon className="w-[18px] h-[18px]" />
        </button>
        <UserMenu name={name} subtitle={subtitle} isAdmin={isAdmin} />
      </div>
    </header>
  );
}

function UserMenu({ name, subtitle, isAdmin }: { name: string; subtitle: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="grid grid-cols-[32px_1fr] items-center gap-2.5 min-w-[160px] pl-1.5 pr-2.5 py-1.5 rounded-lg border border-[#dce4ef] bg-white/85 text-left"
      >
        <span className="w-8 h-8 grid place-items-center rounded-lg font-black text-[var(--party-primary)] bg-[#ffe8ea]">{name.charAt(0)}</span>
        <span className="min-w-0">
          <strong className="block text-[13px] text-[#172033] truncate">{name}</strong>
          <span className="block text-[11px] text-[#667085] truncate">{subtitle || "—"}</span>
        </span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-[#ECECEC] py-1.5 z-50">
          <MenuRow icon={HomeIcon} label="门户首页" onClick={() => navigate("/")} />
          <MenuRow icon={SettingsIcon} label="个人设置" disabled />
          {isAdmin && (
            <>
              <div className="h-px bg-[#F2F3F5] my-1" />
              <MenuRow icon={ShieldIcon} label="系统管理" accent onClick={() => navigate("/admin")} />
            </>
          )}
          <div className="h-px bg-[#F2F3F5] my-1" />
          <MenuRow icon={LogOutIcon} label="退出登录" onClick={() => { logout(); navigate("/login", { replace: true }); }} />
        </div>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label, accent, disabled, onClick }: { icon: ElementType; label: string; accent?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        accent ? "text-[var(--party-primary)] hover:bg-party-soft font-medium" : "text-[#4B5563] hover:bg-[#F7F8FA]"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1">{label}</span>
      {disabled && <span className="text-[9px] text-[#D1D5DB]">待实现</span>}
    </button>
  );
}

/* ─── 左侧导航(固定壳) ─── */
function SideNav() {
  return (
    <aside className="min-w-0">
      <nav className="grid gap-1.5">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.label}
              className={`grid grid-cols-[28px_1fr_auto] items-center gap-2.5 min-h-[42px] px-2.5 rounded-lg text-sm cursor-pointer ${
                n.active ? "bg-white text-[var(--party-primary)] shadow-[0_10px_28px_rgba(28,42,68,0.08)]" : "text-[#475467] hover:bg-white/60"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{n.label}</span>
              <span className={`min-w-[22px] text-center px-1.5 py-0.5 rounded-full text-[11px] font-extrabold ${n.active ? "bg-[rgba(200,0,30,0.09)] text-[var(--party-primary)]" : "text-[#9CA3AF]"}`}>
                {n.count}
              </span>
            </div>
          );
        })}
      </nav>
      <p className="mt-4 px-2 text-[11px] leading-relaxed text-[#9CA3AF]">
        点右上「编辑桌面」可拖拽排序、增删卡片、调大小。带锁的是管理员卡。
      </p>
    </aside>
  );
}
