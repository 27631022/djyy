/**
 * 用户管理「筛选器」的条件模型 + 检索模板存取(纯函数/常量,与面板组件分文件
 * 以满足 react-refresh only-export-components)。
 *
 * - UserFilters:可序列化的筛选条件(面板 / 检索模板共用)。行政机构存
 *   { orgId, orgSubtree } 意图而非展开后的 id 列表 —— 组织树日后变化时,
 *   模板在应用时重新展开子树依然正确。
 * - 检索模板:localStorage 按账号存(与派发对象快捷组同范式);内置模板
 *   「部门管理人员」代码定义、不可删(职务关键词「包含」匹配 —— 职务多为
 *   「党委委员、副经理」这类复合串,精确值匹配没法用)。
 */
import type { OrgTreeNode } from "@/features/organization";
import type { ListUsersQuery } from "../api";

/* ═══════════ 筛选条件模型 ═══════════ */

export interface UserFilters {
  /** 行政机构(树选) */
  orgId?: string;
  /** 含下级机构(应用时展开为 adminOrgIds) */
  orgSubtree?: boolean;
  /** 在职状态:true=在职 / false=离职 / 不设=不限 */
  active?: boolean;
  /** 仅党员(挂了党组织的人) */
  hasParty?: boolean;
  /** 行政机构未分配 */
  noAdminOrg?: boolean;
  /** 党组织未分配(政治面貌为党员/预备党员) */
  noPartyOrg?: boolean;
  /** 所属机构是否是「部门」:true=挂在任一部门下 / false=有行政归属但不在任何部门 */
  inDept?: boolean;
  /** 政治面貌字典 code(任一命中) */
  politicalStatuses?: string[];
  /** 角色 id(任一命中) */
  roleIds?: string[];
  /** 部门负责人:true=是 / false=否 / 不设=不限 */
  deptOwner?: boolean;
}

/** 组织树里找节点 */
export function findOrgNode(tree: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const hit = findOrgNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

/** 筛选条件 → 列表查询参数(子树交给后端 adminOrgSubtree 展开 —— 大子树几百个 id 拼 URL 会超请求头上限) */
export function buildQueryFromFilters(f: UserFilters): Partial<ListUsersQuery> {
  const q: Partial<ListUsersQuery> = {};
  if (f.orgId) {
    q.adminOrgId = f.orgId;
    if (f.orgSubtree) q.adminOrgSubtree = true;
  }
  if (f.active !== undefined) q.active = f.active;
  if (f.hasParty) q.hasParty = true;
  if (f.noAdminOrg) q.noAdminOrg = true;
  if (f.noPartyOrg) q.noPartyOrg = true;
  if (f.inDept !== undefined) q.inDept = f.inDept;
  if (f.politicalStatuses?.length) q.politicalStatuses = f.politicalStatuses;
  if (f.roleIds?.length) q.roleIds = f.roleIds;
  if (f.deptOwner !== undefined) q.deptOwner = f.deptOwner;
  return q;
}

/** 生效的筛选维度个数(工具条「筛选器」按钮角标) */
export function countActiveFilters(f: UserFilters): number {
  let n = 0;
  if (f.orgId) n++;
  if (f.active !== undefined) n++;
  if (f.hasParty) n++;
  if (f.noAdminOrg) n++;
  if (f.noPartyOrg) n++;
  if (f.inDept !== undefined) n++;
  if (f.politicalStatuses?.length) n++;
  if (f.roleIds?.length) n++;
  if (f.deptOwner !== undefined) n++;
  return n;
}

/* ═══════════ 检索模板 ═══════════ */

export interface FilterTemplate {
  id: string;
  name: string;
  filters: UserFilters;
  /** 内置模板:代码定义,不可删 */
  builtin?: boolean;
}

/** 内置「部门管理人员」= 所属行政机构是「部门」(Organization.isDept)的人员 */
export const BUILTIN_TEMPLATES: FilterTemplate[] = [
  {
    id: "builtin-dept-manager",
    name: "部门管理人员",
    builtin: true,
    filters: { inDept: true },
  },
];

const tplKey = (uid: string) => `djyy-user-filter-templates:${uid}`;

export function loadTemplates(uid: string): FilterTemplate[] {
  try {
    const raw = localStorage.getItem(tplKey(uid));
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (t): t is FilterTemplate =>
        !!t && typeof t === "object" && typeof (t as FilterTemplate).name === "string" &&
        typeof (t as FilterTemplate).id === "string" && !!(t as FilterTemplate).filters,
    );
  } catch {
    return [];
  }
}

export function persistTemplates(uid: string, list: FilterTemplate[]) {
  try {
    localStorage.setItem(tplKey(uid), JSON.stringify(list));
  } catch {
    /* 存储失败(隐私模式等)静默 */
  }
}
