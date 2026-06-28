import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { PencilRulerIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { useAuth } from "@/stores/auth";
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
/** 浅色渐变底,让上层磨砂玻璃卡片的 backdrop-blur 有内容可虚化 */
const PAGE_BG = "linear-gradient(135deg, #eef2f9 0%, #f6f7fb 52%, #fef1f2 100%)";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "凌晨好";
  if (h < 11) return "上午好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** 后台首页 · 工作台(嵌入 AdminLayout,人人可见)。千人千面 + 拖拽编排 + 磨砂玻璃。 */
export default function WorkbenchHomePage() {
  const { me } = useAuth();
  const uid = me?.id ?? "anon";
  const roleCodes = me?.roles?.map((r) => r.code) ?? [];
  const isAdmin = !!me?.isPlatformAdmin || roleCodes.includes("platform_admin");
  const primaryAdmin = me?.memberships.admin.find((m) => m.isPrimary) ?? me?.memberships.admin[0];
  const subtitle = [primaryAdmin?.org.name, primaryAdmin?.position, me?.memberships.party.length ? "党员" : null]
    .filter(Boolean)
    .join(" · ");
  // 换账号 = uid 变,内层按新用户的布局重新初始化(千人千面、互不串号)
  return (
    <WorkbenchHomeInner
      key={uid}
      uid={uid}
      name={me?.name ?? "同志"}
      subtitle={subtitle}
      isAdmin={isAdmin}
      roleCodes={roleCodes}
    />
  );
}

function WorkbenchHomeInner({
  uid,
  name,
  subtitle,
  isAdmin,
  roleCodes,
}: {
  uid: string;
  name: string;
  subtitle: string;
  isAdmin: boolean;
  roleCodes: string[];
}) {
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
    if (isLockedFor(type, isAdmin)) return; // 管理员卡对非管理员锁定
    persist(layout.filter((c) => c.type !== type));
  }
  function removeCard(id: string) {
    const card = layout.find((c) => c.id === id);
    if (!card || isLockedFor(card.type, isAdmin)) return;
    persist(layout.filter((c) => c.id !== id));
  }
  function cycleSize(id: string) {
    persist(layout.map((c) => (c.id === id ? { ...c, size: nextSize(c.type, c.size) } : c)));
  }
  function resetDefault() {
    clearPersonalLayout(uid);
    setLayout(getEffectiveLayout(uid, isAdmin, roleCodes));
  }

  return (
    <div className="relative min-h-full" style={{ background: PAGE_BG }}>
      {/* 背景彩色光斑(磨砂玻璃虚化的底) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-28 -left-20 w-[440px] h-[440px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(200,0,30,0.20), transparent 70%)" }}
        />
        <div
          className="absolute top-40 -right-16 w-[420px] h-[420px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(36,107,254,0.18), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-24 left-1/3 w-[400px] h-[400px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(245,166,35,0.16), transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 px-5 py-5 max-w-[1480px] mx-auto grid gap-4 content-start">
        {/* 问候 banner(磨砂玻璃) */}
        <div
          className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/45 backdrop-blur-xl px-6 py-5 shadow-[0_8px_32px_rgba(28,42,68,0.10)]"
        >
          <div
            className="absolute -right-12 -top-16 w-[180px] h-[180px] rounded-full"
            style={{ border: "30px solid rgba(200,0,30,0.07)" }}
          />
          <h1 className="relative z-10 text-[22px] font-bold text-[#172033]">
            {greeting()},{name}。今天优先处理 3 件事
          </h1>
          <p className="relative z-10 text-[13px] text-[#667085] mt-1">{subtitle || "欢迎回到党建益友工作台"}</p>
          <div className="relative z-10 flex flex-wrap gap-2 mt-3">
            {["本周高频:流程审批", "推荐:会议纪要助手", "已同步桌面待办"].map((s) => (
              <span
                key={s}
                className="px-2.5 py-1.5 rounded-lg border border-white/70 bg-white/55 backdrop-blur text-[12px] font-bold text-[#344054]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* 工具条:编辑桌面 / 添加卡片 / 重置 */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[13px] text-[#667085]">
            {editing ? "拖拽排序、增删卡片、点尺寸调大小;带锁的是管理员卡。" : "你的专属工作台,可点「编辑桌面」自由编排。"}
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
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] border border-white/70 bg-white/70 backdrop-blur hover:bg-white text-[#667085]"
                >
                  <RotateCcwIcon className="w-3.5 h-3.5" />
                  重置默认
                </button>
              </>
            )}
            <button
              onClick={() => setEditing((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-bold ${
                editing ? "text-white" : "border border-white/70 bg-white/70 backdrop-blur text-[#344054]"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px] auto-rows-[120px] grid-flow-row-dense">
              {layout.map((card) => (
                <WbCardFrame
                  key={card.id}
                  card={card}
                  editing={editing}
                  locked={isLockedFor(card.type, isAdmin)}
                  onRemove={() => removeCard(card.id)}
                  onCycleSize={() => cycleSize(card.id)}
                >
                  <WbCardContent type={card.type} size={card.size} />
                </WbCardFrame>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
