import { api } from "./client";
import type { OrgKind } from "./organizations";

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

export const usersApi = {
  list: (q: ListUsersQuery = {}) =>
    api
      .get<UserListResponse>("/users", {
        params: {
          ...(q.search ? { search: q.search } : {}),
          ...(q.adminOrgId ? { adminOrgId: q.adminOrgId } : {}),
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
};
