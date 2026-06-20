import { BadRequestException } from '@nestjs/common';

/**
 * 报送表单字段定义(存于 ReportTemplate.fields / ReportTask.fields 的 JSON,非数据库表)。
 * 镜像 task 的 task-fields.ts,额外两种类型:
 *   - catalog_pick  目录点选(选清单商品 → 带出名称/分类/产地/价格快照)
 *   - detail_table  明细子表(一字段 = 多行结构化明细;每行持久化为一条 ReportLine)
 *
 * 加一个新字段类型 = 这里加一条 FIELD_SPECS + api.ts 的 ReportFieldType 联合 + 前端 fields/<type>.tsx。
 * 此处只校验字段「定义」;字段「值」的校验在填报时做。
 */
export type ReportFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'file'
  | 'image'
  | 'richtext'
  | 'doclink'
  | 'catalog_pick'
  | 'detail_table';

export interface ReportField {
  code: string;
  label: string;
  type: ReportFieldType;
  group?: string;
  groupLabel?: string;
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  description?: string;
  /** select:自定义下拉选项 */
  options?: string[];
  /** doclink:链接地址 */
  link?: string;
  /** number 约束 */
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  /** file / image 约束 */
  maxFiles?: number;
  accept?: string;
  /** file / image:上传后可调 AI 识别(发票)并自动填表 */
  aiExtract?: boolean;
  /** catalog_pick:绑定目录批次 + 点选后带出哪些快照列 */
  catalogTag?: string;
  bringOut?: string[];
  /** detail_table:明细列 */
  columns?: ReportField[];
  /** detail_table 列 → ReportLine 结构化字段语义角色(Step 5 持久化消费) */
  role?: string;
}

/** catalog_pick 可带出的快照列(productName 始终带出,不在此列) */
const BRING_OUT_KEYS = ['category', 'categoryDesc', 'recommendOrg', 'origin', 'unitPriceCents'];

/** detail_table 列允许的类型(P1) */
const ALLOWED_COLUMN_TYPES: ReportFieldType[] = ['catalog_pick', 'number', 'select', 'text', 'date'];

interface FieldTypeSpec {
  normalize?(raw: Record<string, unknown>, field: ReportField, code: string): void;
}

/** 字段类型注册表 —— 每种类型一条。 */
const FIELD_SPECS: Record<ReportFieldType, FieldTypeSpec> = {
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
      if (typeof raw.accept === 'string' && raw.accept.trim()) field.accept = raw.accept.trim();
      if (raw.aiExtract === true) field.aiExtract = true;
    },
  },
  image: {
    normalize(raw, field) {
      if (typeof raw.maxFiles === 'number' && raw.maxFiles > 0)
        field.maxFiles = Math.floor(raw.maxFiles);
      if (raw.aiExtract === true) field.aiExtract = true;
    },
  },
  richtext: {},
  doclink: {
    normalize(raw, field) {
      if (typeof raw.link === 'string' && raw.link.trim()) field.link = raw.link.trim();
    },
  },
  catalog_pick: {
    normalize(raw, field, code) {
      if (typeof raw.catalogTag === 'string' && raw.catalogTag.trim())
        field.catalogTag = raw.catalogTag.trim();
      else throw new BadRequestException(`目录点选字段 "${code}" 需绑定 catalogTag`);
      if (Array.isArray(raw.bringOut)) {
        const cols = [
          ...new Set(raw.bringOut.map((b) => String(b)).filter((b) => BRING_OUT_KEYS.includes(b))),
        ];
        field.bringOut = cols;
      }
    },
  },
  detail_table: {
    normalize(raw, field, code) {
      if (!Array.isArray(raw.columns) || raw.columns.length === 0)
        throw new BadRequestException(`明细子表 "${code}" 至少要有一列`);
      // 列不允许嵌套明细 / 文件类(P1 限定),非法类型先拦
      raw.columns.forEach((c) => {
        const t = (c as Record<string, unknown>)?.type;
        if (!ALLOWED_COLUMN_TYPES.includes(t as ReportFieldType))
          throw new BadRequestException(
            `明细子表 "${code}" 的列类型 "${String(t)}" 不支持(限 ${ALLOWED_COLUMN_TYPES.join('/')})`,
          );
      });
      field.columns = normalizeFieldDefs(raw.columns); // 递归规整列定义
    },
  },
};

/** 支持的字段类型(由注册表键派生) */
export const REPORT_FIELD_TYPES = Object.keys(FIELD_SPECS) as ReportFieldType[];

const CODE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * 校验并规整一组字段「定义」。返回干净的 ReportField[](按 sortOrder 升序、重排为 0..n)。
 * detail_table 的列也走本函数递归规整(列 code 同样要合法、组内唯一)。
 */
export function normalizeFieldDefs(raw: unknown): ReportField[] {
  if (!Array.isArray(raw)) throw new BadRequestException('fields 必须是数组');
  const arr: unknown[] = raw;
  if (arr.length === 0) throw new BadRequestException('至少要有一个字段');
  if (arr.length > 200) throw new BadRequestException('字段过多(上限 200)');

  const seen = new Set<string>();
  const out: ReportField[] = [];

  arr.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null)
      throw new BadRequestException(`第 ${idx + 1} 个字段格式错误`);
    const f = item as Record<string, unknown>;
    const code = typeof f.code === 'string' ? f.code.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    const type = f.type as ReportFieldType;

    if (!CODE_RE.test(code))
      throw new BadRequestException(
        `字段代码 "${code || '(空)'}" 不合法:需小写字母开头,仅含字母/数字/下划线`,
      );
    if (seen.has(code)) throw new BadRequestException(`字段代码 "${code}" 重复`);
    seen.add(code);
    if (!label) throw new BadRequestException(`字段 "${code}" 缺少显示名`);
    if (!REPORT_FIELD_TYPES.includes(type))
      throw new BadRequestException(`字段 "${code}" 的类型 "${String(type)}" 不支持`);

    const field: ReportField = {
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
        typeof f.groupLabel === 'string' && f.groupLabel.trim() ? f.groupLabel.trim() : group;
    }
    if (typeof f.placeholder === 'string' && f.placeholder.trim())
      field.placeholder = f.placeholder.trim();
    if (typeof f.description === 'string' && f.description.trim())
      field.description = f.description.trim();
    if (typeof f.role === 'string' && f.role.trim()) field.role = f.role.trim();

    FIELD_SPECS[type].normalize?.(f, field, code);
    out.push(field);
  });

  out.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  out.forEach((f, i) => (f.sortOrder = i));
  return out;
}

/** 安全解析存库的 fields JSON 串 → ReportField[] */
export function parseFields(json: string): ReportField[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as ReportField[]) : [];
  } catch {
    return [];
  }
}
