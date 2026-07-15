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

/**
 * 轻量用户检索条目(内部通讯录级):不含邮箱/电话等联系明细。
 * GET /users 列表已按登录人数据范围收敛;跨范围的选人组件(知识维护人/证书受表彰人/
 * 报送个人对象/组织页加成员等)改走 directory,避免范围收敛后搜不到其他单位的人。
 */
export interface UserDirectoryItem {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  primaryAdmin: { orgId: string; orgName: string; position: string | null } | null;
  partyAffiliation: { orgId: string; orgName: string; position: string | null } | null;
}

/**
 * 通讯录条目(内部公司通讯录):含联系方式(电话/邮箱)。
 * 登录即可、不受数据范围收敛(全员可查同事联系方式,用户决策)。
 */
export interface ContactItem {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  /** 政治面貌字典 code(customFields.political_status),可空;标签由字典映射 */
  politicalStatus: string | null;
  /** 负责人:被设为某行政机构 meta.ownerUserId(编辑行政机构时指定的部门负责人) */
  isLeader: boolean;
  /** admin.path = 从「所在二级单位」向下到本机构的名称路径(如 [新疆分公司, 综合办公室]) */
  admin: { orgId: string; orgName: string; position: string | null; path: string[] } | null;
  party: { orgId: string; orgName: string; position: string | null } | null;
}

/** 对口机构条目:附「所在二级单位」(unitId/unitName)供门户按二级单位筛选 */
export interface CounterpartOrg {
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
}

/** 对口关系(门户「对口上级机构 / 下级承接部门」默认视图):基于登录人所在部门 */
export interface CounterpartScope {
  superiorOrgs: CounterpartOrg[];
  subordinateOrgs: CounterpartOrg[];
}

/** 通讯录个人向接口(收藏 + 对口关系;登录即可、作用于自己) */
export const directoryMeApi = {
  counterpartScope: () =>
    api.get<CounterpartScope>("/directory/my/counterpart-scope").then((r) => r.data),
  favorites: () =>
    api.get<{ items: ContactItem[] }>("/directory/my/favorites").then((r) => r.data),
  addFavorite: (userId: string) =>
    api.post(`/directory/my/favorites/${userId}`).then((r) => r.data),
  removeFavorite: (userId: string) =>
    api.delete(`/directory/my/favorites/${userId}`).then((r) => r.data),
};

export interface ContactsResponse {
  total: number;
  items: ContactItem[];
}

export interface ContactsQuery {
  search?: string;
  /** 行政机构 id(按部门浏览) */
  adminOrgId?: string;
  /** 配合 adminOrgId:该机构及其全部下级(子树后端展开) */
  adminOrgSubtree?: boolean;
  /** 行政机构 id 列表(任一命中)—— 对口上级机构 / 下级承接部门 视图用 */
  adminOrgIds?: string[];
  partyOrgId?: string;
  /** 只列党员 */
  hasParty?: boolean;
  /** 所属机构是否是「部门」:true=挂在任一部门下 / false=有行政归属但不在任何部门 */
  inDept?: boolean;
  /** 政治面貌字典 code 列表(任一命中) */
  politicalStatuses?: string[];
  take?: number;
  skip?: number;
}

/* ═══════════ 通讯录后台管理(directory:manage) ═══════════ */

/** 我的通讯录管理范围:all=全公司(通讯录管理员);否则 orgIds=可管行政机构子树(二级通讯录管理员) */
export interface DirectoryScope {
  all: boolean;
  orgIds: string[];
}

/** 通讯录管理视图的单位成员(含被隐藏的;sortOrder = 组织/通讯录/门户统一排序) */
export interface DirectoryMember {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  position: string | null;
  isPrimary: boolean;
  hidden: boolean;
  sortOrder: number;
}

export interface DirectoryUnitMembers {
  org: { id: string; name: string };
  members: DirectoryMember[];
}

