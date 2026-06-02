import type { TaskField, TaskFieldType } from "../../api";
import { getFieldType } from "../../fields";

/** 下一个自动字段 code(field_N,用户不可见、不可填) */
export function nextFieldCode(fields: TaskField[]): string {
  let max = 0;
  for (const f of fields) {
    const m = /^field_(\d+)$/.exec(f.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `field_${max + 1}`;
}

/** 新建一个指定类型的字段(默认显示名 = 类型名,排末位;类型默认值由注册表给) */
export function makeField(type: TaskFieldType, fields: TaskField[]): TaskField {
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

/**
 * 按类型裁掉无关属性(切换类型时「改不了的就清掉重来」)。
 * 通用属性始终保留;类型「自有属性」由注册表 ownProps 声明,占位按 hasPlaceholder 决定去留。
 */
export function cleanForType(f: TaskField): TaskField {
  const def = getFieldType(f.type);
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
  if (f.description) base.description = f.description;
  if (def.hasPlaceholder && f.placeholder) base.placeholder = f.placeholder;
  for (const k of def.ownProps ?? []) {
    const v = f[k];
    if (v !== undefined) (base as unknown as Record<string, unknown>)[k] = v;
  }
  return base;
}

/** 重新分配 sortOrder = 数组下标 */
export function reindex(fields: TaskField[]): TaskField[] {
  return fields.map((f, i) => ({ ...f, sortOrder: i }));
}

/* ─── 结构化分组(三栏设计器):画布容器 ↔ 扁平 TaskField[] ─── */

/** 未分组容器的固定 id */
export const UNGROUPED = "__ungrouped__";

export interface DesignerContainer {
  /** 分组 id;未分组为 UNGROUPED */
  id: string;
  /** 分组显示名;未分组为空串(渲染成「未分组」) */
  label: string;
  fields: TaskField[];
}

/** 生成一个分组 id(前端临时键,写回 field.group) */
export function newGroupId(): string {
  return `g_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * 受控 value + 本地空分组 → 画布容器列表。
 * 顺序:未分组容器在前,其后按分组在 value 中首次出现的顺序,最后补尚无字段的空分组。
 */
export function buildContainers(
  value: TaskField[],
  emptyGroups: { id: string; label: string }[],
): DesignerContainer[] {
  const sorted = [...value].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped: TaskField[] = [];
  const order: string[] = [];
  const byId = new Map<string, DesignerContainer>();
  for (const f of sorted) {
    if (!f.group) {
      ungrouped.push(f);
      continue;
    }
    if (!byId.has(f.group)) {
      byId.set(f.group, { id: f.group, label: f.groupLabel || f.group, fields: [] });
      order.push(f.group);
    }
    byId.get(f.group)!.fields.push(f);
  }
  for (const g of emptyGroups) {
    if (!byId.has(g.id)) {
      byId.set(g.id, { id: g.id, label: g.label, fields: [] });
      order.push(g.id);
    }
  }
  const containers: DesignerContainer[] = [{ id: UNGROUPED, label: "", fields: ungrouped }];
  for (const id of order) containers.push(byId.get(id)!);
  return containers;
}

/** 画布容器 → 扁平 TaskField[](写回 group/groupLabel + 连续 sortOrder) */
export function flattenContainers(containers: DesignerContainer[]): TaskField[] {
  const out: TaskField[] = [];
  for (const c of containers) {
    for (const f of c.fields) {
      if (c.id === UNGROUPED) {
        const nf: TaskField = { ...f, sortOrder: out.length };
        delete nf.group;
        delete nf.groupLabel;
        out.push(nf);
      } else {
        out.push({ ...f, group: c.id, groupLabel: c.label || c.id, sortOrder: out.length });
      }
    }
  }
  return out;
}
