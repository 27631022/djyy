import {
  DoorOpenIcon,
  FilmIcon,
  ImageIcon,
  LayoutTemplateIcon,
  MedalIcon,
  MousePointer2Icon,
  PackageIcon,
  PenLineIcon,
  PinIcon,
  TypeIcon,
} from "lucide-react";
import type { CanvasTool, FixtureType, HallDesignerState, Selection } from "../../lib/hallTypes";
import { FIXTURE_META } from "../../lib/hallUtils";

const TYPE_ICONS: Record<FixtureType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  image_case: ImageIcon,
  video_wall: FilmIcon,
  model_stand: PackageIcon,
  honor_wall: MedalIcon,
  notice_board: LayoutTemplateIcon,
  door: DoorOpenIcon,
  text_3d: TypeIcon,
};

interface FixturePaletteProps {
  state: HallDesignerState;
  tool: CanvasTool;
  selection: Selection;
  onToolChange: (t: CanvasTool) => void;
  onSelectionChange: (s: Selection) => void;
}

/** 左栏:工具(选择/画墙)+ 组件类型(点选进入放置模式)+ 已放对象列表 */
export function FixturePalette({ state, tool, selection, onToolChange, onSelectionChange }: FixturePaletteProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 工具 */}
      <div className="p-3 space-y-1.5 border-b border-[#F0F0F0]">
        <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1">工具</div>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton
            active={tool.mode === "select"}
            icon={<MousePointer2Icon className="w-4 h-4" />}
            label="选择"
            onClick={() => onToolChange({ mode: "select" })}
          />
          <ToolButton
            active={tool.mode === "wall"}
            icon={<PenLineIcon className="w-4 h-4" />}
            label="画墙"
            onClick={() => onToolChange(tool.mode === "wall" ? { mode: "select" } : { mode: "wall" })}
          />
        </div>
      </div>

      {/* 组件库 */}
      <div className="p-3 space-y-1.5 border-b border-[#F0F0F0]">
        <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1">组件(点选后到画布放置)</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(FIXTURE_META) as FixtureType[]).map((t) => {
            const Icon = TYPE_ICONS[t];
            const active = tool.mode === "stamp" && tool.type === t;
            return (
              <ToolButton
                key={t}
                active={active}
                icon={<Icon className="w-4 h-4" />}
                label={FIXTURE_META[t].label}
                badge={FIXTURE_META[t].wallMount ? "贴墙" : undefined}
                onClick={() => onToolChange(active ? { mode: "select" } : { mode: "stamp", type: t })}
              />
            );
          })}
        </div>
      </div>

      {/* 对象列表 */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">
          画布对象(墙 {state.walls.length} · 组件 {state.fixtures.length})
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onSelectionChange({ kind: "spawn" })}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left ${
              selection?.kind === "spawn" ? "bg-[var(--party-primary)]/10 text-[var(--party-primary)]" : "text-[#52525B] hover:bg-[#F7F8FA]"
            }`}
          >
            <PinIcon className="w-3.5 h-3.5 flex-shrink-0" />
            进场出生点
          </button>
          {state.fixtures.map((f) => {
            const Icon = TYPE_ICONS[f.type];
            const active = selection?.kind === "fixture" && selection.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectionChange({ kind: "fixture", id: f.id })}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left ${
                  active ? "bg-[var(--party-primary)]/10 text-[var(--party-primary)]" : "text-[#52525B] hover:bg-[#F7F8FA]"
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FIXTURE_META[f.type].color }} />
                <span className="truncate">{f.label || FIXTURE_META[f.type].label}</span>
              </button>
            );
          })}
          {state.fixtures.length === 0 && (
            <p className="text-[11px] text-[#9CA3AF] leading-relaxed px-1 pt-1">
              还没有组件 —— 上方点选类型,再到画布点击放置。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 px-1 py-2 rounded border text-[11px] transition-colors ${
        active
          ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5"
          : "border-[#E9E9E9] text-[#52525B] hover:border-[#D4D4D4] hover:bg-[#FAFAFA]"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute top-0.5 right-0.5 text-[9px] px-1 rounded bg-[#F4F4F5] text-[#9CA3AF]">{badge}</span>
      )}
    </button>
  );
}
