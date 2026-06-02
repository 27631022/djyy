import { Settings2Icon, PlusIcon, XIcon } from "lucide-react";
import { TASK_FIELD_TYPE_LABEL, type TaskField, type TaskFieldType } from "../../api";

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

/** 文件类型多选预设(点选 chip);accept 存逗号分隔扩展名 */
const FILE_ACCEPT_PRESETS: { label: string; exts: string[] }[] = [
  { label: "PDF", exts: [".pdf"] },
  { label: "Word", exts: [".doc", ".docx"] },
  { label: "Excel", exts: [".xls", ".xlsx"] },
  { label: "PPT", exts: [".ppt", ".pptx"] },
  { label: "图片", exts: [".jpg", ".jpeg", ".png"] },
  { label: "压缩包", exts: [".zip", ".rar"] },
];

const setInp =
  "w-full px-2.5 py-1.5 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/**
 * 右栏:选中字段的属性面板。
 * 不含「显示名 / 必填」—— 这两项已在画布卡片上(就地改名 + 必填开关),不重复。
 * 不含「分组名」—— 分组由画布容器结构决定。下拉为自定义选项,不关联字典。
 */
export function PropertiesPanel({
  field: f,
  onPatch,
}: {
  field: TaskField | null;
  onPatch: (code: string, partial: Partial<TaskField>) => void;
}) {
  if (!f) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4 text-[#9CA3AF]">
        <Settings2Icon className="w-7 h-7" />
        <div className="text-[13px]">点中间的字段卡片,在这里编辑它的属性</div>
      </div>
    );
  }
  const patch = (p: Partial<TaskField>) => onPatch(f.code, p);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#172033]">
        <Settings2Icon className="w-4 h-4 text-[var(--party-primary)]" />
        字段属性
        <span className="text-[11px] font-normal text-[#9CA3AF]">· {TASK_FIELD_TYPE_LABEL[f.type]}</span>
      </div>

      <Row label="类型">
        <select
          value={f.type}
          onChange={(e) => patch({ type: e.target.value as TaskFieldType })}
          className={setInp}
        >
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {TASK_FIELD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Row>

      {f.type === "doclink" ? (
        <Row label="链接地址" hint="填报时点「填写」打开此链接">
          <input
            value={f.link ?? ""}
            onChange={(e) => patch({ link: e.target.value })}
            placeholder="https://…"
            className={setInp}
          />
        </Row>
      ) : f.type !== "file" && f.type !== "image" ? (
        <Row label="提示 / 占位">
          <input
            value={f.placeholder ?? ""}
            onChange={(e) => patch({ placeholder: e.target.value })}
            className={setInp}
          />
        </Row>
      ) : null}

      <Row label="说明">
        <input
          value={f.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
          className={setInp}
        />
      </Row>

      {f.type === "select" && (
        <Row label="下拉选项" hint="自定义内容,可增删">
          <OptionsEditor options={f.options ?? []} onChange={(opts) => patch({ options: opts })} />
        </Row>
      )}

      {f.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="最小值">
            <NumIn value={f.min} onChange={(v) => patch({ min: v })} />
          </Row>
          <Row label="最大值">
            <NumIn value={f.max} onChange={(v) => patch({ max: v })} />
          </Row>
          <Row label="单位">
            <input
              value={f.unit ?? ""}
              onChange={(e) => patch({ unit: e.target.value })}
              placeholder="如 人"
              className={setInp}
            />
          </Row>
          <Row label="小数位">
            <NumIn value={f.decimals} onChange={(v) => patch({ decimals: v })} />
          </Row>
        </div>
      )}

      {(f.type === "file" || f.type === "image") && (
        <Row label="最多个数" hint="留空 = 不限">
          <NumIn value={f.maxFiles} onChange={(v) => patch({ maxFiles: v })} placeholder="不限" />
        </Row>
      )}

      {f.type === "file" && (
        <Row label="允许的文件类型" hint="点选,可多选">
          <AcceptChips accept={f.accept ?? ""} onChange={(a) => patch({ accept: a })} />
        </Row>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`选项 ${i + 1}`}
            className={setInp}
          />
          <button
            type="button"
            title="删除选项"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="p-1 rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-[#dce4ef] text-[12px] text-[#667085] hover:border-[var(--party-primary)] hover:text-[var(--party-primary)]"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        添加选项
      </button>
    </div>
  );
}

function AcceptChips({ accept, onChange }: { accept: string; onChange: (a: string) => void }) {
  const set = new Set(
    accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  function toggle(exts: string[]) {
    const all = exts.every((e) => set.has(e));
    const next = new Set(set);
    if (all) exts.forEach((e) => next.delete(e));
    else exts.forEach((e) => next.add(e));
    onChange([...next].join(","));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILE_ACCEPT_PRESETS.map((p) => {
        const on = p.exts.every((e) => set.has(e));
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => toggle(p.exts)}
            className={`px-2 py-1 rounded-full text-[12px] border transition-colors ${
              on
                ? "border-[var(--party-primary)] bg-party-soft text-[var(--party-primary)] font-bold"
                : "border-[#dce4ef] bg-white text-[#475467] hover:border-[var(--party-primary)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      {set.size === 0 && <span className="text-[11px] text-[#9CA3AF] self-center">未选 = 任意类型</span>}
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
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={setInp}
    />
  );
}
