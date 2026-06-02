import { Settings2Icon } from "lucide-react";
import { TASK_FIELD_TYPE_LABEL, type TaskField, type TaskFieldType } from "../../api";

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

const setInp =
  "w-full px-2.5 py-1.5 text-[13px] border border-[#dce4ef] rounded-md bg-white focus:outline-none focus:border-[var(--party-primary)]";

/**
 * 右栏:选中字段的属性面板(替代原 ⚙ 弹窗)。
 * 不含「分组名」—— 分组已改为画布容器结构,不再按字段填名。
 */
export function PropertiesPanel({
  field: f,
  dicts,
  onPatch,
}: {
  field: TaskField | null;
  dicts: DictLite[];
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
      </div>

      <Row label="显示名">
        <input value={f.label} onChange={(e) => patch({ label: e.target.value })} className={setInp} />
      </Row>

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

      <label className="flex items-center gap-2 text-[13px] text-[#374151] cursor-pointer">
        <input
          type="checkbox"
          checked={f.required}
          onChange={(e) => patch({ required: e.target.checked })}
        />
        必填
      </label>

      <Row label="提示 / 占位">
        <input
          value={f.placeholder ?? ""}
          onChange={(e) => patch({ placeholder: e.target.value })}
          className={setInp}
        />
      </Row>
      <Row label="说明">
        <input
          value={f.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
          className={setInp}
        />
      </Row>

      {f.type === "select" && (
        <Row label="字典" hint="下拉选项来源,必选">
          <select
            value={f.dictCode ?? ""}
            onChange={(e) => patch({ dictCode: e.target.value })}
            className={`${setInp} ${!f.dictCode ? "border-amber-400" : ""}`}
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
        <div className="grid grid-cols-2 gap-2">
          <Row label="最多个数">
            <NumIn value={f.maxFiles} onChange={(v) => patch({ maxFiles: v })} />
          </Row>
          <Row label="接受类型">
            <input
              value={f.accept ?? ""}
              onChange={(e) => patch({ accept: e.target.value })}
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
