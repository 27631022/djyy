import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { hallApi } from "../../api";
import type {
  CeilingSignContent,
  DecorContent,
  DoorContent,
  Fixture,
  HallDesignerState,
  HallThemePreset,
  HonorWallContent,
  ImageCaseContent,
  ModelStandContent,
  NoticeBoardContent,
  Selection,
  Text3dContent,
  VideoWallContent,
} from "../../lib/hallTypes";
import { FIXTURE_META, round2, wallLength } from "../../lib/hallUtils";
import {
  HonorItemsEditor,
  ImageCaseEditor,
  ModelStandEditor,
  NoticeItemsEditor,
  Text3dEditor,
  VideoWallEditor,
} from "./ContentEditors";

interface PropertiesPanelProps {
  state: HallDesignerState;
  selection: Selection;
  hallId: string;
  accent: string;
  /** record 历史后应用变更 */
  onUpdate: (mutate: (s: HallDesignerState) => HallDesignerState) => void;
  onDeleteSelection: () => void;
}

const inputCls =
  "w-full px-2 py-1 text-xs rounded border border-[#E5E5E5] focus:border-[var(--party-primary)] focus:outline-none bg-white";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 flex-shrink-0 text-[#6B7280]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Num({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(round2(n));
      }}
      className={inputCls}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide pt-1">{children}</div>;
}

const PRESET_LABEL: Record<HallThemePreset, string> = {
  modern_light: "现代展馆·浅色",
  party_red: "党建红馆",
  dark_tech: "深色科技馆",
};

export function PropertiesPanel({ state, selection, hallId, accent, onUpdate, onDeleteSelection }: PropertiesPanelProps) {
  /* ── 厅设置(未选中任何东西) ── */
  if (!selection) {
    const meta = state.meta;
    const theme = meta.theme ?? {};
    const spawn = meta.spawn ?? { x: 0, y: 0, rot: 0 };
    return (
      <div className="space-y-2.5">
        <SectionTitle>展厅设置</SectionTitle>
        <Row label="墙高(m)">
          <Num value={meta.wallH ?? 4.2} step={0.1} min={2.4} max={12} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, wallH: n } }))} />
        </Row>
        <Row label="网格(m)">
          <select
            value={String(meta.gridM ?? 0.5)}
            onChange={(e) => onUpdate((s) => ({ ...s, meta: { ...s.meta, gridM: Number(e.target.value) } }))}
            className={inputCls}
          >
            <option value="0.25">0.25</option>
            <option value="0.5">0.5</option>
            <option value="1">1</option>
          </select>
        </Row>

        <SectionTitle>主题风格</SectionTitle>
        <Row label="预设">
          <select
            value={theme.preset ?? "modern_light"}
            onChange={(e) => onUpdate((s) => ({ ...s, meta: { ...s.meta, theme: { ...s.meta.theme, preset: e.target.value as HallThemePreset } } }))}
            className={inputCls}
          >
            {(Object.keys(PRESET_LABEL) as HallThemePreset[]).map((p) => (
              <option key={p} value={p}>{PRESET_LABEL[p]}</option>
            ))}
          </select>
        </Row>
        <Row label="点缀色">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={theme.accent ?? "#C8001E"}
              onChange={(e) => onUpdate((s) => ({ ...s, meta: { ...s.meta, theme: { ...s.meta.theme, accent: e.target.value } } }))}
              className="w-8 h-6 p-0 border border-[#E5E5E5] rounded cursor-pointer"
            />
            <span className="text-[10px] text-[#9CA3AF]">{theme.accent ?? "#C8001E"}</span>
          </div>
        </Row>
        <Row label="镜面地板">
          <Switch
            checked={theme.mirrorFloor ?? false}
            onCheckedChange={(b) => onUpdate((s) => ({ ...s, meta: { ...s.meta, theme: { ...s.meta.theme, mirrorFloor: b } } }))}
          />
        </Row>

        <SectionTitle>进场出生点</SectionTitle>
        <Row label="X(m)">
          <Num value={spawn.x} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, x: n } } }))} />
        </Row>
        <Row label="Y(m)">
          <Num value={spawn.y} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, y: n } } }))} />
        </Row>
        <Row label="朝向(°)">
          <Num value={spawn.rot ?? 0} step={15} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, rot: ((n % 360) + 360) % 360 } } }))} />
        </Row>
        <p className="text-[10px] text-[#9CA3AF] leading-relaxed pt-1">
          画布上的圆点即出生点,可直接拖动;0° 朝平面图上方。
        </p>
      </div>
    );
  }

  /* ── 出生点 ── */
  if (selection.kind === "spawn") {
    const spawn = state.meta.spawn ?? { x: 0, y: 0, rot: 0 };
    return (
      <div className="space-y-2.5">
        <SectionTitle>进场出生点</SectionTitle>
        <Row label="X(m)"><Num value={spawn.x} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, x: n } } }))} /></Row>
        <Row label="Y(m)"><Num value={spawn.y} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, y: n } } }))} /></Row>
        <Row label="朝向(°)"><Num value={spawn.rot ?? 0} step={15} onChange={(n) => onUpdate((s) => ({ ...s, meta: { ...s.meta, spawn: { ...spawn, rot: ((n % 360) + 360) % 360 } } }))} /></Row>
      </div>
    );
  }

  /* ── 墙 ── */
  if (selection.kind === "wall") {
    const wall = state.walls.find((w) => w.id === selection.id);
    if (!wall) return <Empty />;
    const patchWall = (p: Partial<typeof wall>) =>
      onUpdate((s) => ({ ...s, walls: s.walls.map((w) => (w.id === wall.id ? { ...w, ...p } : w)) }));
    return (
      <div className="space-y-2.5">
        <SectionTitle>墙段</SectionTitle>
        <Row label="起点 X"><Num value={wall.x1} onChange={(n) => patchWall({ x1: n })} /></Row>
        <Row label="起点 Y"><Num value={wall.y1} onChange={(n) => patchWall({ y1: n })} /></Row>
        <Row label="终点 X"><Num value={wall.x2} onChange={(n) => patchWall({ x2: n })} /></Row>
        <Row label="终点 Y"><Num value={wall.y2} onChange={(n) => patchWall({ y2: n })} /></Row>
        <Row label="长度"><span className="text-xs text-[#1A1A1A] font-medium">{wallLength(wall).toFixed(2)} m</span></Row>
        <DeleteButton onClick={onDeleteSelection} label="删除这段墙" />
      </div>
    );
  }

  /* ── 组件 ── */
  const fixture = state.fixtures.find((f) => f.id === selection.id);
  if (!fixture) return <Empty />;
  return (
    <FixtureProps
      key={fixture.id}
      fixture={fixture}
      hallId={hallId}
      accent={accent}
      onPatch={(p) => onUpdate((s) => ({ ...s, fixtures: s.fixtures.map((f) => (f.id === fixture.id ? ({ ...f, ...p } as Fixture) : f)) }))}
      onDelete={onDeleteSelection}
    />
  );
}

