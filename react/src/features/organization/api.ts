import { api } from "@/shared/api/client";

/* ─── 两套组织体系 ─── */
export type OrgKind = "party" | "admin";

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  party: "党组织",
  admin: "行政机构",
};

/* 党组织内部类型 */
export type PartyType = "committee" | "general" | "branch" | "temp_branch" | "group";
/* 行政机构单位层级分类(层级与「是否部门」正交:部门用 isDept 布尔标记) */
export type AdminType = "level1" | "level2" | "level3" | "level4";
export type OrgType = PartyType | AdminType;

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  // party
  committee:   "党委",
  general:     "党总支",
  branch:      "党支部",
  temp_branch: "临时党支部",
  group:       "党小组",
  // admin
  level1: "一级单位",
  level2: "二级单位",
  level3: "三级单位",
  level4: "四级单位",
};

export const ORG_TYPE_COLORS: Record<OrgType, string> = {
  committee:   "rgb(200, 0, 30)",
  general:     "rgb(232, 112, 10)",
  branch:      "rgb(26, 107, 200)",
  temp_branch: "rgb(139, 0, 200)",   // 临时党支部 紫色,与虚拟徽标呼应
  group:       "rgb(70, 70, 200)",
  // 行政单位层级:从深到浅的蓝色渐变
  level1: "rgb(15, 76, 145)",
  level2: "rgb(26, 107, 200)",
  level3: "rgb(56, 142, 231)",
  level4: "rgb(106, 167, 232)",
};

export const PARTY_TYPE_OPTIONS: { value: PartyType; label: string }[] = [
  { value: "committee",   label: "党委" },
  { value: "general",     label: "党总支" },
  { value: "branch",      label: "党支部" },
  { value: "temp_branch", label: "临时党支部" },
  { value: "group",       label: "党小组" },
];

export const ADMIN_TYPE_OPTIONS: { value: AdminType; label: string }[] = [
  { value: "level1", label: "一级单位" },
  { value: "level2", label: "二级单位" },
  { value: "level3", label: "三级单位" },
  { value: "level4", label: "四级单位" },
];

export interface Organization {
  id: string;
  name: string;
  /** 全称 — 证书 / 公文 / 印章等正式场合用,可空兼容老数据。日常展示用 name(简称) */
  fullName: string | null;
  code: string;
  kind: OrgKind;
  type: OrgType;
  isVirtual: boolean;
  /** 部门标记:true = 单位内部职能部门(与层级 type 正交;对口责任部门只能选它) */
  isDept: boolean;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  meta: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgTreeNode extends Organization {
  children: OrgTreeNode[];
  /** 直接挂在本组织下的去重用户数 */
  directMembers: number;
  /** 本组织 + 所有下级聚合的去重用户数 (传递性归属) */
  transitiveMembers: number;
}

export interface OrgMember {
  userId: string;
  username: string;
  name: string;
  phone: string | null;
  viaOrgId: string;
  viaOrgName: string;
  position: string | null;
  isPrimary: boolean;
  /** true = 直接挂本组织; false = 通过下级组织进入 (传递) */
  isDirect: boolean;
  /** 成员在本机构内的排序号(拖拽排序;仅直接成员有意义) */
  sortOrder: number;
}

export interface CreateOrgInput {
  name: string;
  /** 全称 — 证书 / 公文 / 印章等正式场合用;为空则不设。日常组织树显示 name(简称) */
  fullName?: string | null;
  code: string;
  kind: OrgKind;
  type: OrgType;
  isVirtual?: boolean;
  isDept?: boolean;
  parentId?: string | null;
  sortOrder?: number;
  /** 自定义属性 JSON 串(含「对口上级机构」counterpartParentOrgId 等) */
  meta?: string;
}

export interface UpdateOrgInput extends Partial<CreateOrgInput> {
  active?: boolean;
}

export type MovePosition = "before" | "after" | "inside";

/** 党组织↔行政机构关联(返回对侧机构 + linkId) */
export interface OrgLink {
  linkId: string;
  org: Organization;
}

export const organizationsApi = {
  list: (kind?: OrgKind, includeInactive = false) =>
    api
      .get<Organization[]>("/organizations", {
        params: {
          ...(kind ? { kind } : {}),
          ...(includeInactive ? { inactive: "true" } : {}),
        },
      })
      .then((r) => r.data),

  tree: (kind?: OrgKind, includeInactive = false) =>
    api
      .get<OrgTreeNode[]>("/organizations/tree", {
        params: {
          ...(kind ? { kind } : {}),
          ...(includeInactive ? { inactive: "true" } : {}),
        },
      })
      .then((r) => r.data),

  get:  (id: string) => api.get<Organization>(`/organizations/${id}`).then((r) => r.data),

  members: (id: string, recursive = false) =>
    api
      .get<OrgMember[]>(`/organizations/${id}/members`, { params: recursive ? { recursive: "true" } : {} })
      .then((r) => r.data),

  create: (input: CreateOrgInput) =>
    api.post<Organization>("/organizations", input).then((r) => r.data),

  update: (id: string, input: UpdateOrgInput) =>
    api.patch<Organization>(`/organizations/${id}`, input).then((r) => r.data),

  /** 拖拽移动节点 */
  move: (id: string, targetId: string, position: MovePosition) =>
    api.post<Organization>(`/organizations/${id}/move`, { targetId, position }).then((r) => r.data),

  /** 拖拽排序本机构直接成员(userIds = 期望顺序) */
  reorderMembers: (id: string, userIds: string[]) =>
    api.post(`/organizations/${id}/members/reorder`, { userIds }).then((r) => r.data),

  remove: (id: string, hard = false) =>
    api.delete(`/organizations/${id}`, { params: hard ? { hard: "true" } : {} }),

  /** 党组织↔行政机构关联:列出某组织(任一侧)的关联(对侧机构 + linkId) */
  links: (id: string) => api.get<OrgLink[]>(`/organizations/${id}/links`).then((r) => r.data),
  /** 关联一个党组织 + 一个行政机构(otherOrgId = 对侧组织 id) */
  addLink: (id: string, otherOrgId: string) =>
    api.post<{ id: string }>(`/organizations/${id}/links`, { otherOrgId }).then((r) => r.data),
  /** 解除关联 */
  removeLink: (linkId: string) => api.delete(`/organizations/links/${linkId}`),
};
