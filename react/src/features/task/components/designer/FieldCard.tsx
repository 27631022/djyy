import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVerticalIcon,
  CopyIcon,
  Trash2Icon,
  Settings2Icon,
} from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/components/ui/popover";
import { TASK_FIELD_TYPE_LABEL, type TaskField, type TaskFieldType } from "../../api";
import { FIELD_TYPE_ICONS } from "../fieldTypeIcons";

type DictLite = { id: string; code: string; name: string };

const TYPE_ORDER: TaskFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "file",
  "image",
  "richtext",
  "doclink",
];

const ctl =
  "w-full px-2.5 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white text-[#374151]";
const setInp =
  "w-full px-2 py-1.5 text-[13px] border border-[#E9E9E9] rounded-md focus:outline-none focus:border-[var(--party-primary)]";

/** 单个字段「所见即所得」卡片(可拖拽排序、就地改名、悬浮操作、⚙ 深度设置) */
export function FieldCard({
  field: f,
  selected,
  dicts,
  onSelect,
  onPatch,
  onDuplicate,
  onDelete,
}: {
  field: TaskField;
  selected: boolean;
  dicts: DictLite[];
  onSelect: () => void;
  onPatch: (partial: Partial<TaskField>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.code,
  });
  const Icon = FIELD_TYPE_ICONS[f.type];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={`group rounded-lg border bg-white px-3 py-2.5 ${
        isDragging ? "opacity-50 shadow-lg" : ""
      } ${
        selected
          ? "border-[var(--party-primary)] ring-1 ring-[var(--party-primary)]"
          : "border-[#E9E9E9] hover:border-[#D1D5DB]"
      }`}
    >
      {/* 顶部:手柄 + 标题(就地改名)+ 悬浮操作 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-[#C0C6D0] hover:text-[#6B7280] touch-none"
          title="拖动排序"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </button>
        <Icon className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
        <input
          value={f.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="点击输入字段名"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[#1A1A1A] border-b border-transparent focus:border-[var(--party-primary)] focus:outline-none py-0.5"
        />
        {f.required && <span className="text-[var(--party-primary)] text-sm">*</span>}

        <div
          className={`flex items-center gap-1.5 flex-shrink-0 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center gap-1 text-[11px] text-[#6B7280] cursor-pointer">
            <Switch
              checked={f.required}
              onCheckedChange={(v) => onPatch({ required: v })}
              className="scale-90"
            />
            必填
          </label>
          <IconBtn title="复制" onClick={onDuplicate}>
            <CopyIcon className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="删除" danger onClick={onDelete}>
            <Trash2Icon className="w-3.5 h-3.5" />
          </IconBtn>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="更多设置"
                className="p-1 rounded text-[#6B7280] hover:bg-[#F0F0F0]"
              >
                <Settings2Icon className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3" onClick={(e) => e.stopPropagation()}>
              <SettingsPanel field={f} dicts={dicts} onPatch={onPatch} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* 所见即所得:真实控件预览(只读) */}
      <div className="mt-2 pl-6">
        <PreviewControl field={f} dicts={dicts} />
        {f.description && <p className="text-[11px] text-[#9CA3AF] mt-1">{f.description}</p>}
      </div>
    </div>
  );
}

function IconBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1 rounded ${
        danger ? "text-[#9CA3AF] hover:text-red-600 hover:bg-red-50" : "text-[#6B7280] hover:bg-[#F0F0F0]"
      }`}
    >
      {children}
    </button>
  );
}

/** 中栏所见即所得控件(只读预览,展示填报人看到的样子) */
function PreviewControl({ field: f, dicts }: { field: TaskField; dicts: DictLite[] }) {
  switch (f.type) {
    case "number":
      return (
        <div className="flex items-center gap-1.5">
          <input disabled placeholder={f.placeholder || "请输入数字"} className={`${ctl} max-w-[200px]`} />
          {f.unit && <span className="text-[13px] text-[#6B7280]">{f.unit}</span>}
        </div>
      );
    case "date":
      return <input disabled placeholder="yyyy / mm / dd" className={`${ctl} max-w-[200px]`} />;
    case "textarea":
      return <div className={`${ctl} h-14 text-[#9CA3AF]`}>{f.placeholder || "多行文本…"}</div>;
    case "richtext":
      return (
        <div className="border border-[#E5E7EB] rounded-md overflow-hidden bg-white">
          <div className="flex gap-1.5 px-2 py-1 border-b border-[#F0F0F0] text-[#C0C6D0] text-xs">
            <b>B</b>
            <i>I</i>
            <span>•</span>
            <span>≡</span>
          </div>
          <div className="px-2.5 py-2 h-12 text-[13px] text-[#9CA3AF]">{f.placeholder || "富文本内容…"}</div>
        </div>
      );
    case "select": {
      const dict = dicts.find((d) => d.code === f.dictCode);
      return (
        <div className={`${ctl} max-w-[260px] flex items-center justify-between text-[#9CA3AF]`}>
          <span>{f.placeholder || "请选择"}</span>
          <span className="text-[11px]">{dict ? dict.name : f.dictCode ? `字典:${f.dictCode}` : "未选字典"} ▾</span>
        </div>
      );
    }
    case "file":
    case "image":
      return (
        <div className="border border-dashed border-[#D1D5DB] rounded-md py-3 text-center text-[13px] text-[#9CA3AF]">
          点击上传{f.type === "image" ? "图片" : "文件"}
          {f.maxFiles ? `(最多 ${f.maxFiles} 个)` : ""}
        </div>
      );
    case "doclink":
      return (
        <div className="border border-dashed border-[#D1D5DB] rounded-md py-2.5 text-center text-[13px] text-[#9CA3AF]">
          在线文档(群晖,后续接入)
        </div>
      );
    default:
      return <input disabled placeholder={f.placeholder || "请输入"} className={ctl} />;
  }
}

/** ⚙ 深度设置(就近 Popover):类型 + 分组 + 提示 + 说明 + 类型特有 */
function SettingsPanel({
  field: f,
  dicts,
  onPatch,
}: {
  field: TaskField;
  dicts: DictLite[];
  onPatch: (partial: Partial<TaskField>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[13px] font-semibold text-[#374151]">字段设置</div>

      <Row label="类型">
        <select
          value={f.type}
          onChange={(e) => onPatch({ type: e.target.value as TaskFieldType })}
          className={setInp}
        >
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {TASK_FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Row>

      <Row label="分组名" hint="同名归一组">
        <input
          value={f.groupLabel ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onPatch({ group: v || undefined, groupLabel: v || undefined });
          }}
          placeholder="如 报送党员数据"
          className={setInp}
        />
      </Row>

      <Row label="提示 / 占位">
        <input
          value={f.placeholder ?? ""}
          onChange={(e) => onPatch({ placeholder: e.target.value })}
          className={setInp}
        />
      </Row>
      <Row label="说明">
        <input
          value={f.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value })}
          className={setInp}
        />
      </Row>

      {f.type === "select" && (
        <Row label="字典" hint="下拉来源">
          <select
            value={f.dictCode ?? ""}
            onChange={(e) => onPatch({ dictCode: e.target.value })}
            className={setInp}
          >
            <option value="">-- 选择字典 --</option>
            {dicts.map((d) => (
              <option key={d.id} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </Row>
      )}

      {f.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="最小值">
            <NumIn value={f.min} onChange={(v) => onPatch({ min: v })} />
          </Row>
          <Row label="最大值">
            <NumIn value={f.max} onChange={(v) => onPatch({ max: v })} />
          </Row>
          <Row label="单位">
            <input
              value={f.unit ?? ""}
              onChange={(e) => onPatch({ unit: e.target.value })}
              placeholder="如 人"
              className={setInp}
            />
          </Row>
          <Row label="小数位">
            <NumIn value={f.decimals} onChange={(v) => onPatch({ decimals: v })} />
          </Row>
        </div>
      )}

      {(f.type === "file" || f.type === "image") && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="最多文件">
            <NumIn value={f.maxFiles} onChange={(v) => onPatch({ maxFiles: v })} />
          </Row>
          <Row label="接受类型">
            <input
              value={f.accept ?? ""}
              onChange={(e) => onPatch({ accept: e.target.value })}
              placeholder=".pdf,.docx"
              className={setInp}
            />
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[12px] font-medium text-[#4B5563]">{label}</span>
        {hint && <span className="text-[10px] text-[#9CA3AF]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function NumIn({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={setInp}
    />
  );
}