function Empty() {
  return <p className="text-xs text-[#9CA3AF]">所选对象已不存在。</p>;
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border border-red-200 text-red-500 hover:bg-red-50"
    >
      <Trash2Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/* ── 组件属性 + 内容 ── */

function FixtureProps({
  fixture,
  hallId,
  accent,
  onPatch,
  onDelete,
}: {
  fixture: Fixture;
  hallId: string;
  accent: string;
  onPatch: (p: Partial<Fixture>) => void;
  onDelete: () => void;
}) {
  const meta = FIXTURE_META[fixture.type];
  const source = fixture.source ?? { mode: "manual" as const };
  const supportsConnector = fixture.type === "honor_wall" || fixture.type === "notice_board";

  const connectorsQuery = useQuery({
    queryKey: ["exhibition", "connectors"],
    queryFn: () => hallApi.connectors(),
    enabled: supportsConnector,
    staleTime: 5 * 60 * 1000,
  });
  const connectors = (connectorsQuery.data ?? []).filter((c) => c.forType === fixture.type);

  const patchContent = (content: unknown) => onPatch({ source: { ...source, content } });

  return (
    <div className="space-y-2.5">
      <SectionTitle>{meta.label}</SectionTitle>
      <Row label="名称">
        <input value={fixture.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} className={inputCls} />
      </Row>
      <div className="grid grid-cols-2 gap-1.5">
        <Row label="X(m)"><Num value={fixture.x} onChange={(n) => onPatch({ x: n })} /></Row>
        <Row label="Y(m)"><Num value={fixture.y} onChange={(n) => onPatch({ y: n })} /></Row>
        <Row label="宽(m)"><Num value={fixture.w} step={0.1} min={0.2} max={20} onChange={(n) => onPatch({ w: n })} /></Row>
        <Row label="深(m)"><Num value={fixture.d} step={0.1} min={0.1} max={10} onChange={(n) => onPatch({ d: n })} /></Row>
      </div>
      <Row label="朝向(°)">
        <div className="flex items-center gap-1">
          <Num value={fixture.rot} step={15} onChange={(n) => onPatch({ rot: ((n % 360) + 360) % 360 })} />
          <div className="flex gap-0.5 flex-shrink-0">
            {[0, 90, 180, 270].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPatch({ rot: r })}
                className={`px-1 py-0.5 text-[10px] rounded border ${fixture.rot === r ? "border-[var(--party-primary)] text-[var(--party-primary)]" : "border-[#E5E5E5] text-[#9CA3AF] hover:text-[#1A1A1A]"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </Row>

      {/* 数据来源(荣誉墙/党务板) */}
      {supportsConnector && (
        <>
          <SectionTitle>数据来源</SectionTitle>
          <div className="flex gap-1">
            {(["manual", "connector"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onPatch({ source: { ...source, mode: m } })}
                className={`flex-1 px-2 py-1 text-xs rounded border ${source.mode === m ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-[var(--party-primary)]/5" : "border-[#E5E5E5] text-[#6B7280]"}`}
              >
                {m === "manual" ? "手动维护" : "系统对接"}
              </button>
            ))}
          </div>
          {source.mode === "connector" && (
            <div className="space-y-1.5">
              <select
                value={source.connectorId ?? ""}
                onChange={(e) => onPatch({ source: { ...source, connectorId: e.target.value || undefined } })}
                className={inputCls}
              >
                <option value="">选择数据源…</option>
                {connectors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.ready ? "" : "(待接入)"}</option>
                ))}
              </select>
              <p className="text-[10px] text-amber-600 leading-relaxed">
                数据源尚未接入(P5):3D 展厅里会显示「数据源待接入」占位,接入后自动换成真实数据。
              </p>
            </div>
          )}
        </>
      )}

      {/* 门:通往展厅(展厅互通,3D 里点门传送) */}
      {fixture.type === "door" && (
        <DoorTargetEditor
          hallId={hallId}
          value={(source.content as DoorContent) ?? {}}
          onChange={patchContent}
        />
      )}

      {/* 内容编辑(手动模式) */}
      {source.mode === "manual" && fixture.type !== "door" && (
        <>
          <SectionTitle>展示内容</SectionTitle>
          {fixture.type === "image_case" && (
            <ImageCaseEditor value={(source.content as ImageCaseContent) ?? { images: [] }} hallId={hallId} onChange={patchContent} />
          )}
          {fixture.type === "video_wall" && (
            <VideoWallEditor value={(source.content as VideoWallContent) ?? {}} hallId={hallId} onChange={patchContent} />
          )}
          {fixture.type === "model_stand" && (
            <ModelStandEditor value={(source.content as ModelStandContent) ?? {}} hallId={hallId} onChange={patchContent} />
          )}
          {fixture.type === "honor_wall" && (
            <HonorItemsEditor value={(source.content as HonorWallContent) ?? { items: [] }} hallId={hallId} onChange={patchContent} />
          )}
          {fixture.type === "notice_board" && (
            <NoticeItemsEditor value={(source.content as NoticeBoardContent) ?? { items: [] }} onChange={patchContent} />
          )}
          {fixture.type === "text_3d" && (
            <Text3dEditor value={(source.content as Text3dContent) ?? { text: "" }} accent={accent} onChange={patchContent} />
          )}
          {fixture.type === "decor" && (
            <Row label="样式">
              <select
                value={((source.content as DecorContent) ?? {}).kind ?? "plant"}
                onChange={(e) => patchContent({ kind: e.target.value as DecorContent["kind"] })}
                className={inputCls}
              >
                <option value="plant">绿植(高)</option>
                <option value="plant_short">矮盆栽</option>
                <option value="bench">长椅</option>
                <option value="arrow">地面引导箭头</option>
              </select>
            </Row>
          )}
          {fixture.type === "ceiling_sign" && (
            <Row label="牌面文字">
              <input
                value={((source.content as CeilingSignContent) ?? { text: "" }).text ?? ""}
                onChange={(e) => patchContent({ text: e.target.value })}
                placeholder="如:荣誉展区"
                className={inputCls}
              />
            </Row>
          )}
        </>
      )}

      <DeleteButton onClick={onDelete} label="删除组件" />
    </div>
  );
}

