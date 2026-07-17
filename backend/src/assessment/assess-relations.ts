import type { Organization } from '@prisma/client';
import { stripPartySuffix } from '../organization';

/**
 * 考核关系注册表(纯逻辑,无 Prisma)。
 *
 * 一条「考核关系」= 谁(主体)考核谁(对象),例:公司党委考核基层党委。
 * 每条声明:track(党建/行政)、level(收敛层级)、主体集合、对象集合、责任部门归属。
 * 服务层据此算「我的考核区域」(按登录账号 membership 收敛)与「主体→考核对象候选」。
 *
 * 加新关系 = 这里 RELATIONS 加一条。坐标系/对象推导全在本文件,service 只做编排 + 取成员。
 *
 * 组织结构事实(昆仑物流;分公司层级由 db:import:admin 归位,见 prisma/import-admin-orgs.ts):
 *   行政:level1 公司 → level2 虚拟壳 公司机关/基层单位(isVirtual)
 *         · 公司机关(虚拟)→ level2 机关部门(isDept,11;因 isDept 不计为考核「二级单位」,仍是责任部门)
 *         · 基层单位(虚拟)→ level2 二级单位(34 分公司,!isDept)→ level3 本部部门(isDept)+ 三级单位 → 员工(成员)
 *   ⚠ 全 admin 不用 level4;二级单位 = level2 !isDept !isVirtual;三级单位 = level3 且在某二级单位子树内(排除机关部门)
 *   党建:党委(root committee)→ 直接下级 35(公司机关党委 + 34 基层党委 committee/general)
 *         → 各自党支部(branch)→ 党员(成员)
 */

export type Track = 'party' | 'admin';
/** 收敛层级:company=公司机关身处可见;unit2=二级单位身处可见;unit3=三级单位身处可见 */
export type RelationLevel = 'company' | 'unit2' | 'unit3';
export type ObjectKind = 'org' | 'user';

/** 组织索引:一次性从全量 org + 关联表构建,供纯推导用 */
export interface OrgIndex {
  byId: Map<string, Organization>;
  childrenOf: Map<string, Organization[]>;
  partyRoot?: Organization;
  adminRoot?: Organization;
  /** 公司机关(行政虚拟壳,name 含「机关」)—— 公司级责任部门(11 机关部门)归属 */
  agencyAdminWrapperId?: string;
  /** 公司机关党委(党委 root 下 name 含「机关」的委员会)*/
  agencyPartyCommitteeId?: string;
  /** 党组织 → 对口行政机构(PartyAdminLink 优先,其次按名称去「党委/党支部」后缀匹配)*/
  linkedAdminByParty: Map<string, string>;
}

/* ─── 结构判定(不写死深度,按 type/isDept/isVirtual)─── */

/** 二级单位 = 行政 level2 实体单位(非部门、非虚拟;公司机关/基层单位是 level2 虚拟壳,被 !isVirtual 排除)*/
export function isUnit2(o: Organization): boolean {
  return o.kind === 'admin' && o.type === 'level2' && !o.isDept && !o.isVirtual;
}
/** 是否有二级单位祖先 —— 把「三级单位」限定在二级单位子树内,排除公司机关(虚拟壳)下的机关部门(也是 level3)*/
function hasUnit2Ancestor(o: Organization, idx: OrgIndex): boolean {
  let cur = o.parentId ? idx.byId.get(o.parentId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (isUnit2(cur)) return true;
    seen.add(cur.id);
    cur = cur.parentId ? idx.byId.get(cur.parentId) : undefined;
  }
  return false;
}
/** 三级单位 = 行政 level3 非虚拟、且在某个二级单位子树内(含科室/办公室,用户口径「所有三级单位」)*/
export function isUnit3(o: Organization, idx: OrgIndex): boolean {
  return o.kind === 'admin' && o.type === 'level3' && !o.isVirtual && hasUnit2Ancestor(o, idx);
}
/** 党委/党总支(可带党支部的层)*/
function isCommittee(o: Organization): boolean {
  return o.kind === 'party' && (o.type === 'committee' || o.type === 'general');
}
function isBranch(o: Organization): boolean {
  return o.kind === 'party' && o.type === 'branch';
}

// stripPartySuffix(去党组织后缀,塔运司党委 → 塔运司)已下沉到 organization/org-name.ts,
// 与证书发证「按党组织匹配单位」共用同一定义 —— 改规则只需改一处。

