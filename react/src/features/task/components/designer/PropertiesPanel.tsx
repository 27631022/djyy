import { Settings2Icon } from "lucide-react";
import type { TaskField, TaskFieldType } from "../../api";
import { getFieldType, fieldTypeLabel, FIELD_TYPE_LIST } from "../../fields";
import { PROP_INPUT } from "../../fields/shared";
import { PropRow } from "../../fields/widgets";

/**
 * 右栏:选中字段的属性面板(通用壳)。
 * 通用项:类型下拉 / 提示占位(仅 hasPlaceholder 的类型显示)/ 说明;
 * 类型「专属」属性(下拉选项 / 数字范围 / 文件类型 / 链接地址…)委托给该类型注册表里的 Properties。
 * 不含「显示名 / 必填」—— 这两项在画布卡片上(就地改名 + 必填开关),不重复。
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
  const def = getFieldType(f.type);
  const patch = (p: Partial<TaskField>) => onPatch(f.code, p);
  const TypeProperties = def.Properties;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#172033]">
        <Settings2Icon className="w-4 h-4 text-[var(--party-primary)]" />
        字段属性
        <span className="text-[11px] font-normal text-[#9CA3AF]">· {fieldTypeLabel(f.type)}</span>
      </div>

      <PropRow label="类型">
        <select
          value={f.type}
          onChange={(e) => patch({ type: e.target.value as TaskFieldType })}
          className={PROP_INPUT}
        >
          {FIELD_TYPE_LIST.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
      </PropRow>

      {def.hasPlaceholder && (
        <PropRow label="提示 / 占位">
          <input
            value={f.placeholder ?? ""}
            onChange={(e) => patch({ placeholder: e.target.value })}
            className={PROP_INPUT}
          />
        </PropRow>
      )}

      {/* 类型专属属性(由注册表提供) */}
      {TypeProperties && <TypeProperties field={f} patch={patch} />}

      <PropRow label="说明">
        <input
          value={f.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
          className={PROP_INPUT}
        />
      </PropRow>
    </div>
  );
}
