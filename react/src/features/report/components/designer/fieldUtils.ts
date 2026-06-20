import type { ReportField, ReportFieldType } from "../../api";
import { getFieldType } from "../../fields";

/** 下一个自动字段 code(field_N,用户不可见、不可填) */
export function nextFieldCode(fields: ReportField[]): string {
  let max = 0;
  for (const f of fields) {
    const m = /^field_(\d+)$/.exec(f.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `field_${max + 1}`;
}

/** 新建一个指定类型的字段(默认显示名 = 类型名,排末位;类型默认值由注册表给) */
export function makeField(type: ReportFieldType, fields: ReportField[]): ReportField {
  const def = getFieldType(type);
  return {
    code: nextFieldCode(fields),
    label: def.label,
    type,
    required: false,
    sortOrder: fields.length,
    ...def.makeDefaults?.(),
  };
}

/** 切换类型时裁掉无关属性:通用属性 + 该类型 ownProps + 占位(按 hasPlaceholder)。 */
export function cleanForType(f: ReportField): ReportField {
  const def = getFieldType(f.type);
  const base: ReportField = {
    code: f.code,
    label: f.label,
    type: f.type,
    required: f.required,
    sortOrder: f.sortOrder,
  };
  if (f.role) base.role = f.role;
  if (f.description) base.description = f.description;
  if (def.hasPlaceholder && f.placeholder) base.placeholder = f.placeholder;
  for (const k of def.ownProps ?? []) {
    const v = f[k];
    if (v !== undefined) (base as unknown as Record<string, unknown>)[k] = v;
  }
  return base;
}

/** 重新分配 sortOrder = 数组下标 */
export function reindex(fields: ReportField[]): ReportField[] {
  return fields.map((f, i) => ({ ...f, sortOrder: i }));
}
