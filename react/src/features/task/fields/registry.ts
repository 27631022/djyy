import type { TaskField, TaskFieldType } from "../api";
import type { FieldTypeDef } from "./types";
import { textField } from "./text";
import { textareaField } from "./textarea";
import { numberField } from "./number";
import { dateField } from "./date";
import { selectField } from "./select";
import { fileField } from "./file";
import { imageField } from "./image";
import { richtextField } from "./richtext";
import { doclinkField } from "./doclink";

/**
 * 字段类型注册表 —— 集中所有字段类型定义。
 * 加新类型 = 在此 import + 塞进 ALL 数组(再加 api.ts 联合 + 后端校验规则)。
 */
const ALL: FieldTypeDef[] = [
  textField,
  textareaField,
  numberField,
  dateField,
  selectField,
  fileField,
  imageField,
  richtextField,
  doclinkField,
];

export const FIELD_TYPES: Record<TaskFieldType, FieldTypeDef> = Object.fromEntries(
  ALL.map((d) => [d.type, d]),
) as Record<TaskFieldType, FieldTypeDef>;

/** 按 order 排好序的列表(palette / 类型下拉用) */
export const FIELD_TYPE_LIST: FieldTypeDef[] = [...ALL].sort((a, b) => a.order - b.order);

/** 取某类型的定义;未知类型兜底为单行文本(防脏数据崩溃) */
export function getFieldType(type: TaskFieldType): FieldTypeDef {
  return FIELD_TYPES[type] ?? textField;
}

/** 类型显示名 */
export function fieldTypeLabel(type: TaskFieldType): string {
  return getFieldType(type).label;
}

/**
 * 设计期校验单个字段定义。先查通用「显示名必填」,再委托该类型的 validate。
 * 返回 { label, hint }(用于派发前拦截 + 指引),完整则 null。
 */
export function validateFieldDef(f: TaskField): { label: string; hint: string } | null {
  if (!f.label || !f.label.trim())
    return { label: "未命名字段", hint: "点该字段卡片标题处输入字段名" };
  const msg = getFieldType(f.type).validate?.(f);
  return msg ? { label: f.label, hint: msg } : null;
}

/** 一组字段里第一个有问题的(空显示名 / 下拉缺选项…);无则 null。 */
export function findFieldIssue(fields: TaskField[]): { label: string; hint: string } | null {
  for (const f of fields) {
    const issue = validateFieldDef(f);
    if (issue) return issue;
  }
  return null;
}