export interface UpdateDirectoryMemberInput {
  hidden?: boolean;
  /** 传空串 = 清空 */
  phone?: string;
  email?: string;
}

export const directoryAdminApi = {
  /** 我的管理范围(前端据此裁剪组织树) */
  scope: () => api.get<DirectoryScope>("/directory/scope").then((r) => r.data),

  /** 某行政机构的直接成员(管理视图) */
  unitMembers: (orgId: string, search?: string) =>
    api
      .get<DirectoryUnitMembers>(`/directory/units/${orgId}/members`, {
        params: search ? { search } : {},
      })
      .then((r) => r.data),

  /** 按单位拖拽排序(userIds = 期望顺序) */
  reorder: (orgId: string, userIds: string[]) =>
    api.post<{ ok: boolean; count: number }>(`/directory/units/${orgId}/reorder`, { userIds }).then((r) => r.data),

  /** 改联系方式 / 隐藏显示 */
  updateMember: (userId: string, input: UpdateDirectoryMemberInput) =>
    api
      .patch<{ userId: string; phone: string | null; email: string | null; hidden: boolean }>(
        `/directory/members/${userId}`,
        input,
      )
      .then((r) => r.data),
};

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
  /** 配合 adminOrgId:true = 该机构及其全部下级(子树在服务端展开,避免超长 URL) */
  adminOrgSubtree?: boolean;
  /** 行政机构 id 列表(任一命中即匹配);用于「派发对象·个人」按本单位子树过滤 */
  adminOrgIds?: string[];
  partyOrgId?: string;
  active?: boolean;
  hasParty?: boolean;
  /** 只列「未分配任何行政机构」的用户 */
  noAdminOrg?: boolean;
  /** 只列「政治面貌=中共党员/预备党员 且 未加入任何党组织」的用户 */
  noPartyOrg?: boolean;
  /** 行政职务关键词(任一「包含」命中)。筛选面板已改用 inDept,保留供 API/旧检索模板 */
  positionKeywords?: string[];
  /** 所属机构是否是「部门」:true=挂在任一部门下 / false=有行政归属但不在任何部门 / 不传=不限 */
  inDept?: boolean;
  /** 政治面貌字典 code 列表(任一命中) */
  politicalStatuses?: string[];
  /** 角色 id 列表(任一命中) */
  roleIds?: string[];
  /** 是否部门负责人(组织管理里指定的 meta.ownerUserId):true=是 / false=否 / 不传=不限 */
  deptOwner?: boolean;
  take?: number;
  skip?: number;
  sortBy?: "createdAt" | "name" | "username";
  sortDir?: "asc" | "desc";
}

