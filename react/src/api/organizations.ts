import { api } from "./client";

/* ─── 两套组织体系 ─── */
export type OrgKind = "party" | "admin";

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  party: "党组织",
  admin: "行政机构",
};

/* 党组织内部类型 */
export type PartyType = "committee" | "general" | "branch" | "temp_branch" | "group";
/* 行政机构单位层级分类 */
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
  code: string;
  kind: OrgKind;
  type: OrgType;
  isVirtual: boolean;
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
  viaOrgId: string;
  viaOrgName: string;
  position: string | null;
  isPrimary: boolean;
  /** true = 直接挂本组织; false = 通过下级组织进入 (传递) */
  isDirect: boolean;
}

export interface CreateOrgInput {
  name: string;
  code: string;
  kind: OrgKind;
  type: OrgType;
  isVirtual?: boolean;
  parentId?: string | null;
  sortOrder?: number;
}

export interface UpdateOrgInput extends Partial<CreateOrgInput> {
  active?: boolean;
}

export type MovePosition = "before" | "after" | "inside";

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

  remove: (id: string, hard = false) =>
    api.delete(`/organizations/${id}`, { params: hard ? { hard: "true" } : {} }),
};
