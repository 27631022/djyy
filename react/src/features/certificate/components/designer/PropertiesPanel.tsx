import { useRef } from "react";
import { UploadIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  CircleElement,
  DecorBorderElement,
  DesignerElement,
  ImageElement,
  LineElement,
  QRCodeElement,
  RectElement,
  StampElement,
  TextElement,
  VariableField,
} from "../../lib/designerTypes";
import { FONT_STACKS } from "../../lib/designerUtils";

// 图片元素同样被 ×EXPORT_SCALE 超采样导出,放宽到 8MB 以容纳高清图(base64 进 designJson 存库)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface PropertiesPanelProps {
  selected: DesignerElement | null;
  onElementChange: (id: string, patch: Partial<DesignerElement>) => void;
  /** 当前荣誉类型策划后的变量集,用于文本元素的「插入变量」chip */
  variables: VariableField[];
}

export function PropertiesPanel({
  selected,
  onElementChange,
  variables,
}: PropertiesPanelProps) {
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
        <TextProps el={selected} onChange={onElementChange} variables={variables} />
      )}
      {selected.type === "rect" && (
        <RectProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "circle" && (
        <CircleProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "line" && (
        <LineProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "decor-border" && (
        <DecorBorderProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "image" && (
        <ImageProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "stamp" && (
        <StampProps el={selected} onChange={onElementChange} />
      )}
      {selected.type === "qrcode" && (
        <QRCodeProps el={selected} onChange={onElementChange} />
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
  variables,
}: {
  el: TextElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
  variables: VariableField[];
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  /** 在光标处插入变量占位符(无焦点时追加到末尾),发证时会被替换为实际值 */
  function insertToken(token: string) {
    const cur = el.text;
    const ta = taRef.current;
    const focused = ta !== null && document.activeElement === ta;
    const start = focused ? ta.selectionStart ?? cur.length : cur.length;
    const end = focused ? ta.selectionEnd ?? cur.length : cur.length;
    onChange(el.id, { text: cur.slice(0, start) + token + cur.slice(end) });
    // 受控 value 更新后把光标移到插入内容之后,方便接着打字
    const caret = start + token.length;
    requestAnimationFrame(() => {
      const node = taRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  return (
    <>
      <Section title="文本">
        <Field label="内容">
          <textarea
            ref={taRef}
            rows={3}
            value={el.text}
            onChange={(e) => onChange(el.id, { text: e.target.value })}
            className={`${inputCls} resize-none font-normal`}
          />
        </Field>
        {variables.length > 0 && (
          <div>
            <div className="text-[10px] text-[#9CA3AF] mb-1">
              插入变量(可放在文字中间,发证时替换为实际值)
            </div>
            <div className="flex flex-wrap gap-1">
              {variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertToken(v.defaultValue)}
                  title={`插入 ${v.defaultValue}`}
                  className="px-1.5 py-0.5 text-[10px] rounded border border-[#E9E9E9] text-[#6B7280] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)] hover:bg-[#FFF7F8] transition-colors"
                >
                  + {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>
      <Section title="字体">
        <Field label="字体">
          <select
            value={el.fontFamily}
            onChange={(e) => onChange(el.id, { fontFamily: e.target.value })}
            className={inputCls}
          >
            {FONT_STACKS.map((f) => (
              <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
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

/* ─── 线属性 ─── */

function LineProps({
  el,
  onChange,
}: {
  el: LineElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="外观">
      <Field label="颜色">
        <ColorInput
          value={el.color}
          onChange={(v) => onChange(el.id, { color: v })}
        />
      </Field>
      <Field label="粗细 px">
        <NumberInput
          min={1}
          max={30}
          value={el.strokeWidth}
          onChange={(v) => onChange(el.id, { strokeWidth: v })}
        />
      </Field>
      <button
        type="button"
        onClick={() => onChange(el.id, { dashed: !el.dashed })}
        className={btnToggle(el.dashed)}
      >
        {el.dashed ? "虚线" : "实线"}
      </button>
      <p className="text-[10px] text-[#9CA3AF] mt-1">
        默认水平,需要竖线/斜线 → 旋转 90° / 45°
      </p>
    </Section>
  );
}

/* ─── 装饰边框属性 ─── */

function DecorBorderProps({
  el,
  onChange,
}: {
  el: DecorBorderElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="外观">
      <Field label="颜色">
        <ColorInput
          value={el.color}
          onChange={(v) => onChange(el.id, { color: v })}
        />
      </Field>
      <Field label="粗细 px">
        <NumberInput
          min={1}
          max={20}
          value={el.strokeWidth}
          onChange={(v) => onChange(el.id, { strokeWidth: v })}
        />
      </Field>
      <Field label="样式">
        <div className="grid grid-cols-3 gap-1">
          {(["simple", "double", "ornate"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChange(el.id, { variant: v })}
              className={btnToggle(el.variant === v)}
            >
              {v === "simple" ? "单线" : v === "double" ? "双线" : "花角"}
            </button>
          ))}
        </div>
      </Field>
    </Section>
  );
}

/* ─── 图片属性(含上传) ─── */

function ImageProps({
  el,
  onChange,
}: {
  el: ImageElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        `图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB,请压缩后再上传`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange(el.id, { dataUrl: reader.result });
      }
    };
    reader.onerror = () => toast.error("读取图片失败");
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <Section title="图片">
      {el.dataUrl ? (
        <div className="relative rounded border border-[#E9E9E9] overflow-hidden bg-[#F7F8FA]">
          <img
            src={el.dataUrl}
            alt="预览"
            className="w-full h-24 object-contain"
          />
          <button
            onClick={() => onChange(el.id, { dataUrl: "" })}
            className="absolute top-1 right-1 p-1.5 rounded bg-white/90 border border-[#E9E9E9] hover:bg-[#FEE2E2] hover:border-[#EF4444] text-[#6B7280] hover:text-[#EF4444]"
            title="移除图片"
          >
            <TrashIcon className="w-3 h-3" />
          </button>
        </div>
      ) : null}
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-[#E9E9E9] hover:border-[var(--party-primary)] hover:bg-[#FFF7F8] text-xs text-[#6B7280] hover:text-[var(--party-primary)]"
      >
        <UploadIcon className="w-3.5 h-3.5" />
        {el.dataUrl ? "更换图片" : "上传图片"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      <Field label="填充方式">
        <select
          value={el.fillMode}
          onChange={(e) =>
            onChange(el.id, {
              fillMode: e.target.value as ImageElement["fillMode"],
            })
          }
          className={inputCls}
        >
          <option value="contain">contain 完整显示</option>
          <option value="cover">cover 铺满裁切</option>
          <option value="stretch">stretch 拉伸</option>
        </select>
      </Field>
    </Section>
  );
}

/* ─── 印章属性 ─── */

function StampProps({
  el,
  onChange,
}: {
  el: StampElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="印章">
      <Field label="顶部弧形文字">
        <input
          type="text"
          value={el.text}
          onChange={(e) => onChange(el.id, { text: e.target.value })}
          placeholder="如:中共党建益友委员会"
          className={inputCls}
        />
      </Field>
      <Field label="中段小字 (如证书专用章)">
        <input
          type="text"
          value={el.centerText}
          onChange={(e) => onChange(el.id, { centerText: e.target.value })}
          placeholder="如:证书专用章"
          className={inputCls}
        />
      </Field>
      <Field label="底部弧形文字 (最细最小)">
        <input
          type="text"
          value={el.bottomText ?? ""}
          onChange={(e) => onChange(el.id, { bottomText: e.target.value })}
          placeholder="如:编号 / 日期 / 落款"
          className={inputCls}
        />
      </Field>
      <Field label="颜色">
        <ColorInput
          value={el.color}
          onChange={(v) => onChange(el.id, { color: v })}
        />
      </Field>
      <Field label="边框粗细">
        <NumberInput
          min={1}
          max={20}
          value={el.strokeWidth}
          onChange={(v) => onChange(el.id, { strokeWidth: v })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="顶弧字号 (0=自动)">
          <NumberInput
            min={0}
            max={60}
            value={el.topTextFontSize ?? 0}
            onChange={(v) => onChange(el.id, { topTextFontSize: v })}
          />
        </Field>
        <Field label="顶弧距边 px (负=外移)">
          <NumberInput
            min={-30}
            max={40}
            value={el.topTextPadding ?? 2}
            onChange={(v) => onChange(el.id, { topTextPadding: v })}
          />
        </Field>
        <Field label="中段字号 (0=自动)">
          <NumberInput
            min={0}
            max={40}
            value={el.centerTextFontSize ?? 0}
            onChange={(v) => onChange(el.id, { centerTextFontSize: v })}
          />
        </Field>
        <Field label="(占位)">
          <div className="h-[30px]" />
        </Field>
        <Field label="底弧字号 (0=自动)">
          <NumberInput
            min={0}
            max={40}
            value={el.bottomTextFontSize ?? 0}
            onChange={(v) => onChange(el.id, { bottomTextFontSize: v })}
          />
        </Field>
        <Field label="底弧距边 px (负=外移)">
          <NumberInput
            min={-30}
            max={40}
            value={el.bottomTextPadding ?? 2}
            onChange={(v) => onChange(el.id, { bottomTextPadding: v })}
          />
        </Field>
      </div>
      <Field label="中心图案">
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { v: "none", label: "无" },
              { v: "star", label: "五角星" },
              { v: "emblem", label: "党徽" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => onChange(el.id, { centerPattern: opt.v })}
              className={btnToggle(el.centerPattern === opt.v)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
    </Section>
  );
}

/* ─── 二维码属性 ─── */

function QRCodeProps({
  el,
  onChange,
}: {
  el: QRCodeElement;
  onChange: (id: string, patch: Partial<DesignerElement>) => void;
}) {
  return (
    <Section title="二维码">
      <Field label="内容(URL / 文本)">
        <textarea
          rows={2}
          value={el.content}
          onChange={(e) => onChange(el.id, { content: e.target.value })}
          placeholder="https://djyy.example.com/verify/SAMPLE"
          className={`${inputCls} resize-none font-mono`}
        />
      </Field>
      <Field label="前景色">
        <ColorInput
          value={el.color}
          onChange={(v) => onChange(el.id, { color: v })}
        />
      </Field>
      <Field label="背景色">
        <ColorInput
          value={el.background}
          onChange={(v) => onChange(el.id, { background: v })}
        />
      </Field>
      <p className="text-[10px] text-[#9CA3AF]">
        V2 发证时此处会自动替换为验证 URL
      </p>
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
    case "line":
      return "线";
    case "decor-border":
      return "装饰边框";
    case "image":
      return "图片";
    case "stamp":
      return "印章";
    case "qrcode":
      return "二维码";
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
