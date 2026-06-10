import type { ReactNode } from "react";
import type { VenueElement } from "../../lib/venueTypes";
import { FONT_STACKS, isRotatable } from "../../lib/venueUtils";

/** 选中元素的属性编辑面板。onChange 只传 patch,id 由父组件绑定。 */
export function PropertiesPanel({
  selected,
  onChange,
}: {
  selected: VenueElement | null;
  onChange: (patch: Partial<VenueElement>) => void;
}) {
  if (!selected) {
    return (
      <div className="text-xs text-[#9CA3AF] leading-relaxed">
        未选中元素。
        <br />
        在画布上点选一个元素,或从左侧「元素」面板添加。
      </div>
    );
  }

  const el = selected;

  return (
    <div className="space-y-4">
      {/* 名称 */}
      <Row label="名称">
        <input
          value={el.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={INPUT}
        />
      </Row>

      {/* 位置 / 尺寸 */}
      <Section title="位置 / 尺寸">
        <div className="grid grid-cols-2 gap-2">
          <Num label="X" value={el.x} onChange={(v) => onChange({ x: v })} />
          <Num label="Y" value={el.y} onChange={(v) => onChange({ y: v })} />
          <Num label="宽" value={el.width} onChange={(v) => onChange({ width: Math.max(4, v) })} />
          <Num label="高" value={el.height} onChange={(v) => onChange({ height: Math.max(4, v) })} />
        </div>
        {isRotatable(el) && (
          <div className="mt-2">
            <Num label="旋转(°)" value={Math.round(el.rotation)} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} />
          </div>
        )}
      </Section>

      {/* 类型专属属性 */}
      {el.type === "seat" && (
        <Section title="座位">
          <Row label="座位号">
            <input value={el.seatNo ?? ""} onChange={(e) => onChange({ seatNo: e.target.value })} className={INPUT} placeholder="如 A-12(可空)" />
          </Row>
          <ColorRow label="底色" value={el.fill} onChange={(v) => onChange({ fill: v })} />
          {/* 预留座属于「分区与占座」阶段的功能,座次图编辑阶段不需要,已移除 */}
        </Section>
      )}

      {(el.type === "table-rect" || el.type === "table-round" || el.type === "presidium" || el.type === "podium") && (
        <Section title={el.type === "presidium" ? "主席台" : el.type === "podium" ? "发言席" : "桌子"}>
          <Row label="文字">
            <input value={el.label} onChange={(e) => onChange({ label: e.target.value })} className={INPUT} placeholder="桌牌/标签(可空)" />
          </Row>
          <ColorRow label="填充" value={el.fill} onChange={(v) => onChange({ fill: v })} />
          <ColorRow label="边框" value={el.stroke} onChange={(v) => onChange({ stroke: v })} />
          <Num label="边框宽" value={el.strokeWidth} onChange={(v) => onChange({ strokeWidth: Math.max(0, v) })} />
        </Section>
      )}

      {el.type === "banner" && (
        <Section title="横幅">
          <Row label="文字">
            <textarea value={el.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} className={`${INPUT} resize-none`} />
          </Row>
          <FontRow value={el.fontFamily} onChange={(v) => onChange({ fontFamily: v })} />
          <Num label="字号" value={el.fontSize} onChange={(v) => onChange({ fontSize: Math.max(8, v) })} />
          <ColorRow label="文字色" value={el.color} onChange={(v) => onChange({ color: v })} />
          <ColorRow label="底色" value={el.bg} onChange={(v) => onChange({ bg: v })} />
        </Section>
      )}

      {el.type === "wall" && (
        <Section title="背景墙">
          <ColorRow label="底色" value={el.fill} onChange={(v) => onChange({ fill: v })} />
          <ImageRow
            dataUrl={el.dataUrl}
            onPick={(dataUrl) => onChange({ dataUrl })}
            onClear={() => onChange({ dataUrl: undefined })}
          />
        </Section>
      )}

      {el.type === "aisle" && (
        <Section title="通道">
          <ColorRow label="底色" value={el.fill} onChange={(v) => onChange({ fill: v })} />
        </Section>
      )}

      {el.type === "door" && (
        <Section title="门 / 进出口">
          <Row label="标识文字">
            <input value={el.label} onChange={(e) => onChange({ label: e.target.value })} className={INPUT} placeholder="入口 / 出口 / 安全通道" />
          </Row>
          <Row label="方向">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange({ width: Math.max(el.width, el.height), height: Math.min(el.width, el.height) })}
                className={`flex-1 px-2 py-1 rounded text-[11px] border ${
                  el.width >= el.height ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft" : "border-[#E9E9E9] text-[#6B7280]"
                }`}
              >
                横向 ▭
              </button>
              <button
                type="button"
                onClick={() => onChange({ width: Math.min(el.width, el.height), height: Math.max(el.width, el.height) })}
                className={`flex-1 px-2 py-1 rounded text-[11px] border ${
                  el.height > el.width ? "border-[var(--party-primary)] text-[var(--party-primary)] bg-party-soft" : "border-[#E9E9E9] text-[#6B7280]"
                }`}
              >
                竖向 ▯
              </button>
            </div>
          </Row>
          <div className="flex flex-wrap gap-1">
            {DOOR_PRESETS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => onChange({ label: d.label, color: d.color })}
                className="px-2 py-1 rounded text-[11px] text-white"
                style={{ backgroundColor: d.color }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <ColorRow label="颜色" value={el.color} onChange={(v) => onChange({ color: v })} />
          <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
            门用一个色块表示;「横向 / 竖向」适配横墙或竖墙上的门。
          </p>
        </Section>
      )}

      {el.type === "text" && (
        <Section title="文字">
          <Row label="内容">
            <textarea value={el.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} className={`${INPUT} resize-none`} />
          </Row>
          <FontRow value={el.fontFamily} onChange={(v) => onChange({ fontFamily: v })} />
          <Num label="字号" value={el.fontSize} onChange={(v) => onChange({ fontSize: Math.max(8, v) })} />
          <ColorRow label="颜色" value={el.color} onChange={(v) => onChange({ color: v })} />
          <Row label="对齐">
            <select value={el.textAlign} onChange={(e) => onChange({ textAlign: e.target.value as "left" | "center" | "right" })} className={INPUT}>
              <option value="left">左</option>
              <option value="center">居中</option>
              <option value="right">右</option>
            </select>
          </Row>
          <label className="flex items-center gap-2 text-xs text-[#4B5563] mt-1 cursor-pointer">
            <input type="checkbox" checked={el.fontWeight === "bold"} onChange={(e) => onChange({ fontWeight: e.target.checked ? "bold" : "normal" })} />
            加粗
          </label>
        </Section>
      )}

      {el.type === "zone" && (
        <Section title="区域">
          <Row label="区域名">
            <input value={el.zoneName} onChange={(e) => onChange({ zoneName: e.target.value })} className={INPUT} placeholder="如 前排 / 党委席" />
          </Row>
          <ColorRow label="代表色" value={el.color} onChange={(v) => onChange({ color: v })} />
          <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
            区域用于智能选座规则(按区域定座)。保存时落在区域内的座位会自动归入该区域。
          </p>
        </Section>
      )}
    </div>
  );
}

