import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { OrgScopeService, type OrgWriteScope } from '../organization';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto, SCOPE_VALUES } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { ContactsQuery } from './dto/contacts.query';
import {
  LookupByEmpNoDto,
  LookupByNameDto,
  UserByEmpNoLite,
} from './dto/lookup-by-empno.dto';
import { AuditService } from '../audit';
import { UserCustomFieldService } from '../user-custom-field';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/**
 * 「政治面貌=中共党员 / 中共预备党员」在 customFields JSON 文本里的锚定子串(任一命中即算党员)。
 * customFields 由 JSON.stringify 落库(无空格、键值紧邻),select 字段存字典项 code
 * (自定义字段 political_status / 字典 user_political_status)——尾引号保证精确匹配整值。
 * ⚠ 与 seed / import 模块的字段编码耦合,改编码需同步这里。
 */
const PARTY_MEMBER_CF_ANCHORS = [
  '"political_status":"party_member"',
  '"political_status":"probationary_member"',
];
/** 政治面貌为(预备)党员的 Prisma 条件(OR 任一锚定子串命中) */
const IS_PARTY_MEMBER_WHERE: Prisma.UserWhereInput = {
  OR: PARTY_MEMBER_CF_ANCHORS.map((v) => ({ customFields: { contains: v } })),
};

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customFields: UserCustomFieldService,
    private readonly orgScope: OrgScopeService,
  ) {}

  /* ─── 数据范围(2026-07-12 三级数据权限)────────────────────────────
   * 读:list/stats/findOneScoped 按登录人可见范围收敛(管理范围 ∪ 对口上级 ∪ 本单位兜底);
   *     「完全无归属」的悬空用户(未分配/刚创建)对任何有管理范围的人可见 —— 可认领归位。
   * 写:按目标用户归属的维度覆盖判定 ——
   *     行政维覆盖(目标任一行政归属 ∈ 行政写范围)→ 资料 + 行政归属 + 在职状态;
   *     党维覆盖(目标党组织归属 ∈ 党维写范围)→ 联系方式 + 党组织归属(党委管理员口径);
   *     归属增删按「目标组织」的 kind 对应维度校验(把人挂进/移出哪个组织,以组织定权)。
   * ⚠ 只在 controller 入口路径强制;模块间 DI 调用(import 批量导入等)行为不变
   *     —— 导入接口本身有 @Permission 且导入人实践中是系统管理员。 */

  /** 解析写范围;无登录身份直接拒(带 @Permission 的入口必有身份,防御性兜底) */
  private async userWriteScopeOf(actor: ActorContext): Promise<OrgWriteScope> {
    if (!actor.actorId) throw new ForbiddenException('缺少操作人身份');
    return this.orgScope.resolveWrite(actor.actorId, 'admin:user:write');
  }

  /** 目标用户被 actor 写范围覆盖的维度(悬空用户=行政维管理员可处置) */
  private async targetWriteCoverage(ws: OrgWriteScope, targetUserId: string) {
    if (ws.unrestricted) return { adminCovered: true, partyCovered: true };
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId: targetUserId },
      select: { orgId: true, org: { select: { kind: true } } },
    });
    let adminCovered = false;
    let partyCovered = false;
    for (const r of rows) {
      if (r.org.kind === 'admin' && ws.adminOrgIds.has(r.orgId)) adminCovered = true;
      if (r.org.kind === 'party' && ws.partyOrgIds.has(r.orgId)) partyCovered = true;
    }
    if (rows.length === 0 && ws.adminOrgIds.size > 0) adminCovered = true;
    return { adminCovered, partyCovered };
  }

  /**
   * 归属增删前置:目标用户在「操作维度」上必须是 (维度内悬空:该 kind 无任何归属) 或 (已被 actor 覆盖)。
   * 这是防「认领抢人」的核心闸门 —— 否则有范围管理员可把别单位的正式成员挂进自己组织,
   * 从而伪造覆盖、进而改其资料/停用/改身份证(审查 finding #1)。
   *   - 加/删 admin 组织 → 看行政维:目标无任何行政归属(可认领) 或 某行政归属 ∈ 我行政写范围;
   *   - 加/删 party 组织 → 看党维:目标无党组织归属(党委管理员首次给党员挂支部) 或 党组织归属 ∈ 我党维写范围。
   * 维度内判定(而非「完全悬空」):党委管理员给「有行政归属、无党组织」的党员挂支部属党维认领,应放行;
   * 而机构管理员抢「别单位正式行政成员」在行政维非悬空、未覆盖,被拒。
   */
  private async assertTargetInDimension(ws: OrgWriteScope, targetUserId: string, orgKind: string) {
    if (ws.unrestricted) return;
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId: targetUserId, org: { kind: orgKind } },
      select: { orgId: true },
    });
    if (rows.length === 0) return; // 该维度悬空 → 可认领/首次分配
    const set = orgKind === 'party' ? ws.partyOrgIds : ws.adminOrgIds;
    if (rows.some((r) => set.has(r.orgId))) return; // 已被覆盖
    throw new ForbiddenException('该用户已归属你管理范围外的组织,不能调整其归属');
  }

  /** 读可见范围 → Prisma where 片段(unrestricted 返回 null = 不加条件) */
  private async visibilityWhere(actorId: string): Promise<Prisma.UserWhereInput | null> {
    const s = await this.orgScope.resolveUserRead(actorId);
    if (s.unrestricted) return null;
    const union = new Set<string>();
    for (const set of [s.adminOrgIds, s.partyOrgIds, s.counterpartOrgIds, s.fallbackOrgIds]) {
      for (const id of set) union.add(id);
    }
    const ors: Prisma.UserWhereInput[] = [{ id: actorId }]; // 本人恒可见
    if (union.size > 0) ors.unshift({ memberships: { some: { orgId: { in: [...union] } } } });
    // 悬空用户(完全无归属)只对「有管理范围」的人可见 —— 机构/党委管理员认领归位用
    if (s.adminOrgIds.size > 0 || s.partyOrgIds.size > 0) {
      ors.push({ memberships: { none: {} } });
    }
    return { OR: ors };
  }

  /** customFields 字符串安全解析 */
  private parseCustomFields(raw: string | null): Record<string, string> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /* ─── 列表 (分页 + 过滤) ─── */
  async list(query: ListUsersQuery, actorId: string) {
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;

    // 拼装 where
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      // mode: 'insensitive' 保持 SQLite 时代的大小写不敏感搜索(PG 默认大小写敏感)
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.active === 'true') where.active = true;
    if (query.active === 'false') where.active = false;

    // 归属过滤收进 AND 数组逐条叠加 —— 原先直接赋值 where.memberships,
    // 多个条件组合时后一个 spread 会覆盖前一个的 some 键(如 adminOrgId+partyOrgId 只剩 party 生效)
    const membershipConds: Prisma.UserWhereInput[] = [];
    if (query.adminOrgIds?.length) {
      membershipConds.push({
        memberships: { some: { orgId: { in: query.adminOrgIds }, org: { kind: 'admin' } } },
      });
    } else if (query.adminOrgId) {
      // adminOrgSubtree:子树在服务端展开(几百个 id 拼 GET URL 会超 Node 16KB 请求头上限)
      const orgIds =
        query.adminOrgSubtree === 'true'
          ? await this.adminSubtreeIds(query.adminOrgId)
          : [query.adminOrgId];
      membershipConds.push({
        memberships: {
          some: {
            orgId: orgIds.length === 1 ? orgIds[0] : { in: orgIds },
            org: { kind: 'admin' },
          },
        },
      });
    }
    if (query.partyOrgId) {
      membershipConds.push({
        memberships: { some: { orgId: query.partyOrgId, org: { kind: 'party' } } },
      });
    }
    if (query.hasParty === 'true') {
      membershipConds.push({ memberships: { some: { org: { kind: 'party' } } } });
    }
    if (query.noAdminOrg === 'true') {
      membershipConds.push({ memberships: { none: { org: { kind: 'admin' } } } });
    }
    if (query.noPartyOrg === 'true') {
      // 「党组织未分配」只看政治面貌=中共党员/预备党员的人(群众/共青团员本就不该挂党组织,不算)
      membershipConds.push(IS_PARTY_MEMBER_WHERE);
      membershipConds.push({ memberships: { none: { org: { kind: 'party' } } } });
    }
    // 所属机构是否是「部门」(isDept):是 = 挂在任一部门;否 = 有行政归属但不在任何部门
    if (query.inDept === 'true') {
      membershipConds.push({ memberships: { some: { org: { kind: 'admin', isDept: true } } } });
    } else if (query.inDept === 'false') {
      membershipConds.push({ memberships: { some: { org: { kind: 'admin' } } } });
      membershipConds.push({ memberships: { none: { org: { kind: 'admin', isDept: true } } } });
    }
    // 行政职务关键词:任一「包含」命中即算(职务多为复合串,如「党委委员、副经理」,精确匹配没法用)
    if (query.positionKeywords?.length) {
      membershipConds.push({
        memberships: {
          some: {
            org: { kind: 'admin' },
            OR: query.positionKeywords.map((k) => ({
              position: { contains: k, mode: 'insensitive' as const },
            })),
          },
        },
      });
    }
    // 政治面貌:任一字典 code 命中即算(锚定子串,同 IS_PARTY_MEMBER_WHERE 的存储格式约定)
    if (query.politicalStatuses?.length) {
      const anchors = query.politicalStatuses
        .filter((c) => /^[a-z0-9_]+$/i.test(c))
        .map((c) => `"political_status":"${c}"`);
      // 全部 code 非法 → fail-closed 返回空集(静默放行会把「过滤失效」伪装成全库结果)
      membershipConds.push(
        anchors.length > 0
          ? { OR: anchors.map((a) => ({ customFields: { contains: a } })) }
          : { id: { in: [] } },
      );
    }
    // 角色:任一命中即算
    if (query.roleIds?.length) {
      membershipConds.push({ roles: { some: { roleId: { in: query.roleIds } } } });
    }
    // 部门负责人:id 是否出现在任一行政机构的 meta.ownerUserId 里
    if (query.deptOwner === 'true' || query.deptOwner === 'false') {
      const ownerIds = await this.adminDeptOwnerIds();
      membershipConds.push(
        query.deptOwner === 'true' ? { id: { in: ownerIds } } : { id: { notIn: ownerIds } },
      );
    }
    // 数据范围:客户端过滤条件 ∩ 登录人可见范围(范围外的过滤参数自然得到空集)
    const visWhere = await this.visibilityWhere(actorId);
    if (visWhere) membershipConds.push(visWhere);

    if (membershipConds.length > 0) where.AND = membershipConds;

    // id 副键保证稳定分页:批量导入的 createdAt 大量并列,PG 对并列行顺序不确定,
    // 无副键时翻页会重复/漏人
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
      { id: 'asc' },
    ];

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          memberships: { include: { org: true } },
          roles: true,
        },
      }),
    ]);

    return {
      total,
      items: rows.map((u) => {
        const adminPrimary = u.memberships.find((m) => m.org.kind === 'admin' && m.isPrimary);
        const partyPrimary = u.memberships.find((m) => m.org.kind === 'party' && m.isPrimary);
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          email: u.email,
          phone: u.phone,
          avatarUrl: u.avatarUrl,
          active: u.active,
          createdAt: u.createdAt,
          primaryAdmin: adminPrimary
            ? { orgId: adminPrimary.orgId, orgName: adminPrimary.org.name, position: adminPrimary.position }
            : null,
          partyAffiliation: partyPrimary
            ? { orgId: partyPrimary.orgId, orgName: partyPrimary.org.name, position: partyPrimary.position }
            : null,
          membershipCount: u.memberships.length,
          roleCount: u.roles.length,
        };
      }),
    };
  }

  /**
   * 全部行政机构按「组织树 DFS(父→子,同级 sortOrder→名称→id)」的全局序号。
   * 通讯录「组织顺序」展示用:机关部门在前(公司机关 sortOrder 靠前),一个部门接一个部门。
   * 机构量级几百,一次全查内存计算。
   */
  private async adminOrgDfsOrder(): Promise<{ id: string; seq: number }[]> {
    const rows = await this.prisma.organization.findMany({
      where: { kind: 'admin', active: true },
      select: { id: true, parentId: true, sortOrder: true, name: true },
    });
    const sortSib = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh') || a.id.localeCompare(b.id);
    // 断链兜底:parentId 为空 或 上级已停用(不在 active 集里)→ 视为根,保证每个活跃机构都拿到 seq
    // (否则:软删/停用某中层机构后,其仍活跃的子部门从根 DFS 不可达 → 成员从默认视图与总数里凭空消失)。
    const present = new Set(rows.map((r) => r.id));
    const children = new Map<string, typeof rows>();
    const roots: typeof rows = [];
    for (const r of rows) {
      if (r.parentId === null || !present.has(r.parentId)) {
        roots.push(r);
      } else {
        const arr = children.get(r.parentId);
        if (arr) arr.push(r);
        else children.set(r.parentId, [r]);
      }
    }
    const out: { id: string; seq: number }[] = [];
    const seen = new Set<string>();
    let seq = 0;
    const visit = (node: (typeof rows)[number]) => {
      if (seen.has(node.id)) return; // 防御环(组织树本应无环)
      seen.add(node.id);
      out.push({ id: node.id, seq: seq++ });
      for (const child of (children.get(node.id) ?? []).slice().sort(sortSib)) visit(child);
    };
    for (const root of roots.slice().sort(sortSib)) visit(root);
    return out;
  }

  /** adminOrgId 及其全部后代机构 id(含自身)。机构量级几百,一次全查内存 BFS。 */
  private async adminSubtreeIds(rootId: string): Promise<string[]> {
    const rows = await this.prisma.organization.findMany({
      where: { kind: 'admin' },
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.parentId) continue;
      const arr = children.get(r.parentId);
      if (arr) arr.push(r.id);
      else children.set(r.parentId, [r.id]);
    }
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      out.push(id);
      for (const c of children.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  /**
   * 全部行政机构「部门负责人」的 userId 集合(组织页编辑部门时指定的 meta.ownerUserId)。
   * 机构量级几百、仅在带 deptOwner 过滤时查一次,直读 meta 文本解析即可。
   * (user 模块内读 Organization 表已有先例:replaceMemberships/addMembership 的存在性校验)
   */
  private async adminDeptOwnerIds(): Promise<string[]> {
    const rows = await this.prisma.organization.findMany({
      where: { kind: 'admin', meta: { contains: '"ownerUserId"' } },
      select: { meta: true },
    });
    const ids = new Set<string>();
    for (const r of rows) {
      try {
        const owner = (JSON.parse(r.meta ?? '{}') as { ownerUserId?: unknown }).ownerUserId;
        if (typeof owner === 'string' && owner) ids.add(owner);
      } catch {
        /* 忽略坏 JSON */
      }
    }
    return Array.from(ids);
  }

  /**
   * 统计:总数 / 在职数 / 行政机构未分配 / 党组织未分配 —— 用户管理工具条角标用(不受列表过滤影响)。
   * 口径 = 登录人可见范围(系统管理员即全库;与列表可见性同口径,角标数=点击后的 total)。
   * noPartyOrg 只统计政治面貌=中共党员/预备党员的人(与列表 noPartyOrg 过滤同口径)。
   */
  async stats(actorId: string) {
    const visWhere = await this.visibilityWhere(actorId);
    const scoped = (extra: Prisma.UserWhereInput): Prisma.UserWhereInput =>
      visWhere ? { AND: [visWhere, extra] } : extra;
    const [total, active, noAdminOrg, noPartyOrg] = await Promise.all([
      this.prisma.user.count({ where: visWhere ?? {} }),
      this.prisma.user.count({ where: scoped({ active: true }) }),
      this.prisma.user.count({ where: scoped({ memberships: { none: { org: { kind: 'admin' } } } }) }),
      this.prisma.user.count({
        where: scoped({
          ...IS_PARTY_MEMBER_WHERE,
          memberships: { none: { org: { kind: 'party' } } },
        }),
      }),
    ]);
    return { total, active, noAdminOrg, noPartyOrg };
  }

  /** 批量按 id 查姓名:{ id → name }(展示用;不存在/停用的 id 不在结果里)。跨模块松引用解析名字用。 */
  async namesByIds(ids: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
    if (!uniq.length) return {};
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.id] = r.name;
    return out;
  }

  /** 批量按 id 查 { name, phone, username }(展示 + 电话提醒用)。跨模块松引用解析。 */
  async profilesByIds(
    ids: string[],
  ): Promise<Record<string, { name: string; phone: string | null; username: string }>> {
    const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
    if (!uniq.length) return {};
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true, phone: true, username: true },
    });
    const out: Record<string, { name: string; phone: string | null; username: string }> = {};
    for (const r of rows) out[r.id] = { name: r.name, phone: r.phone, username: r.username };
    return out;
  }

  /**
   * 批量按用户 id 查其行政机构归属 orgId 列表(主归属在前)。
   * 消费方(assessment 荣誉自动取数):证书 recipientUserId → 行政归属 → 上卷到被考核单位。
   */
  async adminOrgIdsByUserIds(ids: string[]): Promise<Record<string, string[]>> {
    const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
    if (!uniq.length) return {};
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId: { in: uniq }, org: { kind: 'admin' } },
      orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
      select: { userId: true, orgId: true },
    });
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.userId] ??= []).push(r.orgId);
    return out;
  }

  /**
   * 轻量用户检索(内部通讯录级,登录即可):按姓名/工号搜索,只回 id/姓名/工号/头像/主归属,
   * 不含邮箱/电话等联系明细 —— 供跨范围选人组件用(知识维护人/证书受表彰人/报送个人对象等),
   * 与既有 lookup-by-name / lookup-by-empno 的开放程度一致。
   */
  async directory(search: string | undefined, takeRaw?: number) {
    const take = Math.min(Math.max(takeRaw ?? 20, 1), 50);
    const where: Prisma.UserWhereInput = { active: true };
    const q = (search ?? '').trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
      include: {
        memberships: { include: { org: { select: { id: true, name: true, kind: true } } }, orderBy: [{ isPrimary: 'desc' }] },
      },
    });
    return {
      items: rows.map((u) => {
        const adminPrimary = u.memberships.find((m) => m.org.kind === 'admin');
        const partyPrimary = u.memberships.find((m) => m.org.kind === 'party');
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          avatarUrl: u.avatarUrl,
          primaryAdmin: adminPrimary
            ? { orgId: adminPrimary.orgId, orgName: adminPrimary.org.name, position: adminPrimary.position }
            : null,
          partyAffiliation: partyPrimary
            ? { orgId: partyPrimary.orgId, orgName: partyPrimary.org.name, position: partyPrimary.position }
            : null,
        };
      }),
    };
  }

  /**
   * 通讯录(内部公司通讯录):按姓名/工号/电话/邮箱/所属机构名搜索 + 部门/党组织/政治面貌/是否部门过滤,
   * 分页返回联系信息(姓名/工号/头像/电话/邮箱/主行政岗/党组织/政治面貌)。仅在职人员。
   *
   * ⚠ 登录即可、【不】做数据范围收敛 —— 用户决策:内部通讯录全员可查同事联系方式。
   *   与 list()(管理向、按可见范围收敛、含身份证/角色等)刻意分开:contacts 只回联系字段,不回 customFields 明细。
   */
  async contacts(query: ContactsQuery) {
    const take = Math.min(Math.max(query.take ?? 30, 1), 100);
    const skip = Math.max(query.skip ?? 0, 0);
    // 负责人集合(行政机构 meta.ownerUserId)→ 卡片「负责人」标识
    const ownerIds = new Set(await this.adminDeptOwnerIds());

    // 非「行政机构浏览」维度的过滤(搜索/党组织/仅党员/是否部门/政治面貌/对口机构集)—— 各查询模式共用
    const userAnds: Prisma.UserWhereInput[] = [];
    // 对口上级机构 / 下级承接部门 视图:限定到一组行政机构(非空即视为过滤,不进「组织顺序」默认模式)
    if (query.adminOrgIds?.length) {
      userAnds.push({
        memberships: { some: { orgId: { in: query.adminOrgIds }, org: { kind: 'admin' } } },
      });
    }
    const q = (query.search ?? '').trim();
    if (q) {
      userAnds.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          // 搜部门名 → 出该机构的人(通讯录常见用法:按单位/部门名找联系人)
          { memberships: { some: { org: { name: { contains: q, mode: 'insensitive' } } } } },
        ],
      });
    }
    if (query.partyOrgId) {
      userAnds.push({ memberships: { some: { orgId: query.partyOrgId, org: { kind: 'party' } } } });
    }
    if (query.hasParty === 'true') {
      userAnds.push({ memberships: { some: { org: { kind: 'party' } } } });
    }
    // 是否部门:true=挂在任一部门;false=有行政归属但不在任何部门(与 list() 同口径,兑现 DTO 契约)
    if (query.inDept === 'true') {
      userAnds.push({ memberships: { some: { org: { kind: 'admin', isDept: true } } } });
    } else if (query.inDept === 'false') {
      userAnds.push({ memberships: { some: { org: { kind: 'admin' } } } });
      userAnds.push({ memberships: { none: { org: { kind: 'admin', isDept: true } } } });
    }
    if (query.politicalStatuses?.length) {
      // 锚定子串(同 IS_PARTY_MEMBER_WHERE 存储格式约定);全非法 → fail-closed 空集,不静默放行
      const anchors = query.politicalStatuses
        .filter((c) => /^[a-z0-9_]+$/i.test(c))
        .map((c) => `"political_status":"${c}"`);
      userAnds.push(
        anchors.length > 0
          ? { OR: anchors.map((a) => ({ customFields: { contains: a } })) }
          : { id: { in: [] } },
      );
    }

    // 通讯录基线:在职 + 未被隐藏(隐藏的人对访客完全不出现,含搜索)
    const userBase: Prisma.UserWhereInput = { active: true, directoryHidden: false };
    if (userAnds.length > 0) userBase.AND = userAnds;

    const memberInclude = {
      memberships: {
        include: { org: { select: { id: true, name: true, kind: true } } },
        orderBy: [{ isPrimary: 'desc' as const }],
      },
    };

    // 单位直属模式:选定某行政机构 + 未含下级 → 按该单位的 sortOrder 排
    // (组织管理 / 通讯录管理拖拽的统一顺序;体现在门户展示)
    const unitDirect = !!query.adminOrgId && query.adminOrgSubtree !== 'true';
    if (unitDirect) {
      const memberWhere: Prisma.UserOrganizationWhereInput = {
        orgId: query.adminOrgId,
        org: { kind: 'admin' },
        user: userBase,
      };
      const [total, rows] = await Promise.all([
        this.prisma.userOrganization.count({ where: memberWhere }),
        this.prisma.userOrganization.findMany({
          where: memberWhere,
          orderBy: [{ sortOrder: 'asc' }, { user: { name: 'asc' } }, { userId: 'asc' }],
          take,
          skip,
          include: { user: { include: memberInclude } },
        }),
      ]);
      return { total, items: rows.map((m) => this.contactItemOf(m.user, ownerIds)) };
    }

    // 组织顺序模式:纯默认浏览(无单位、无搜索、无筛选)→ 全部人员按组织树 DFS 排
    // (机关部门在前,一个部门接一个部门;部门内按统一 sortOrder)。用 VALUES 传 DFS 序号让 PG 排序+分页,
    // 只回本页 id 再水合,避免全量拉取。仅含有主行政归属的人(未分配行政机构者不进此默认视图,可搜索到)。
    if (!query.adminOrgId && userAnds.length === 0) {
      const order = await this.adminOrgDfsOrder();
      if (order.length > 0) {
        const values = Prisma.join(order.map((o) => Prisma.sql`(${o.id}::text, ${o.seq}::int)`));
        const popWhere = Prisma.sql`
          FROM "User" u
          JOIN "UserOrganization" uo ON uo."userId" = u.id AND uo."isPrimary" = true
          JOIN "Organization" o ON o.id = uo."orgId" AND o.kind = 'admin' AND o.active = true
          JOIN (VALUES ${values}) AS ord(orgid, seq) ON ord.orgid = o.id
          WHERE u.active = true AND u."directoryHidden" = false`;
        // DISTINCT ON (u.id):同一人若有多条 isPrimary 行政归属(无 DB 唯一约束,合并账号脚本可能造成),
        // 取其最靠前的组织位置,避免默认视图重复卡片 + 总数虚高。
        const [idRows, cntRows] = await Promise.all([
          this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM (
              SELECT DISTINCT ON (u.id) u.id AS id, ord.seq AS seq, uo."sortOrder" AS so, u.name AS nm
              ${popWhere}
              ORDER BY u.id, ord.seq, uo."sortOrder"
            ) t
            ORDER BY t.seq, t.so, t.nm, t.id
            LIMIT ${take} OFFSET ${skip}`),
          this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(DISTINCT u.id)::bigint AS count ${popWhere}`),
        ]);
        const idList = idRows.map((r) => r.id);
        const users = await this.prisma.user.findMany({
          where: { id: { in: idList } },
          include: memberInclude,
        });
        const byId = new Map(users.map((u) => [u.id, u] as const));
        const items = idList
          .map((id) => byId.get(id))
          .filter((u): u is NonNullable<typeof u> => !!u)
          .map((u) => this.contactItemOf(u, ownerIds));
        return { total: Number(cntRows[0]?.count ?? 0), items };
      }
    }

    // 广义模式:按姓名分页(含下级子树 / 搜索 / 带筛选),id 副键稳定分页
    const where: Prisma.UserWhereInput = { active: true, directoryHidden: false };
    const broadAnds = [...userAnds];
    if (query.adminOrgId) {
      const orgIds =
        query.adminOrgSubtree === 'true'
          ? await this.adminSubtreeIds(query.adminOrgId)
          : [query.adminOrgId];
      broadAnds.push({
        memberships: {
          some: { orgId: orgIds.length === 1 ? orgIds[0] : { in: orgIds }, org: { kind: 'admin' } },
        },
      });
    }
    if (broadAnds.length > 0) where.AND = broadAnds;

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take,
        skip,
        include: memberInclude,
      }),
    ]);
    return { total, items: rows.map((u) => this.contactItemOf(u, ownerIds)) };
  }

  /** User(含 memberships)→ 通讯录条目(主行政岗 + 党组织 + 政治面貌 + 负责人标识) */
  private contactItemOf(u: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
    phone: string | null;
    email: string | null;
    customFields: string | null;
    memberships: { orgId: string; position: string | null; org: { name: string; kind: string } }[];
  }, ownerIds?: Set<string>) {
    const adminMember = u.memberships.find((m) => m.org.kind === 'admin');
    const partyMember = u.memberships.find((m) => m.org.kind === 'party');
    const cf = this.parseCustomFields(u.customFields);
    const political = typeof cf.political_status === 'string' ? cf.political_status : null;
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      avatarUrl: u.avatarUrl,
      phone: u.phone,
      email: u.email,
      politicalStatus: political,
      // 负责人:被设为某行政机构 meta.ownerUserId(编辑行政机构时指定的部门负责人)
      isLeader: ownerIds ? ownerIds.has(u.id) : false,
      admin: adminMember
        ? { orgId: adminMember.orgId, orgName: adminMember.org.name, position: adminMember.position }
        : null,
      party: partyMember
        ? { orgId: partyMember.orgId, orgName: partyMember.org.name, position: partyMember.position }
        : null,
    };
  }

  /* ─── 通讯录个人收藏(门户右栏「收藏」;登录即可、每人自己的)─── */
  /** 我收藏的联系人(按收藏时间倒序,含负责人标识;离职者不显示) */
  async myFavorites(userId: string) {
    const favs = await this.prisma.directoryFavorite.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { targetUserId: true },
    });
    const ids = favs.map((f) => f.targetUserId);
    if (ids.length === 0) return { items: [] };
    const ownerIds = new Set(await this.adminDeptOwnerIds());
    // 与 contacts() 同口径:隐藏(directoryHidden)/离职者不显示 —— 否则收藏路径会绕过隐私隐藏
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, active: true, directoryHidden: false },
      include: {
        memberships: {
          include: { org: { select: { id: true, name: true, kind: true } } },
          orderBy: [{ isPrimary: 'desc' }],
        },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u] as const));
    const items = ids
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => this.contactItemOf(u, ownerIds));
    return { items };
  }

  async addFavorite(userId: string, targetId: string) {
    // 拒绝收藏隐藏/离职者(防在写入侧就绕过 directoryHidden 隐私隐藏;不暴露「被隐藏」细节)
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, active: true, directoryHidden: true },
    });
    if (!target || !target.active || target.directoryHidden) throw new NotFoundException('用户不存在');
    await this.prisma.directoryFavorite.upsert({
      where: { ownerId_targetUserId: { ownerId: userId, targetUserId: targetId } },
      create: { ownerId: userId, targetUserId: targetId },
      update: {},
    });
    return { ok: true };
  }

  async removeFavorite(userId: string, targetId: string) {
    await this.prisma.directoryFavorite.deleteMany({ where: { ownerId: userId, targetUserId: targetId } });
    return { ok: true };
  }

  /**
   * 本人部门的对口关系(门户「对口上级机构 / 下级承接部门」默认视图):
   *   superiorOrgs   = 本人所在行政部门 meta.counterpartParentOrgIds 指向的机关上级
   *   subordinateOrgs= meta.counterpartParentOrgIds 指向了本人所在部门的下级(反查)
   * 仅返回活跃行政机构。
   */
  async counterpartScope(userId: string) {
    const homes = await this.prisma.userOrganization.findMany({
      where: { userId, org: { kind: 'admin' } },
      select: { orgId: true },
    });
    const homeIds = new Set(homes.map((h) => h.orgId));
    if (homeIds.size === 0) return { superiorOrgs: [], subordinateOrgs: [] };

    const orgs = await this.prisma.organization.findMany({
      where: { kind: 'admin', active: true },
      select: { id: true, name: true, meta: true, parentId: true, isVirtual: true },
    });
    const byId = new Map(orgs.map((o) => [o.id, o] as const));
    // 所在二级单位:向上找到「父为虚拟壳(公司机关/基层单位)或根」的最近祖先(含自身)。
    // 综合办公室(L3)→ 新疆分公司(L2,父=基层单位虚拟);机关部门(L2 dept,父=公司机关虚拟)→ 自身。
    const owningUnitOf = (orgId: string): { id: string; name: string } | null => {
      let cur = byId.get(orgId);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const parent = cur.parentId ? byId.get(cur.parentId) : null;
        if (!parent || parent.isVirtual) return { id: cur.id, name: cur.name };
        cur = parent;
      }
      return null;
    };
    const cpOf = (meta: string | null): string[] => {
      if (!meta) return [];
      try {
        const p = JSON.parse(meta) as {
          counterpartParentOrgIds?: unknown;
          counterpartParentOrgId?: unknown;
        };
        const out: string[] = [];
        if (Array.isArray(p.counterpartParentOrgIds)) {
          for (const x of p.counterpartParentOrgIds) if (typeof x === 'string') out.push(x);
        }
        if (typeof p.counterpartParentOrgId === 'string') out.push(p.counterpartParentOrgId);
        return out;
      } catch {
        return [];
      }
    };
    const superiorIds = new Set<string>();
    const subordinateIds = new Set<string>();
    for (const o of orgs) {
      const cps = cpOf(o.meta);
      if (homeIds.has(o.id)) for (const cp of cps) superiorIds.add(cp); // 本人部门 → 其对口上级
      if (cps.some((cp) => homeIds.has(cp))) subordinateIds.add(o.id); // 对口到本人部门的下级
    }
    // 每个对口机构附「所在二级单位」(unitId/unitName)—— 门户按二级单位筛选对口通讯录
    const toOrg = (id: string) => {
      const unit = owningUnitOf(id);
      return { id, name: byId.get(id)?.name ?? '', unitId: unit?.id ?? null, unitName: unit?.name ?? null };
    };
    return {
      superiorOrgs: [...superiorIds].filter((id) => byId.has(id)).map(toOrg),
      subordinateOrgs: [...subordinateIds].map(toOrg),
    };
  }

  /**
   * 详情(GET /users/:id controller 入口)—— 返回完整档案(含身份证等 customFields、roles)。
   * 因此按「管理覆盖」而非「读可见」收敛:本人恒放行;否则须 unrestricted 或对目标有写维度覆盖
   * (悬空用户对有管理范围者视为覆盖,可认领前查看)。
   * 读兜底(本单位子树)/对口上级层【只】给 list/directory 的最小字段与 members 的 direct 名单,
   * 【不】经此端点外泄身份证 —— 否则任意机关员工可 GET 全公司身份证(finding #3)。
   */
  async findOneScoped(actorId: string, id: string) {
    if (actorId !== id) {
      const ws = await this.userWriteScopeOf({ actorId });
      if (!ws.unrestricted) {
        const cov = await this.targetWriteCoverage(ws, id);
        if (!cov.adminCovered && !cov.partyCovered) {
          throw new ForbiddenException('该用户不在你的管理范围内');
        }
      }
    }
    return this.findOne(id);
  }

  /* ─── 详情 ─── */
  async findOne(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { org: true }, orderBy: [{ isPrimary: 'desc' }] },
        roles: {
          include: {
            role: true,
            scopeOrgs: { include: { org: true } },
          },
        },
      },
    });
    if (!u) throw new NotFoundException('用户不存在');

    return {
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      active: u.active,
      externalId: u.externalId,
      customFields: this.parseCustomFields(u.customFields),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      memberships: {
        admin: u.memberships.filter((m) => m.org.kind === 'admin'),
        party: u.memberships.filter((m) => m.org.kind === 'party'),
      },
      roles: u.roles.map((r) => ({
        userRoleId: r.id,
        roleId: r.roleId,
        code: r.role.code,
        name: r.role.name,
        scope: r.scope,
        scopeOrgs: r.scopeOrgs.map((s) => ({
          id: s.org.id,
          name: s.org.name,
          kind: s.org.kind,
        })),
        grantedAt: r.grantedAt,
      })),
    };
  }

  /* ─── 整体替换自定义字段值 ─── */
  async replaceCustomFields(id: string, values: Record<string, string>, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    // 自定义字段(身份证/入职日期等)属行政线资料:需行政维覆盖
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted) {
      const cov = await this.targetWriteCoverage(ws, id);
      if (!cov.adminCovered) throw new ForbiddenException('该用户的资料不在你的管理范围内');
    }

    // 校验 + 净化 (未知字段被丢弃,select 值必须在字典内,必填字段不能空)
    const sanitized = await this.customFields.validateAndSanitize(values);

    await this.prisma.user.update({
      where: { id },
      data: { customFields: Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null },
    });

    await this.audit.log({
      ...actor,
      action: 'user.custom_fields.replace',
      target: id,
      detail: { keys: Object.keys(sanitized), count: Object.keys(sanitized).length },
    });

    return this.findOne(id);
  }

  /* ─── 创建 ─── */
  async create(input: CreateUserDto, actor: ActorContext) {
    // 建号是行政线动作:需要行政维写范围(党委管理员只管党员归属/联系方式,不建号)
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted && ws.adminOrgIds.size === 0) {
      throw new ForbiddenException('你没有可创建用户的行政管理范围');
    }
    const existing = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new ConflictException(`username "${input.username}" 已被占用`);

    if (input.email) {
      const emailDup = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (emailDup) throw new ConflictException(`email "${input.email}" 已被占用`);
    }

    const created = await this.prisma.user.create({
      data: {
        username: input.username,
        name: input.name,
        email: input.email,
        phone: input.phone,
        avatarUrl: input.avatarUrl,
        active: input.active ?? true,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'user.create',
      target: created.id,
      detail: { username: created.username, name: created.name },
    });

    return this.findOne(created.id);
  }

  /* ─── 更新基本信息 ─── */
  async update(id: string, input: UpdateUserDto, actor: ActorContext) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('用户不存在');

    // 数据范围:行政维覆盖=全字段;仅党维覆盖=只能改联系方式(姓名/在职状态属行政线)
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted) {
      const cov = await this.targetWriteCoverage(ws, id);
      if (!cov.adminCovered && !cov.partyCovered) {
        throw new ForbiddenException('该用户不在你的管理范围内');
      }
      if (!cov.adminCovered && (input.name !== undefined || input.active !== undefined)) {
        throw new ForbiddenException('党委管理员只能修改范围内党员的联系方式(姓名/在职状态属行政线管理)');
      }
    }

    if (input.email && input.email !== before.email) {
      const dup = await this.prisma.user.findFirst({ where: { email: input.email, NOT: { id } } });
      if (dup) throw new ConflictException(`email "${input.email}" 已被其他用户占用`);
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        avatarUrl: input.avatarUrl ?? undefined,
        active: input.active ?? undefined,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'user.update',
      target: id,
      detail: { before: pick(before, ['name', 'email', 'phone', 'active']), after: input },
    });

    return this.findOne(id);
  }

  /* ─── 个人设置:自助更新本人资料(email/phone/avatarUrl 白名单)───
   * undefined = 不更新;null / 空串(含纯空格)= 清空 —— @IsOptional 会放行 null,这里必须同样兜住,
   * 否则 `null.trim()` 直接 500。 */
  async selfUpdateProfile(userId: string, input: UpdateMyProfileDto, actor: ActorContext) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('用户不存在');

    const norm = (v: string | null | undefined): string | null | undefined =>
      v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim();
    const email = norm(input.email);
    const phone = norm(input.phone);
    // 空串 avatarUrl 视为「不更新」(清头像不是本端点语义,前端也不会发)
    const avatarUrl = input.avatarUrl || undefined;

    if (email && email !== before.email) {
      const dup = await this.prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
      if (dup) throw new ConflictException(`邮箱 "${email}" 已被其他用户占用`);
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { email, phone, avatarUrl },
      });
    } catch (e) {
      // 并发下预检查不住唯一约束,P2002 兜底转 409(而非裸 500)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`邮箱 "${email}" 已被其他用户占用`);
      }
      throw e;
    }

    await this.audit.log({
      ...actor,
      action: 'user.profile.self_update',
      target: userId,
      // after 记规范化后的实际落库值(记原始 input 会与库里产生幻影差异)
      detail: { before: pick(before, ['email', 'phone', 'avatarUrl']), after: { email, phone, avatarUrl } },
    });

    return this.findOne(userId);
  }

  /* ─── 软删 (active=false) ─── */
  async softDelete(id: string, actor: ActorContext) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    if (!u.active) throw new BadRequestException('用户已是禁用状态');

    // 停用账号是行政线动作:需行政维覆盖
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted) {
      const cov = await this.targetWriteCoverage(ws, id);
      if (!cov.adminCovered) throw new ForbiddenException('该用户不在你的行政管理范围内');
    }

    await this.prisma.user.update({ where: { id }, data: { active: false } });
    await this.audit.log({ ...actor, action: 'user.deactivate', target: id });
    return { id, active: false };
  }

  /* ─── 整体替换组织归属 ─── */
  async replaceMemberships(id: string, dto: ReplaceMembershipsDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    // 拉所有目标组织的 kind,做校验
    const orgIds = dto.memberships.map((m) => m.orgId);
    if (new Set(orgIds).size !== orgIds.length) {
      throw new BadRequestException('不能为同一组织重复创建归属');
    }
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, kind: true, name: true, active: true },
    });
    if (orgs.length !== orgIds.length) {
      throw new BadRequestException('部分组织不存在');
    }

    // party 最多 1 个,且 isPrimary 默认 true
    const partyEntries = dto.memberships.filter((m) => orgs.find((o) => o.id === m.orgId)?.kind === 'party');
    if (partyEntries.length > 1) throw new BadRequestException('一个用户最多归属一个党组织');

    // 数据范围:diff 出「新增/移除/变更」的归属,每条按目标组织 kind 落在对应维写范围内;
    // 范围外的既有归属原样保留即可通过(前端整份回传,不动别人的地盘就不拦)。
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted) {
      const oldRows = await this.prisma.userOrganization.findMany({
        where: { userId: id },
        select: { orgId: true, position: true, isPrimary: true, org: { select: { kind: true } } },
      });
      const oldBy = new Map(oldRows.map((r) => [r.orgId, r] as const));
      const kindOf = new Map<string, string>();
      for (const o of orgs) kindOf.set(o.id, o.kind);
      for (const r of oldRows) kindOf.set(r.orgId, r.org.kind);
      const touched: string[] = [];
      for (const m of dto.memberships) {
        const old = oldBy.get(m.orgId);
        if (!old) touched.push(m.orgId);
        else if ((m.position ?? null) !== old.position || (m.isPrimary ?? false) !== old.isPrimary) {
          touched.push(m.orgId);
        }
      }
      const newIds = new Set(dto.memberships.map((m) => m.orgId));
      for (const r of oldRows) if (!newIds.has(r.orgId)) touched.push(r.orgId);
      for (const orgId of touched) {
        const kind = kindOf.get(orgId);
        const ok = kind === 'party' ? ws.partyOrgIds.has(orgId) : ws.adminOrgIds.has(orgId);
        if (!ok) throw new ForbiddenException('调整的组织归属超出你的管理范围');
      }
    }

    // 每种 kind 内 isPrimary 最多一个
    const primaryByKind: Record<'party' | 'admin', number> = { party: 0, admin: 0 };
    for (const m of dto.memberships) {
      const kind = orgs.find((o) => o.id === m.orgId)?.kind as 'party' | 'admin';
      if (m.isPrimary) primaryByKind[kind] += 1;
    }
    if (primaryByKind.admin > 1) throw new BadRequestException('行政归属最多 1 个 primary');
    if (primaryByKind.party > 1) throw new BadRequestException('党组织归属最多 1 个 primary');

    // 事务:全删 + 重建
    await this.prisma.$transaction([
      this.prisma.userOrganization.deleteMany({ where: { userId: id } }),
      ...(dto.memberships.length > 0
        ? [
            this.prisma.userOrganization.createMany({
              data: dto.memberships.map((m) => ({
                userId: id,
                orgId: m.orgId,
                position: m.position ?? null,
                isPrimary: m.isPrimary ?? false,
              })),
            }),
          ]
        : []),
    ]);

    await this.audit.log({
      ...actor,
      action: 'user.memberships.replace',
      target: id,
      detail: { count: dto.memberships.length, orgIds },
    });

    return this.findOne(id);
  }

  /* ─── 新增「单条」组织归属(组织管理页「点机构加成员」)─── */
  /**
   * 只追加一条归属,不影响用户其它归属(区别于 replaceMemberships 的整体替换)。
   * 规则:同组织不可重复;党组织最多 1 个;首条同类归属自动设为主岗,
   * 显式 isPrimary=true 时把同类其它主岗降级(每种 kind 内仅一个 primary)。
   */
  async addMembership(
    id: string,
    input: { orgId: string; position?: string; isPrimary?: boolean },
    actor: ActorContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const org = await this.prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { id: true, kind: true, name: true, active: true },
    });
    if (!org) throw new NotFoundException('组织不存在');

    // 数据范围:把人挂进哪个组织,以该组织的 kind 对应维度定权 + 目标用户须可被处置(防认领抢人)
    const ws = await this.userWriteScopeOf(actor);
    if (!ws.unrestricted) {
      const ok = org.kind === 'party' ? ws.partyOrgIds.has(org.id) : ws.adminOrgIds.has(org.id);
      if (!ok) throw new ForbiddenException('该组织不在你的管理范围内');
      await this.assertTargetInDimension(ws, id, org.kind);
    }

    const existing = await this.prisma.userOrganization.findUnique({
      where: { userId_orgId: { userId: id, orgId: input.orgId } },
    });
    if (existing) throw new ConflictException('该用户已在此组织中');

    // 同类(同 kind)现有归属 —— 决定主岗 + 是否需要降级
    const sameKind = await this.prisma.userOrganization.findMany({
      where: { userId: id, org: { kind: org.kind } },
      select: { orgId: true, isPrimary: true },
    });
    if (org.kind === 'party' && sameKind.length >= 1) {
      throw new BadRequestException('一个用户最多归属一个党组织');
    }

    const isPrimary =
      org.kind === 'party'
        ? true
        : sameKind.length === 0
          ? true
          : (input.isPrimary ?? false);

    // 主岗保护:设主岗会降级同维现有主岗;若被降级的主岗落在我范围外,拒绝
    // (否则可经「给已覆盖用户设主岗」连带翻转其范围外单位的主岗,改变考核上卷/展示口径,finding #5)
    if (isPrimary && !ws.unrestricted && org.kind === 'admin') {
      const scoped = ws.adminOrgIds;
      const outOfScopePrimary = sameKind.some((m) => m.isPrimary && !scoped.has(m.orgId));
      if (outOfScopePrimary) {
        throw new ForbiddenException('该用户的主岗在你管理范围外,不能改动其主岗');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        const demoteOrgIds = sameKind.filter((m) => m.isPrimary).map((m) => m.orgId);
        if (demoteOrgIds.length > 0) {
          await tx.userOrganization.updateMany({
            where: { userId: id, orgId: { in: demoteOrgIds } },
            data: { isPrimary: false },
          });
        }
      }
      await tx.userOrganization.create({
        data: {
          userId: id,
          orgId: input.orgId,
          position: input.position ?? null,
          isPrimary,
        },
      });
    });

    await this.audit.log({
      ...actor,
      action: 'user.membership.add',
      target: id,
      detail: { orgId: input.orgId, orgName: org.name, position: input.position ?? null, isPrimary },
    });

    return this.findOne(id);
  }

  /* ─── 移除「单条」组织归属(把成员移出某机构)─── */
  /** 删主岗后,若同类还有其它归属,自动把最早加入的一条提升为主岗。 */
  async removeMembership(id: string, orgId: string, actor: ActorContext) {
    const row = await this.prisma.userOrganization.findUnique({
      where: { userId_orgId: { userId: id, orgId } },
      include: { org: { select: { kind: true, name: true } } },
    });
    if (!row) throw new NotFoundException('该用户不在此组织中');

    // 数据范围:把人移出哪个组织,以该组织的 kind 对应维度定权
    const ws = await this.userWriteScopeOf(actor);
    const scopedSet = row.org.kind === 'party' ? ws.partyOrgIds : ws.adminOrgIds;
    if (!ws.unrestricted) {
      if (!scopedSet.has(orgId)) throw new ForbiddenException('该组织不在你的管理范围内');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userOrganization.delete({ where: { userId_orgId: { userId: id, orgId } } });
      if (row.isPrimary) {
        // 自动提升下一主岗:受限时只在我范围内的剩余归属里选(不擅自把范围外单位提成主岗,finding #5);
        // 范围内无剩余则不提升(留待有范围的人处理),unrestricted 则沿用「最早加入」
        const next = await tx.userOrganization.findFirst({
          where: {
            userId: id,
            org: { kind: row.org.kind },
            ...(ws.unrestricted ? {} : { orgId: { in: [...scopedSet] } }),
          },
          orderBy: { joinedAt: 'asc' },
        });
        if (next) {
          await tx.userOrganization.update({
            where: { userId_orgId: { userId: id, orgId: next.orgId } },
            data: { isPrimary: true },
          });
        }
      }
    });

    await this.audit.log({
      ...actor,
      action: 'user.membership.remove',
      target: id,
      detail: { orgId, orgName: row.org.name },
    });

    return this.findOne(id);
  }

  /* ─── 批量按员工编号查 User(V3 发证页 Step 3b 用) ─── */
  /**
   * empNos → { [empNo]: UserByEmpNoLite | null } 字典。
   *
   * 命中规则:User.username 精确等于 empNo。
   * 一次 prisma findMany,内存里拼 dept(主行政机构 + 主党组织),
   * 避免前端粘 N 行后逐条 lookup。
   */
  async lookupByEmpNo(
    dto: LookupByEmpNoDto,
  ): Promise<Record<string, UserByEmpNoLite | null>> {
    const empNos = Array.from(new Set(dto.empNos.map((e) => e.trim()).filter(Boolean)));
    if (empNos.length === 0) return {};

    const users = await this.prisma.user.findMany({
      where: { username: { in: empNos } },
      include: {
        memberships: {
          include: { org: true },
          orderBy: [{ isPrimary: 'desc' }],
        },
      },
    });

    const byUsername = new Map<string, (typeof users)[number]>();
    for (const u of users) byUsername.set(u.username, u);

    const result: Record<string, UserByEmpNoLite | null> = {};
    for (const empNo of empNos) {
      const u = byUsername.get(empNo);
      if (!u) {
        result[empNo] = null;
        continue;
      }
      const adminMember =
        u.memberships.find((m) => m.org.kind === 'admin' && m.isPrimary) ??
        u.memberships.find((m) => m.org.kind === 'admin');
      const partyMember =
        u.memberships.find((m) => m.org.kind === 'party' && m.isPrimary) ??
        u.memberships.find((m) => m.org.kind === 'party');
      result[empNo] = {
        id: u.id,
        username: u.username,
        name: u.name,
        adminOrgName: adminMember?.org.name ?? null,
        adminOrgId: adminMember?.orgId ?? null,
        partyOrgName: partyMember?.org.name ?? null,
        partyOrgId: partyMember?.orgId ?? null,
      };
    }
    return result;
  }

  /**
   * 批量按姓名查 User —— 发证页:粘贴的人没填工号时,用姓名兜底补工号+单位。
   * 姓名可能重名 → 每个姓名返回命中数组(0 / 1 / 多)。
   * 前端:命中 1 个 → 补工号+单位并标「按姓名·待核对」;命中多个 → 标「重名·待核对」不自动补工号。
   */
  async lookupByName(
    dto: LookupByNameDto,
  ): Promise<Record<string, UserByEmpNoLite[]>> {
    const names = Array.from(
      new Set(dto.names.map((n) => n.trim()).filter(Boolean)),
    );
    const result: Record<string, UserByEmpNoLite[]> = {};
    for (const n of names) result[n] = [];
    if (names.length === 0) return result;

    const users = await this.prisma.user.findMany({
      where: { name: { in: names } },
      include: {
        memberships: { include: { org: true }, orderBy: [{ isPrimary: 'desc' }] },
      },
    });

    for (const u of users) {
      const adminMember =
        u.memberships.find((m) => m.org.kind === 'admin' && m.isPrimary) ??
        u.memberships.find((m) => m.org.kind === 'admin');
      const partyMember =
        u.memberships.find((m) => m.org.kind === 'party' && m.isPrimary) ??
        u.memberships.find((m) => m.org.kind === 'party');
      (result[u.name] ??= []).push({
        id: u.id,
        username: u.username,
        name: u.name,
        adminOrgName: adminMember?.org.name ?? null,
        adminOrgId: adminMember?.orgId ?? null,
        partyOrgName: partyMember?.org.name ?? null,
        partyOrgId: partyMember?.orgId ?? null,
      });
    }
    return result;
  }

  /* ─── 整体替换角色 ─── */
  async replaceRoles(id: string, dto: ReplaceRolesDto, actor: ActorContext) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const roleIds = dto.roles.map((r) => r.roleId);
    if (new Set(roleIds).size !== roleIds.length) {
      throw new BadRequestException('不能为同一角色重复分配');
    }
    if (roleIds.length > 0) {
      const found = await this.prisma.role.count({ where: { id: { in: roleIds } } });
      if (found !== roleIds.length) throw new BadRequestException('部分角色不存在');
    }

    // 收集所有 scopeOrgIds 做存在性校验
    const allScopeOrgIds = new Set<string>();
    for (const r of dto.roles) {
      if (!SCOPE_VALUES.includes(r.scope)) {
        throw new BadRequestException(`非法 scope: ${r.scope}`);
      }
      const hasScopeOrgs = r.scopeOrgIds && r.scopeOrgIds.length > 0;
      if (r.scope === 'custom' && !hasScopeOrgs) {
        throw new BadRequestException('scope=custom 必须至少指定一个组织 (scopeOrgIds 不能为空)');
      }
      if (r.scope !== 'custom' && hasScopeOrgs) {
        throw new BadRequestException('仅 scope=custom 时允许提供 scopeOrgIds');
      }
      r.scopeOrgIds?.forEach((oid) => allScopeOrgIds.add(oid));
    }
    if (allScopeOrgIds.size > 0) {
      const found = await this.prisma.organization.count({
        where: { id: { in: Array.from(allScopeOrgIds) } },
      });
      if (found !== allScopeOrgIds.size) {
        throw new BadRequestException('部分 scopeOrgIds 对应的组织不存在');
      }
    }

    // 事务:先删 (UserRole cascade 会自动清掉 UserRoleScope) → 再逐条创建 (含嵌套 scopeOrgs)
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      for (const r of dto.roles) {
        const orgIds = r.scope === 'custom' ? Array.from(new Set(r.scopeOrgIds ?? [])) : [];
        await tx.userRole.create({
          data: {
            userId: id,
            roleId: r.roleId,
            scope: r.scope,
            ...(orgIds.length > 0
              ? { scopeOrgs: { create: orgIds.map((oid) => ({ orgId: oid })) } }
              : {}),
          },
        });
      }
    });

    await this.audit.log({
      ...actor,
      action: 'user.roles.replace',
      target: id,
      detail: { count: dto.roles.length, roleIds },
    });

    return this.findOne(id);
  }
}

function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const r = {} as Pick<T, K>;
  for (const k of keys) r[k] = obj[k];
  return r;
}
