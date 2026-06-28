import {
  ArmchairIcon,
  DoorOpenIcon,
  FactoryIcon,
  FilmIcon,
  FlagIcon,
  FlowerIcon,
  ImageIcon,
  LayoutTemplateIcon,
  MedalIcon,
  MousePointer2Icon,
  MoveRightIcon,
  PackageIcon,
  PenLineIcon,
  PinIcon,
  ScrollTextIcon,
  SignpostIcon,
  SproutIcon,
  TrophyIcon,
  TypeIcon,
  WallpaperIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { CanvasTool, FixtureType, HallDesignerState, Selection, StampPreset } from "../../lib/hallTypes";
import { DECOR_PRESETS, FIXTURE_META, WALL_DECOR_PRESETS } from "../../lib/hallUtils";

type IconCmp = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const TYPE_ICONS: Record<FixtureType, IconCmp> = {
  image_case: ImageIcon,
  video_wall: FilmIcon,
  model_stand: PackageIcon,
  honor_wall: MedalIcon,
  notice_board: LayoutTemplateIcon,
  door: DoorOpenIcon,
  text_3d: TypeIcon,
  decor: SproutIcon,
  ceiling_sign: SignpostIcon,
  wall_decor: WallpaperIcon,
  flag: FlagIcon,
};

/** palette 条目:类型 + 可选变体预设(装饰的 绿植/矮盆栽/长椅) */
interface PaletteItem {
  type: FixtureType;
  label: string;
  icon: IconCmp;
  preset?: StampPreset;
}

const WALL_DECOR_ICONS: IconCmp[] = [FlagIcon, FactoryIcon, TrophyIcon, ScrollTextIcon];

const SHOW_ITEMS: PaletteItem[] = [
  { type: "image_case", label: "图片展柜", icon: ImageIcon },
  { type: "video_wall", label: "视频展墙", icon: FilmIcon },
  { type: "model_stand", label: "模型台", icon: PackageIcon },
  { type: "honor_wall", label: "荣誉墙", icon: MedalIcon },
  { type: "notice_board", label: "党务公开板", icon: LayoutTemplateIcon },
  { type: "text_3d", label: "立体字", icon: TypeIcon },
  { type: "ceiling_sign", label: "顶端吊牌", icon: SignpostIcon },
  { type: "flag", label: "党旗 / 旗帜", icon: FlagIcon },
  // 文化墙挂件(浮雕造型:党务/厂务公开栏、荣誉墙、入党誓词板,各一按钮)
  ...WALL_DECOR_PRESETS.map((p, i) => ({
    type: "wall_decor" as const,
    label: p.label,
    icon: WALL_DECOR_ICONS[i] ?? WallpaperIcon,
    preset: { label: p.label, w: p.w, d: p.d, content: p.content },
  })),
];

const DECOR_ICONS: Record<string, IconCmp> = {
  plant: SproutIcon,
  plant_short: FlowerIcon,
  bench: ArmchairIcon,
  arrow: MoveRightIcon,
};

const STRUCT_ITEMS: PaletteItem[] = [
  { type: "door", label: "门 / 通道(墙上挖洞)", icon: DoorOpenIcon },
  ...DECOR_PRESETS.map((p) => ({
    type: "decor" as const,
    label: p.label,
    icon: DECOR_ICONS[p.kind] ?? SproutIcon,
    preset: { label: p.label, w: p.w, d: p.d, content: { kind: p.kind } },
  })),
];

interface FixturePaletteProps {
  state: HallDesignerState;
  tool: CanvasTool;
  selection: Selection;
  onToolChange: (t: CanvasTool) => void;
  onSelectionChange: (s: Selection) => void;
}

/** 左栏:工具(选择/画墙)+ 组件库(tab 分组 + 扁平整行按钮)+ 已放对象列表 */
export function FixturePalette({ state, tool, selection, onToolChange, onSelectionChange }: FixturePaletteProps) {
  const isActive = (it: PaletteItem) =>
    tool.mode === "stamp" &&
    tool.type === it.type &&
    (it.preset ? tool.preset?.label === it.preset.label : !tool.preset);

  const toggleItem = (it: PaletteItem) =>
    onToolChange(isActive(it) ? { mode: "select" } : { mode: "stamp", type: it.type, preset: it.preset });

  const renderRow = (it: PaletteItem) => {
    const Icon = it.icon;
    const active = isActive(it);
    const meta = FIXTURE_META[it.type];
    return (
      <button
        key={`${it.type}:${it.label}`}
        type="button"
        onClick={() => toggleItem(it)}
        className={`w-full h-8 flex items-center gap-2 px-2 rounded border text-xs transition-colors ${
          active
            ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5"
            : "border-transparent text-[#52525B] hover:bg-[#F7F8FA] hover:border-[#E9E9E9]"
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? undefined : meta.color }} />
        <span className="flex-1 text-left truncate">{it.label}</span>
        {meta.wallMount && it.type !== "decor" && (
          <span className="text-[9px] px-1 rounded bg-[#F4F4F5] text-[#9CA3AF] flex-shrink-0">贴墙</span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 工具 */}
      <div className="p-2.5 border-b border-[#F0F0F0]">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onToolChange({ mode: "select" })}
            className={`h-8 flex items-center justify-center gap-1.5 rounded border text-xs ${
              tool.mode === "select"
                ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5"
                : "border-[#E9E9E9] text-[#52525B] hover:bg-[#FAFAFA]"
            }`}
          >
            <MousePointer2Icon className="w-3.5 h-3.5" />
            选择
          </button>
          <button
            type="button"
            onClick={() => onToolChange(tool.mode === "wall" ? { mode: "select" } : { mode: "wall" })}
            className={`h-8 flex items-center justify-center gap-1.5 rounded border text-xs ${
              tool.mode === "wall"
                ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5"
                : "border-[#E9E9E9] text-[#52525B] hover:bg-[#FAFAFA]"
            }`}
          >
            <PenLineIcon className="w-3.5 h-3.5" />
            画墙
          </button>
        </div>
      </div>

      {/* 组件库(tab 分组,扁平整行,点选后到画布点击放置) */}
      <Tabs defaultValue="show" className="flex-shrink-0 gap-0">
        <TabsList className="w-full h-8 rounded-none border-b border-[#F0F0F0] bg-[#FAFAFA] p-0">
          <TabsTrigger
            value="show"
            className="flex-1 rounded-none text-xs data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)]"
          >
            展示组件
          </TabsTrigger>
          <TabsTrigger
            value="struct"
            className="flex-1 rounded-none text-xs data-[state=active]:bg-white data-[state=active]:text-[var(--party-primary)] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[var(--party-primary)]"
          >
            门 / 装饰
          </TabsTrigger>
        </TabsList>
        <TabsContent value="show" className="p-1.5 m-0 space-y-0.5">
          {SHOW_ITEMS.map(renderRow)}
        </TabsContent>
        <TabsContent value="struct" className="p-1.5 m-0 space-y-0.5">
          {STRUCT_ITEMS.map(renderRow)}
        </TabsContent>
      </Tabs>

      {/* 对象列表 */}
      <div className="flex-1 min-h-0 overflow-auto p-2.5 border-t border-[#F0F0F0]">
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