export function buildOrgIndex(
  allOrgs: Organization[],
  links: { partyOrgId: string; adminOrgId: string }[],
): OrgIndex {
  const byId = new Map<string, Organization>();
  const childrenOf = new Map<string, Organization[]>();
  for (const o of allOrgs) byId.set(o.id, o);
  for (const o of allOrgs) {
    if (o.parentId) {
      const arr = childrenOf.get(o.parentId) ?? [];
      arr.push(o);
      childrenOf.set(o.parentId, arr);
    }
  }
  // 兄弟按 sortOrder 稳定排序
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

  const partyRoot = allOrgs.find((o) => o.kind === 'party' && !o.parentId);
  const adminRoot = allOrgs.find((o) => o.kind === 'admin' && !o.parentId);

  const agencyAdminWrapper = allOrgs.find(
    (o) => o.kind === 'admin' && o.isVirtual && o.name.includes('机关'),
  );
  const agencyPartyCommittee = partyRoot
    ? (childrenOf.get(partyRoot.id) ?? []).find((o) => isCommittee(o) && o.name.includes('机关'))
    : undefined;

  // 党组织 → 行政:显式关联优先
  const linkedAdminByParty = new Map<string, string>();
  for (const l of links) if (!linkedAdminByParty.has(l.partyOrgId)) linkedAdminByParty.set(l.partyOrgId, l.adminOrgId);
  // 名称兜底:未关联的党委/党支部按去后缀名匹配行政机构
  const adminByName = new Map<string, string>();
  for (const o of allOrgs) if (o.kind === 'admin') adminByName.set(o.name, o.id);
  for (const o of allOrgs) {
    if (o.kind !== 'party' || linkedAdminByParty.has(o.id)) continue;
    const base = stripPartySuffix(o.name);
    const hit = adminByName.get(base);
    if (hit) linkedAdminByParty.set(o.id, hit);
  }

  return {
    byId,
    childrenOf,
    partyRoot,
    adminRoot,
    agencyAdminWrapperId: agencyAdminWrapper?.id,
    agencyPartyCommitteeId: agencyPartyCommittee?.id,
    linkedAdminByParty,
  };
}

const kids = (idx: OrgIndex, id: string) => idx.childrenOf.get(id) ?? [];

/* ─── 关系定义 ─── */

export interface RelationDef {
  key: string;
  track: Track;
  level: RelationLevel;
  /** 关系全名(公司党委考核基层党委)*/
  label: string;
  subjectLabel: string;
  objectLabel: string;
  objectKind: ObjectKind;
  /** 全量主体候选(platform_admin 看全部时用)*/
  subjects: (idx: OrgIndex) => Organization[];
  /** 主体 → 对象:objectKind=org 时即对象;=user 时返回「成员属于对象」的 org(通常 [subject])*/
  objectOrgs: (subject: Organization, idx: OrgIndex) => Organization[];
  /** 责任部门归属的行政机构 id(其 isDept 直接子级 = 责任部门候选)*/
  deptScope: (subject: Organization, idx: OrgIndex) => string | undefined;
}

export const RELATIONS: RelationDef[] = [
  // ─ 党建 ─
  {
    key: 'party.company.committee',
    track: 'party',
    level: 'company',
    label: '公司党委考核基层党委',
    subjectLabel: '公司党委',
    objectLabel: '基层党委',
    objectKind: 'org',
    subjects: (idx) => (idx.partyRoot ? [idx.partyRoot] : []),
    objectOrgs: (subject, idx) => kids(idx, subject.id).filter(isCommittee),
    deptScope: (_s, idx) => idx.agencyAdminWrapperId,
  },
  {
    key: 'party.agency.branch',
    track: 'party',
    level: 'company',
    label: '机关党委考核党支部',
    subjectLabel: '机关党委',
    objectLabel: '党支部',
    objectKind: 'org',
    subjects: (idx) => {
      const c = idx.agencyPartyCommitteeId ? idx.byId.get(idx.agencyPartyCommitteeId) : undefined;
      return c ? [c] : [];
    },
    objectOrgs: (subject, idx) => kids(idx, subject.id).filter(isBranch),
    deptScope: (_s, idx) => idx.agencyAdminWrapperId,
  },
  {
    key: 'party.grassroots.branch',
    track: 'party',
    level: 'unit2',
    label: '基层党委考核党支部',
    subjectLabel: '基层党委',
    objectLabel: '党支部',
    objectKind: 'org',
    subjects: (idx) =>
      idx.partyRoot
        ? kids(idx, idx.partyRoot.id).filter(
            (o) => isCommittee(o) && o.id !== idx.agencyPartyCommitteeId,
          )
        : [],
    objectOrgs: (subject, idx) => kids(idx, subject.id).filter(isBranch),
    deptScope: (subject, idx) => idx.linkedAdminByParty.get(subject.id),
  },
  {
    key: 'party.branch.member',
    track: 'party',
    level: 'unit3',
    label: '党支部考核党员',
    subjectLabel: '党支部',
    objectLabel: '党员',
    objectKind: 'user',
    subjects: (idx) => [...idx.byId.values()].filter(isBranch),
    objectOrgs: (subject) => [subject],
    deptScope: (subject, idx) => {
      const direct = idx.linkedAdminByParty.get(subject.id);
      if (direct) return direct;
      const parent = subject.parentId ? idx.linkedAdminByParty.get(subject.parentId) : undefined;
      return parent ?? idx.agencyAdminWrapperId;
    },
  },
  // ─ 行政 ─
  {
    key: 'admin.company.unit2',
    track: 'admin',
    level: 'company',
    label: '公司考核二级单位',
    subjectLabel: '公司',
    objectLabel: '二级单位',
    objectKind: 'org',
    subjects: (idx) => (idx.adminRoot ? [idx.adminRoot] : []),
    objectOrgs: (_subject, idx) => [...idx.byId.values()].filter(isUnit2),
    deptScope: (_s, idx) => idx.agencyAdminWrapperId,
  },
  {
    key: 'admin.unit2.unit3',
    track: 'admin',
    level: 'unit2',
    label: '二级单位考核三级单位',
    subjectLabel: '二级单位',
    objectLabel: '三级单位',
    objectKind: 'org',
    subjects: (idx) => [...idx.byId.values()].filter(isUnit2),
    objectOrgs: (subject, idx) => kids(idx, subject.id).filter((o) => !o.isVirtual),
    deptScope: (subject) => subject.id,
  },
  {
    key: 'admin.unit3.employee',
    track: 'admin',
    level: 'unit3',
    label: '三级单位考核员工',
    subjectLabel: '三级单位',
    objectLabel: '员工',
    objectKind: 'user',
    subjects: (idx) => [...idx.byId.values()].filter((o) => isUnit3(o, idx)),
    objectOrgs: (subject) => [subject],
    deptScope: (subject) => subject.id,
  },
];