/** 门的「通往展厅」:选目标厅后,3D 里点这扇门直接传送过去 */
function DoorTargetEditor({
  hallId,
  value,
  onChange,
}: {
  hallId: string;
  value: DoorContent;
  onChange: (v: DoorContent) => void;
}) {
  const hallsQuery = useQuery({
    queryKey: ["exhibition", "halls"],
    queryFn: () => hallApi.list(),
    staleTime: 60 * 1000,
  });
  const others = (hallsQuery.data ?? []).filter((h) => h.id !== hallId);
  return (
    <>
      <SectionTitle>通往展厅</SectionTitle>
      <select
        value={value.targetHallId ?? ""}
        onChange={(e) => {
          const id = e.target.value || undefined;
          const name = others.find((h) => h.id === id)?.name;
          onChange({ ...value, targetHallId: id, targetName: id ? name : undefined });
        }}
        className={inputCls}
      >
        <option value="">(普通门,不传送)</option>
        {others.map((h) => (
          <option key={h.id} value={h.id}>{h.name}{h.published ? "" : "(未发布)"}</option>
        ))}
      </select>
      {value.targetHallId && (
        <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
          3D 里门头牌会显示「→ {value.targetName}」,观众点门即可前往该展厅。
        </p>
      )}
    </>
  );
}
