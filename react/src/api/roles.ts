import { api } from "./client";
import type { OrgKind } from "./organizations";
import type { ScopeValue } from "./users";

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
  listUsers: (id: string) => api.get<RoleUserItem[]>(`/roles/${id}/users`).then((r) => r.data),
  create: (input: CreateRoleInput) => api.post<RoleDetail>("/roles", input).then((r) => r.data),
  update: (id: string, input: UpdateRoleInput) =>
    api.patch<RoleDetail>(`/roles/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/roles/${id}`).then((r) => r.data),
  replacePermissions: (id: string, permissionIds: string[]) =>
    api.put<RoleDetail>(`/roles/${id}/permissions`, { permissionIds }).then((r) => r.data),
};