export function getRelation(key?: string): RelationDef | undefined {
  return key ? RELATIONS.find((r) => r.key === key) : undefined;
}

/* ─── 登录账号 → 可担任的主体(按 membership 所在层级收敛)─── */

/** climb：org 是否在 ancestorId 子树内(含自身)*/
function isUnder(idx: OrgIndex, orgId: string, ancestorId: string): boolean {
  let cur: string | undefined = orgId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = idx.byId.get(cur)?.parentId ?? undefined;
  }
  return false;
}

/** 某行政 membership org → 该账号可担任的行政主体 { company?, unit2?, unit3? } */
export function adminSubjectsOf(
  idx: OrgIndex,
  orgId: string,
): { company?: string; unit2?: string; unit3?: string } {
  const out: { company?: string; unit2?: string; unit3?: string } = {};
  const org = idx.byId.get(orgId);
  if (!org || org.kind !== 'admin') return out;
  // 公司机关身处(root 或 公司机关壳子树)→ company
  if (
    (idx.adminRoot && org.id === idx.adminRoot.id) ||
    (idx.agencyAdminWrapperId && isUnder(idx, org.id, idx.agencyAdminWrapperId))
  ) {
    if (idx.adminRoot) out.company = idx.adminRoot.id;
    return out;
  }
  // 找二级单位祖先(含自身)
  let cur: Organization | undefined = org;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (isUnit2(cur)) {
      out.unit2 = cur.id;
      break;
    }
    seen.add(cur.id);
    cur = cur.parentId ? idx.byId.get(cur.parentId) : undefined;
  }
  if (isUnit3(org, idx)) out.unit3 = org.id;
  return out;
}

/** 某党组织 membership org → 该账号可担任的党建主体 */
export function partySubjectsOf(
  idx: OrgIndex,
  orgId: string,
): { company?: boolean; agency?: string; grassroots?: string; branch?: string } {
  const out: { company?: boolean; agency?: string; grassroots?: string; branch?: string } = {};
  const org = idx.byId.get(orgId);
  if (!org || org.kind !== 'party') return out;
  // root 或 机关党委子树 → company(可担任公司党委 + 机关党委)
  if (idx.partyRoot && org.id === idx.partyRoot.id) {
    out.company = true;
    if (idx.agencyPartyCommitteeId) out.agency = idx.agencyPartyCommitteeId;
    return out;
  }
  if (idx.agencyPartyCommitteeId && isUnder(idx, org.id, idx.agencyPartyCommitteeId)) {
    out.company = true;
    out.agency = idx.agencyPartyCommitteeId;
    return out;
  }
  // 基层党委祖先(root 的直接 committee 子级,非机关)
  if (idx.partyRoot) {
    for (const c of kids(idx, idx.partyRoot.id)) {
      if (isCommittee(c) && c.id !== idx.agencyPartyCommitteeId && isUnder(idx, org.id, c.id)) {
        out.grassroots = c.id;
        break;
      }
    }
  }
  if (isBranch(org)) out.branch = org.id;
  return out;
}
