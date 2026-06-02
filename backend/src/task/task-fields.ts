import { BadRequestException } from '@nestjs/common';

/**
 * 任务表单字段定义(存于 TaskTemplate.fields / Task.fields 的 JSON,非数据库表)。
 * 结构与 UserCustomField 一脉相承,额外支持:
 *   - 分组 group/groupLabel(如「报送党员数据」大组套「男党员数 / 女党员数」)
 *   - 文件 file / 图片 image / 富文本 richtext / 在线文档 doclink 字段类型
 *   - 数字约束 min/max/unit/decimals
 *
 * 字段类型差异集中到下方 FIELD_SPECS 注册表(每种类型一条 normalize),
 * 与前端 fields/ 注册表对称:加一个新字段类型 = 这里加一条 spec + api.ts 的 TaskFieldType 联合补一项
 *   + 前端 fields/<type>.tsx 加实现并在 registry 注册。
 * 此处只校验字段「定义」;字段「值」的校验在 P2 填报时做(参考 user-custom-field 的 validateAndSanitize)。
 */
export type TaskFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'file'
  | 'image'
  | 'richtext'
  | 'doclink';

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
  /** select:自定义下拉选项(直接填内容,不关联字典) */
  options?: string[];
  /** doclink:在线文档链接地址(填报时点「填写」打开) */
  link?: string;
  /** number 约束 */
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  /** file / image 约束 */
  maxFiles?: number;
  accept?: string;
}

/**
 * 某字段类型的「专属属性」规范化 + 校验:从 raw 读、写到 field;非法抛 BadRequestException。
 * 通用属性(code/label/type/group/placeholder/description/required/sortOrder)由 normalizeFieldDefs
 * 统一处理,这里只管该类型独有的那几项。无专属属性的类型给空对象即可。
 */
interface FieldTypeSpec {
  normalize?(raw: Record<string, unknown>, field: TaskField, code: string): void;
}

/** 字段类型注册表 —— 每种类型一条;加新类型在此加一条 spec。 */
const FIELD_SPECS: Record<TaskFieldType, FieldTypeSpec> = {
  text: {},
  textarea: {},
  number: {
    normalize(raw, field, code) {
      if (typeof raw.min === 'number') field.min = raw.min;
      if (typeof raw.max === 'number') field.max = raw.max;
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        throw new BadRequestException(`字段 "${code}" 的最小值大于最大值`);
      if (typeof raw.unit === 'string' && raw.unit.trim()) field.unit = raw.unit.trim();
      if (typeof raw.decimals === 'number' && raw.decimals >= 0)
        field.decimals = Math.floor(raw.decimals);
    },
  },
  date: {},
  select: {
    normalize(raw, field, code) {
      const opts = Array.isArray(raw.options)
        ? [...new Set(raw.options.map((o) => String(o).trim()).filter(Boolean))]
        : [];
      if (opts.length === 0)
        throw new BadRequestException(`下拉字段 "${code}" 至少要有一个选项`);
      field.options = opts;
    },
  },
  file: {
    normalize(raw, field) {
      if (typeof raw.maxFiles === 'number' && raw.maxFiles > 0)
        field.maxFiles = Math.floor(raw.maxFiles);
      if (typeof raw.accept === 'string' && raw.accept.trim())
        field.accept = raw.accept.trim();
    },
  },
  image: {
    normalize(raw, field) {
      if (typeof raw.maxFiles === 'number' && raw.maxFiles > 0)
        field.maxFiles = Math.floor(raw.maxFiles);
    },
  },
  richtext: {},
  doclink: {
    normalize(raw, field) {
      if (typeof raw.link === 'string' && raw.link.trim()) field.link = raw.link.trim();
    },
  },
};

/** 支持的字段类型(由注册表键派生;extraction 等处用 .includes 校验)。 */
export const TASK_FIELD_TYPES = Object.keys(FIELD_SPECS) as TaskFieldType[];

const CODE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * 校验并规整一组字段「定义」。返回干净的 TaskField[](按 sortOrder 升序、重排为 0..n)。
 * - code 必填、合法(小写字母开头,字母/数字/下划线)、组内唯一
 * - label 必填;type 合法
 * - 各类型专属属性 / 校验委托给 FIELD_SPECS[type].normalize(如下拉至少一个选项)
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

    // 类型专属属性 / 校验
    FIELD_SPECS[type].normalize?.(f, field, code);

    out.push(field);
  });

  out.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  out.forEach((f, i) => (f.sortOrder = i));
  return out;
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
