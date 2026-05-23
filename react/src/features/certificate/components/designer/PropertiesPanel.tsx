import type {
  CircleElement,
  DesignerElement,
  RectElement,
  TextElement,
} from "../../lib/designerTypes";

interface PropertiesPanelProps {
  selected: DesignerElement | null;
  onElementChange: (id: string, patch: Partial<DesignerElement>) => void;
}

export function PropertiesPanel({ selected, onElementChange }: PropertiesPanelProps) {
  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[#9CA3AF]">
        <p>选中画布中的元素后</p>
        <p>这里显示属性设置</p>
        <p className="mt-3 text-[10px]">
          画布尺寸 / 底色 / 底图
          <br />
          在左侧「背景」tab 设置
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 基础属性 */}
      <Section title={`${typeLabel(selected.type)} 属性`}>
        <Field label="名称">
          <input
            type="text"
            value={selected.name}
            onChange={(e) =>
              onElementChange(selected.id, { name: e.target.value })
            }
            className={inputCls}
          />
        </Field>
      </Section>

      {/* 位置尺寸 */}
      <Section title="位置 / 尺寸">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <NumberInput
              value={selected.x}
              onChange={(v) => onElementChange(selected.id, { x: v })}
            />
          </Field>
          <Field label="Y">
            <NumberInput
              value={selected.y}
              onChange={(v) => onElementChange(selected.id, { y: v })}
            />
          </Field>
          <Field label="宽">
            <NumberInput
              min={1}
              value={selected.width}
              onChange={(v) =>
                onElementChange(selected.id, { width: Math.max(1, v) })
              }
            />
          </Field>
          <Field label="高">
            <NumberInput
              min={1}
              value={selected.height}
              onChange={(v) =>
                onElementChange(selected.id, { height: Math.max(1, v) })
              }
            />
          </Field>
        </div>
        <Field label={`不透明度 (${Math.round(selected.opacity * 100)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={selected.opacity}
            onChange={(e) =>
              onElementChange(selected.id, { opacity: Number(e.target.value) })
            }
            className="w-full"
          />
        </Field>
      </Section>

      {/* 元素类型特有 */}
      {selected.type === "text" && (
        <TextProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "rect" && (
        <RectProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "circle" && (
        <CircleProps el={selected} onChange={onElementChange} />
      )}
    </div>
  );
}

/* ─── 公用片段 ─── */

const inputCls =
  "w-full px-2 py-1.5 text-xs rounded border border-[#E9E9E9] focus:border-[var(--party-primary)] focus:outline-none bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9CA3AF]">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={Math.round(value)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={inputCls}
    />
  );
}

function ColorInput({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 允许空字符串(无填充/无描边) */
  allowEmpty?: boolean;
}) {
  const isEmpty = !value;
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={isEmpty ? "#000000" : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-[#E9E9E9] cursor-pointer flex-shrink-0"
        disabled={isEmpty && allowEmpty}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={allowEmpty ? "无" : "#RRGGBB"}
        className={inputCls}
      />
      {allowEmpty && (
        <button
          onClick={() => onChange(isEmpty ? "#000000" : "")}
          className="px-1.5 py-0.5 text-[10px] rounded border border-[#E9E9E9] hover:bg-[#F7F8FA] flex-shrink-0"
          title={isEmpty ? "启用" : "清空"}
        >
          {isEmpty ? "启" : "清"}
        </button>
      )}
    </div>
  );
}

/* ─── 文本属性 ─── */

function TextProps({
  el,
  onChange,
}: {
  el: TextElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <>
      <Section title="文本">
        <Field label="内容">
          <textarea
            rows={3}
            value={el.text}
            onChange={(e) => onChange(el.id, { text: e.target.value })}
            className={`${inputCls} resize-none font-normal`}
          />
        </Field>
      </Section>
      <Section title="字体">
        <div className="grid grid-cols-2 gap-2">
          <Field label="字号 px">
            <NumberInput
              min={6}
              max={200}
              value={el.fontSize}
              onChange={(v) => onChange(el.id, { fontSize: v })}
            />
          </Field>
          <Field label="行高 ×">
            <NumberInput
              min={0.8}
              max={3}
              step={0.1}
              value={el.lineHeight}
              onChange={(v) => onChange(el.id, { lineHeight: v })}
            />
          </Field>
        </div>
        <Field label="颜色">
          <ColorInput
            value={el.color}
            onChange={(v) => onChange(el.id, { color: v })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              onChange(el.id, {
                fontWeight: el.fontWeight === "bold" ? "normal" : "bold",
              })
            }
            className={btnToggle(el.fontWeight === "bold")}
          >
            <span className="font-bold">B</span> 粗体
          </button>
          <button
            type="button"
            onClick={() =>
              onChange(el.id, {
                fontStyle: el.fontStyle === "italic" ? "normal" : "italic",
              })
            }
            className={btnToggle(el.fontStyle === "italic")}
          >
            <span className="italic">I</span> 斜体
          </button>
        </div>
        <Field label="对齐">
          <div className="grid grid-cols-3 gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onChange(el.id, { textAlign: a })}
                className={btnToggle(el.textAlign === a)}
              >
                {a === "left" ? "左" : a === "center" ? "中" : "右"}
              </button>
            ))}
          </div>
        </Field>
      </Section>
    </>
  );
}

/* ─── 矩形属性 ─── */

function RectProps({
  el,
  onChange,
}: {
  el: RectElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="外观">
      <Field label="填充">
        <ColorInput
          value={el.fill}
          onChange={(v) => onChange(el.id, { fill: v })}
          allowEmpty
        />
      </Field>
      <Field label="描边">
        <ColorInput
          value={el.stroke}
          onChange={(v) => onChange(el.id, { stroke: v })}
          allowEmpty
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="描边宽">
          <NumberInput
            min={0}
            max={20}
            value={el.strokeWidth}
            onChange={(v) => onChange(el.id, { strokeWidth: v })}
          />
        </Field>
        <Field label="圆角">
          <NumberInput
            min={0}
            max={200}
            value={el.borderRadius}
            onChange={(v) => onChange(el.id, { borderRadius: v })}
          />
        </Field>
      </div>
    </Section>
  );
}

/* ─── 圆形属性 ─── */

function CircleProps({
  el,
  onChange,
}: {
  el: CircleElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="外观">
      <Field label="填充">
        <ColorInput
          value={el.fill}
          onChange={(v) => onChange(el.id, { fill: v })}
          allowEmpty
        />
      </Field>
      <Field label="描边">
        <ColorInput
          value={el.stroke}
          onChange={(v) => onChange(el.id, { stroke: v })}
          allowEmpty
        />
      </Field>
      <Field label="描边宽">
        <NumberInput
          min={0}
          max={20}
          value={el.strokeWidth}
          onChange={(v) => onChange(el.id, { strokeWidth: v })}
        />
      </Field>
    </Section>
  );
}

/* ─── helpers ─── */

function typeLabel(t: DesignerElement["type"]): string {
  switch (t) {
    case "text":
      return "文本";
    case "rect":
      return "矩形";
    case "circle":
      return "圆形";
  }
}

function btnToggle(active: boolean): string {
  return [
    "py-1.5 text-xs rounded border transition-colors",
    active
      ? "border-[var(--party-primary)] bg-[#FFF7F8] text-[var(--party-primary)] font-medium"
      : "border-[#E9E9E9] text-[#6B7280] hover:border-[#9CA3AF]",
  ].join(" ");
}
