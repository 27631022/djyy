import { TASK_FIELD_TYPE_LABEL, type TaskField, type TaskFieldType } from "../../api";

/** 下一个自动字段 code(field_N,用户不可见、不可填) */
export function nextFieldCode(fields: TaskField[]): string {
  let max = 0;
  for (const f of fields) {
    const m = /^field_(\d+)$/.exec(f.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `field_${max + 1}`;
}

/** 新建一个指定类型的字段(默认显示名 = 类型名,排末位) */
export function makeField(type: TaskFieldType, fields: TaskField[]): TaskField {
  return {
    code: nextFieldCode(fields),
    label: TASK_FIELD_TYPE_LABEL[type],
    type,
    required: false,
    sortOrder: fields.length,
  };
}

/** 按类型裁掉无关属性(切换类型时「改不了的就清掉重来」) */
export function cleanForType(f: TaskField): TaskField {
  const base: TaskField = {
    code: f.code,
    label: f.label,
    type: f.type,
    required: f.required,
    sortOrder: f.sortOrder,
  };
  if (f.group) {
    base.group = f.group;
    base.groupLabel = f.groupLabel;
  }
  if (f.placeholder) base.placeholder = f.placeholder;
  if (f.description) base.description = f.description;
  if (f.type === "select") base.dictCode = f.dictCode;
  if (f.type === "number") {
    base.min = f.min;
    base.max = f.max;
    base.unit = f.unit;
    base.decimals = f.decimals;
  }
  if (f.type === "file" || f.type === "image") {
    base.maxFiles = f.maxFiles;
    base.accept = f.accept;
  }
  return base;
}

/** 重新分配 sortOrder = 数组下标 */
export function reindex(fields: TaskField[]): TaskField[] {
  return fields.map((f, i) => ({ ...f, sortOrder: i }));
}
