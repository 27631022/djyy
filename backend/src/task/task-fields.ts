import { BadRequestException } from '@nestjs/common';

/**
 * 任务表单字段定义(存于 TaskTemplate.fields / Task.fields 的 JSON,非数据库表)。
 * 结构与 UserCustomField 一脉相承,额外支持:
 *   - 分组 group/groupLabel(如「报送党员数据」大组套「男党员数 / 女党员数」)
 *   - 文件 file / 图片 image / 富文本 richtext / 在线文档 doclink 字段类型
 *   - 数字约束 min/max/unit/decimals
 *
 * 此处只校验字段「定义」;字段「值」的校验在 P2 填报时做(参考 user-custom-field 的 validateAndSanitize)。
 */
export const TASK_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'file',
  'image',
  'richtext',
  'doclink',
] as const;

export type TaskFieldType = (typeof TASK_FIELD_TYPES)[number];

export interface TaskField {
  code: string;
  label: string;
  type: TaskFieldType;
  group?: string;
  groupLabel?: string;
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  description?: string;
  /** select:关联 Dictionary.code(值存 DictItem.code) */
  dictCode?: string;
  /** number 约束 */
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  /** file / image 约束 */
  maxFiles?: number;
  accept?: string;
}

const CODE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * 校验并规整一组字段「定义」。返回干净的 TaskField[](按 sortOrder 升序、重排为 0..n)。
 * - code 必填、合法(小写字母开头,字母/数字/下划线)、组内唯一
 * - label 必填;type 合法
 * - select 必须有 dictCode(存在性由调用方用 DictionaryService 另行校验)
 * 不合法直接抛 BadRequestException。
 */
export function normalizeFieldDefs(raw: unknown): TaskField[] {
  if (!Array.isArray(raw)) throw new BadRequestException('fields 必须是数组');
  const arr: unknown[] = raw;
  if (arr.length === 0) throw new BadRequestException('至少要有一个字段');
  if (arr.length > 200) throw new BadRequestException('字段过多(上限 200)');

  const seen = new Set<string>();
  const out: TaskField[] = [];

  arr.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      throw new BadRequestException(`第 ${idx + 1} 个字段格式错误`);
    }
    const f = item as Record<string, unknown>;
    const code = typeof f.code === 'string' ? f.code.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    const type = f.type as TaskFieldType;

    if (!CODE_RE.test(code)) {
      throw new BadRequestException(
        `字段代码 "${code || '(空)'}" 不合法:需小写字母开头,仅含字母/数字/下划线`,
      );
    }
    if (seen.has(code)) throw new BadRequestException(`字段代码 "${code}" 重复`);
    seen.add(code);
    if (!label) throw new BadRequestException(`字段 "${code}" 缺少显示名`);
    if (!TASK_FIELD_TYPES.includes(type)) {
      throw new BadRequestException(`字段 "${code}" 的类型 "${String(type)}" 不支持`);
    }

    const field: TaskField = {
      code,
      label,
      type,
      required: f.required === true,
      sortOrder: Number.isFinite(f.sortOrder) ? Number(f.sortOrder) : idx,
    };

    const group = typeof f.group === 'string' ? f.group.trim() : '';
    if (group) {
      field.group = group;
      field.groupLabel =
        typeof f.groupLabel === 'string' && f.groupLabel.trim()
          ? f.groupLabel.trim()
          : group;
    }
    if (typeof f.placeholder === 'string' && f.placeholder.trim())
      field.placeholder = f.placeholder.trim();
    if (typeof f.description === 'string' && f.description.trim())
      field.description = f.description.trim();

    if (type === 'select') {
      const dictCode = typeof f.dictCode === 'string' ? f.dictCode.trim() : '';
      if (!dictCode)
        throw new BadRequestException(`下拉字段 "${code}" 必须指定字典(dictCode)`);
      field.dictCode = dictCode;
    }

    if (type === 'number') {
      if (typeof f.min === 'number') field.min = f.min;
      if (typeof f.max === 'number') field.max = f.max;
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        throw new BadRequestException(`字段 "${code}" 的最小值大于最大值`);
      if (typeof f.unit === 'string' && f.unit.trim()) field.unit = f.unit.trim();
      if (typeof f.decimals === 'number' && f.decimals >= 0)
        field.decimals = Math.floor(f.decimals);
    }

    if (type === 'file' || type === 'image') {
      if (typeof f.maxFiles === 'number' && f.maxFiles > 0)
        field.maxFiles = Math.floor(f.maxFiles);
      if (typeof f.accept === 'string' && f.accept.trim())
        field.accept = f.accept.trim();
    }

    out.push(field);
  });

  out.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  out.forEach((f, i) => (f.sortOrder = i));
  return out;
}

/** 取出 select 字段引用的所有 dictCode(去重),供调用方批量校验存在性 */
export function selectDictCodes(fields: TaskField[]): string[] {
  return [
    ...new Set(
      fields
        .filter((f) => f.type === 'select' && f.dictCode)
        .map((f) => f.dictCode as string),
    ),
  ];
}

/** 安全解析存库的 fields JSON 串 → TaskField[] */
export function parseFields(json: string): TaskField[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as TaskField[]) : [];
  } catch {
    return [];
  }
}
