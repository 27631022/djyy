import { api } from "./client";

export interface DictionaryListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface DictItem {
  id: string;
  dictId: string;
  parentId: string | null;     // null = 根级 (分类),非空 = 二级项
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 用于 UI:把扁平 items 组装成 "分类 → children" 二级树 */
export interface DictItemNode extends DictItem {
  children: DictItem[];
}

export function buildDictTree(items: DictItem[]): {
  categories: DictItemNode[];   // parentId=null 的项,带 children
  orphans: DictItem[];          // parentId 找不到对应根的二级项 (异常数据)
  hasCategories: boolean;       // 是否存在二级结构
} {
  const byId = new Map(items.map((it) => [it.id, it]));
  const roots: DictItem[] = [];
  const childrenMap = new Map<string, DictItem[]>();
  const orphans: DictItem[] = [];
  for (const it of items) {
    if (it.parentId === null) {
      roots.push(it);
    } else if (byId.has(it.parentId)) {
      if (!childrenMap.has(it.parentId)) childrenMap.set(it.parentId, []);
      childrenMap.get(it.parentId)!.push(it);
    } else {
      orphans.push(it);
    }
  }
  const categories = roots
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<DictItemNode>((r) => ({
      ...r,
      children: (childrenMap.get(r.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  const hasCategories = categories.some((c) => c.children.length > 0);
  return { categories, orphans, hasCategories };
}

export interface DictionaryDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: DictItem[];
}

export interface CreateDictionaryInput {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
}

export interface UpdateDictionaryInput {
  name?: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
}

export interface CreateDictItemInput {
  code: string;
  label: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
  parentId?: string | null;     // null/缺省=根级分类,提供=二级项
}

export interface UpdateDictItemInput {
  label?: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
  parentId?: string | null;
}

export const dictionariesApi = {
  list: (includeInactive = false) =>
    api.get<DictionaryListItem[]>("/dictionaries", { params: includeInactive ? { inactive: "true" } : {} }).then((r) => r.data),

  /** 支持 id 或 code 两种参数(code 更稳定,适合下拉直接拉) */
  get: (idOrCode: string, includeInactive = false) =>
    api
      .get<DictionaryDetail>(`/dictionaries/${idOrCode}`, { params: includeInactive ? { inactive: "true" } : {} })
      .then((r) => r.data),

  create: (input: CreateDictionaryInput) => api.post<DictionaryDetail>("/dictionaries", input).then((r) => r.data),

  update: (id: string, input: UpdateDictionaryInput) =>
    api.patch<DictionaryDetail>(`/dictionaries/${id}`, input).then((r) => r.data),

  remove: (id: string) => api.delete(`/dictionaries/${id}`).then((r) => r.data),

  createItem: (dictId: string, input: CreateDictItemInput) =>
    api.post<DictItem>(`/dictionaries/${dictId}/items`, input).then((r) => r.data),

  updateItem: (dictId: string, itemId: string, input: UpdateDictItemInput) =>
    api.patch<DictItem>(`/dictionaries/${dictId}/items/${itemId}`, input).then((r) => r.data),

  removeItem: (dictId: string, itemId: string) =>
    api.delete(`/dictionaries/${dictId}/items/${itemId}`).then((r) => r.data),
};

/* ─── 常用字典代码常量(供前端引用) ─── */
export const DICT_CODES = {
  ADMIN_POSITION: "admin_position",   // 行政职务
  PARTY_POSITION: "party_position",   // 党组织职务
  USER_EDUCATION: "user_education",   // 学历
  USER_POLITICAL: "user_political_status", // 政治面貌
} as const;