/** 用户统计(工具条角标):全库口径,不受列表过滤影响 */
export interface UserStats {
  total: number;
  active: number;
  /** 未分配任何行政机构的人数 */
  noAdminOrg: number;
  /** 政治面貌=中共党员/预备党员、但未加入任何党组织的人数 */
  noPartyOrg: number;
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

/** 个人设置自助改资料 —— 后端白名单只收这三项;email/phone 传空字符串 = 清空 */
export interface UpdateMyProfileInput {
  email?: string;
  phone?: string;
  avatarUrl?: string;
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
          ...(q.adminOrgSubtree ? { adminOrgSubtree: "true" } : {}),
          ...(q.adminOrgIds && q.adminOrgIds.length ? { adminOrgIds: q.adminOrgIds.join(",") } : {}),
          ...(q.partyOrgId ? { partyOrgId: q.partyOrgId } : {}),
          ...(q.active !== undefined ? { active: String(q.active) } : {}),
          ...(q.hasParty !== undefined ? { hasParty: String(q.hasParty) } : {}),
          ...(q.noAdminOrg ? { noAdminOrg: "true" } : {}),
          ...(q.noPartyOrg ? { noPartyOrg: "true" } : {}),
          ...(q.positionKeywords?.length ? { positionKeywords: q.positionKeywords.join(",") } : {}),
          ...(q.inDept !== undefined ? { inDept: String(q.inDept) } : {}),
          ...(q.politicalStatuses?.length ? { politicalStatuses: q.politicalStatuses.join(",") } : {}),
          ...(q.roleIds?.length ? { roleIds: q.roleIds.join(",") } : {}),
          ...(q.deptOwner !== undefined ? { deptOwner: String(q.deptOwner) } : {}),
          ...(q.take !== undefined ? { take: q.take } : {}),
          ...(q.skip !== undefined ? { skip: q.skip } : {}),
          ...(q.sortBy ? { sortBy: q.sortBy } : {}),
          ...(q.sortDir ? { sortDir: q.sortDir } : {}),
        },
      })
      .then((r) => r.data),

  /** 统计角标(总数/在职/行政未分配/党组织未加入)—— 口径 = 登录人可见范围 */
  stats: () => api.get<UserStats>("/users/stats").then((r) => r.data),

  /** 内部通讯录:分页 + 部门/党组织/政治面貌过滤 + 姓名/工号/电话/邮箱/部门名搜索(登录即可、全员可查) */
  contacts: (q: ContactsQuery = {}) =>
    api
      .get<ContactsResponse>("/users/contacts", {
        params: {
          ...(q.search ? { search: q.search } : {}),
          ...(q.adminOrgId ? { adminOrgId: q.adminOrgId } : {}),
          ...(q.adminOrgSubtree ? { adminOrgSubtree: "true" } : {}),
          ...(q.adminOrgIds?.length ? { adminOrgIds: q.adminOrgIds.join(",") } : {}),
          ...(q.partyOrgId ? { partyOrgId: q.partyOrgId } : {}),
          ...(q.hasParty ? { hasParty: "true" } : {}),
          ...(q.inDept !== undefined ? { inDept: String(q.inDept) } : {}),
          ...(q.politicalStatuses?.length ? { politicalStatuses: q.politicalStatuses.join(",") } : {}),
          ...(q.take !== undefined ? { take: q.take } : {}),
          ...(q.skip !== undefined ? { skip: q.skip } : {}),
        },
      })
      .then((r) => r.data),

  /** 轻量用户检索(通讯录级,登录即可、不受数据范围收敛;最小字段,take ≤ 50) */
  directory: (search?: string, take?: number) =>
    api
      .get<{ items: UserDirectoryItem[] }>("/users/directory", {
        params: {
          ...(search ? { search } : {}),
          ...(take !== undefined ? { take } : {}),
        },
      })
      .then((r) => r.data),

  get: (id: string) => api.get<UserDetail>(`/users/${id}`).then((r) => r.data),

  create: (input: CreateUserInput) => api.post<UserDetail>("/users", input).then((r) => r.data),

  update: (id: string, input: UpdateUserInput) =>
    api.patch<UserDetail>(`/users/${id}`, input).then((r) => r.data),

  /** 个人设置:更新本人资料(身份取自登录态,改完记得 auth.refresh() 同步全站头像/联系方式) */
  updateMyProfile: (input: UpdateMyProfileInput) =>
    api.patch<UserDetail>("/users/me/profile", input).then((r) => r.data),

  replaceMemberships: (id: string, memberships: MembershipInput[]) =>
    api.put<UserDetail>(`/users/${id}/memberships`, { memberships }).then((r) => r.data),

  /** 新增单条组织归属(组织管理页「点机构加成员」),不影响用户其它归属。 */
  addMembership: (id: string, input: MembershipInput) =>
    api.post<UserDetail>(`/users/${id}/memberships`, input).then((r) => r.data),

  /** 移除单条组织归属(把成员移出某机构)。 */
  removeMembership: (id: string, orgId: string) =>
    api.delete<UserDetail>(`/users/${id}/memberships/${orgId}`).then((r) => r.data),

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
