import { api } from "@/shared/api/client";
import type { OrgKind } from "@/features/organization/api";
import type { ScopeValue } from "@/features/user/api";

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  createdAt: string;
  userCount: number;
  permissionCount: number;
}

export interface RolePermissionItem {
  id: string;
  code: string;
  name: string;
  category: string;
  pluginName: string | null;
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  builtin: boolean;
  createdAt: string;
  userCount: number;
  permissions: RolePermissionItem[];
}

export interface RoleUserItem {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  scope: ScopeValue;
  scopeOrgs: { id: string; name: string; kind: OrgKind }[];
  grantedAt: string;
}

/** 角色成员列表分页响应(member 角色 2 万+成员,服务端分页) */
export interface RoleUsersPage {
  total: number;
  items: RoleUserItem[];
}

/** 角色成员列表查询(take ≤ 200;search = 姓名/员工编号 ILIKE) */
export interface ListRoleUsersQuery {
  take?: number;
  skip?: number;
  search?: string;
}

/** 角色成员增删入参(= 给用户授此角色 + 配数据范围)。scope=custom 时须带 scopeOrgIds。 */
export interface AssignRoleUserInput {
  userId: string;
  scope: ScopeValue;
  scopeOrgIds?: string[];
}

/** 批量添加入参:整批同一数据范围(custom 时全批共用同一组锚点)。 */
export interface BatchAssignRoleUsersInput {
  userIds: string[];
  scope: ScopeValue;
  scopeOrgIds?: string[];
}

/** 批量添加结果:added=新授予 / updated=已持有、覆盖更新范围 / missing=id 不存在被跳过 */
export interface BatchAssignRoleUsersResult {
  requested: number;
  added: number;
  updated: number;
  missing: number;
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
}

export const rolesApi = {
  list: () => api.get<RoleListItem[]>("/roles").then((r) => r.data),
  get:  (id: string) => api.get<RoleDetail>(`/roles/${id}`).then((r) => r.data),
  /** 角色成员列表(分页 + 姓名/员工编号搜索) */
  listUsers: (id: string, q: ListRoleUsersQuery = {}) =>
    api
      .get<RoleUsersPage>(`/roles/${id}/users`, {
        params: {
          ...(q.search ? { search: q.search } : {}),
          ...(q.take !== undefined ? { take: q.take } : {}),
          ...(q.skip !== undefined ? { skip: q.skip } : {}),
        },
      })
      .then((r) => r.data),
  /** 该角色全部成员 userId(轻量;批量面板算已持有重叠 / 单个添加去重) */
  listUserIds: (id: string) =>
    api.get<{ total: number; ids: string[] }>(`/roles/${id}/users/ids`).then((r) => r.data),
  /** 给角色直接添加/更新一名成员(返回成员列表首页)。仅系统管理员(admin:role:write)。 */
  addUser: (id: string, input: AssignRoleUserInput) =>
    api.post<RoleUsersPage>(`/roles/${id}/users`, input).then((r) => r.data),
  /** 解除某用户的此角色(返回成员列表首页)。 */
  removeUser: (id: string, userId: string) =>
    api.delete<RoleUsersPage>(`/roles/${id}/users/${userId}`).then((r) => r.data),
  /** 批量添加成员(幂等:已持有者覆盖更新数据范围)。仅系统管理员(admin:role:write)。 */
  batchAddUsers: (id: string, input: BatchAssignRoleUsersInput) =>
    api.post<BatchAssignRoleUsersResult>(`/roles/${id}/users/batch`, input).then((r) => r.data),
  /** 批量移除成员(幂等:未持有的忽略,返回实际移除数)。 */
  batchRemoveUsers: (id: string, userIds: string[]) =>
    api
      .post<{ requested: number; removed: number }>(`/roles/${id}/users/batch-remove`, { userIds })
      .then((r) => r.data),
  create: (input: CreateRoleInput) => api.post<RoleDetail>("/roles", input).then((r) => r.data),
  update: (id: string, input: UpdateRoleInput) =>
    api.patch<RoleDetail>(`/roles/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/roles/${id}`).then((r) => r.data),
  replacePermissions: (id: string, permissionIds: string[]) =>
    api.put<RoleDetail>(`/roles/${id}/permissions`, { permissionIds }).then((r) => r.data),
};
