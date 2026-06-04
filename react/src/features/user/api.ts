import { api } from "@/shared/api/client";
import type { OrgKind } from "@/features/organization/api";

export type ScopeValue = "self" | "own" | "subtree" | "all" | "custom";

export const SCOPE_LABELS: Record<ScopeValue, string> = {
  self:    "仅本人",
  own:     "仅本组织",
  subtree: "本组织及下属",
  all:     "全平台",
  custom:  "自定义子树",
};

export interface UserListItem {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  primaryAdmin: { orgId: string; orgName: string; position: string | null } | null;
  partyAffiliation: { orgId: string; orgName: string; position: string | null } | null;
  membershipCount: number;
  roleCount: number;
}

export interface UserListResponse {
  total: number;
  items: UserListItem[];
}

export interface UserMembership {
  userId: string;
  orgId: string;
  isPrimary: boolean;
  position: string | null;
  joinedAt: string;
  org: {
    id: string;
    name: string;
    code: string;
    kind: OrgKind;
    type: string;
    isVirtual: boolean;
  };
}

export interface UserRoleAssignment {
  userRoleId: string;
  roleId: string;
  code: string;
  name: string;
  scope: ScopeValue;
  /** scope=custom 时可能有多个组织,其它 scope 该数组为空 */
  scopeOrgs: { id: string; name: string; kind: OrgKind }[];
  grantedAt: string;
}

export interface UserDetail {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  active: boolean;
  externalId: string | null;
  /** 自定义字段值:{ [fieldCode]: stringValue },select 类型存的是字典项 code */
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  memberships: { admin: UserMembership[]; party: UserMembership[] };
  roles: UserRoleAssignment[];
}

export interface ListUsersQuery {
  search?: string;
  adminOrgId?: string;
  /** 行政机构 id 列表(任一命中即匹配);用于「派发对象·个人」按本单位子树过滤 */
  adminOrgIds?: string[];
  partyOrgId?: string;
  active?: boolean;
  hasParty?: boolean;
  take?: number;
  skip?: number;
  sortBy?: "createdAt" | "name" | "username";
  sortDir?: "asc" | "desc";
}

export interface CreateUserInput {
  username: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  active?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  active?: boolean;
}

export interface MembershipInput {
  orgId: string;
  position?: string;
  isPrimary?: boolean;
}

export interface RoleAssignmentInput {
  roleId: string;
  scope: ScopeValue;
  /** scope=custom 时可指定多个组织子树作为并集;其它 scope 留空 */
  scopeOrgIds?: string[];
}

/**
 * 批量按员工编号查 User 的返回 —— key 为 empNo,值为命中(摘要)或 null(未命中)。
 *
 * 发证页 Step 3 个人粘贴识别用 —— 一次 POST 把 N 个 empNo 都查回来。
 */
export interface UserByEmpNoLite {
  id: string;
  username: string;
  name: string;
  /** 主行政归属名(命中 isPrimary 优先,否则第一条 active) */
  adminOrgName: string | null;
  /** 主行政归属 orgId — 发证时用来在组织树里预选「所在单位/部门」 */
  adminOrgId: string | null;
  /** 主党组织归属名 */
  partyOrgName: string | null;
  /** 主党组织归属 orgId */
  partyOrgId: string | null;
}

export type LookupByEmpNoResponse = Record<string, UserByEmpNoLite | null>;

/** 按姓名批量查 —— 每个姓名命中数组(0 / 1 / 多;重名时 >1) */
export type LookupByNameResponse = Record<string, UserByEmpNoLite[]>;

export const usersApi = {
  list: (q: ListUsersQuery = {}) =>
    api
      .get<UserListResponse>("/users", {
        params: {
          ...(q.search ? { search: q.search } : {}),
          ...(q.adminOrgId ? { adminOrgId: q.adminOrgId } : {}),
          ...(q.adminOrgIds && q.adminOrgIds.length ? { adminOrgIds: q.adminOrgIds.join(",") } : {}),
          ...(q.partyOrgId ? { partyOrgId: q.partyOrgId } : {}),
          ...(q.active !== undefined ? { active: String(q.active) } : {}),
          ...(q.hasParty !== undefined ? { hasParty: String(q.hasParty) } : {}),
          ...(q.take !== undefined ? { take: q.take } : {}),
          ...(q.skip !== undefined ? { skip: q.skip } : {}),
          ...(q.sortBy ? { sortBy: q.sortBy } : {}),
          ...(q.sortDir ? { sortDir: q.sortDir } : {}),
        },
      })
      .then((r) => r.data),

  get: (id: string) => api.get<UserDetail>(`/users/${id}`).then((r) => r.data),

  create: (input: CreateUserInput) => api.post<UserDetail>("/users", input).then((r) => r.data),

  update: (id: string, input: UpdateUserInput) =>
    api.patch<UserDetail>(`/users/${id}`, input).then((r) => r.data),

  replaceMemberships: (id: string, memberships: MembershipInput[]) =>
    api.put<UserDetail>(`/users/${id}/memberships`, { memberships }).then((r) => r.data),

  replaceRoles: (id: string, roles: RoleAssignmentInput[]) =>
    api.put<UserDetail>(`/users/${id}/roles`, { roles }).then((r) => r.data),

  replaceCustomFields: (id: string, values: Record<string, string>) =>
    api.put<UserDetail>(`/users/${id}/custom-fields`, { values }).then((r) => r.data),

  remove: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),

  /**
   * 批量按员工编号(= username)查 User。最多 200 个。
   * 响应:`{ [empNo]: UserByEmpNoLite | null }` —— 未命中 key 也存在,值为 null。
   */
  lookupByEmpNo: (empNos: string[]) =>
    api
      .post<LookupByEmpNoResponse>("/users/lookup-by-empno", { empNos })
      .then((r) => r.data),

  /**
   * 批量按姓名查 User —— 没填工号时用姓名兜底补工号+单位。最多 200 个。
   * 响应:`{ [name]: UserByEmpNoLite[] }` —— 重名时数组 >1。
   */
  lookupByName: (names: string[]) =>
    api
      .post<LookupByNameResponse>("/users/lookup-by-name", { names })
      .then((r) => r.data),
};