/* ─── 局部小组件(不导出,避免 react-refresh 警告) ─── */

const INPUT =
  "w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none";

const DOOR_PRESETS = [
  { label: "入口", color: "#15803D" },
  { label: "出口", color: "#B91C1C" },
  { label: "安全通道", color: "#15803D" },
  { label: "贵宾通道", color: "#B45309" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-3 border-t border-[#F0F0F0] first:border-t-0 first:pt-0">
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#6B7280] mb-1">{label}</span>
      {children}
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#6B7280] mb-1">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value) : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className={INPUT}
      />
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[#6B7280]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-[#E9E9E9] cursor-pointer p-0.5"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 px-1.5 py-1 text-[11px] rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none font-mono"
        />
      </div>
    </div>
  );
}

function FontRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Row label="字体">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {FONT_STACKS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

function ImageRow({ dataUrl, onPick, onClear }: { dataUrl?: string; onPick: (dataUrl: string) => void; onClear: () => void }) {
  return (
    <div>
      <span className="block text-[11px] text-[#6B7280] mb-1">背景墙图片(可选)</span>
      <div className="flex items-center gap-2">
        <label className="px-2 py-1.5 text-[11px] rounded border border-[#E9E9E9] hover:border-[var(--party-primary)] cursor-pointer">
          选择图片
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onPick(String(reader.result));
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
          />
        </label>
        {dataUrl && (
          <button onClick={onClear} className="text-[11px] text-[#EF4444] hover:underline">
            清除
          </button>
        )}
      </div>
    </div>
  );
}

/** 把任意颜色字符串规整为 <input type=color> 接受的 #rrggbb(非法回退黑色) */
function normalizeHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : "#000000";
}
