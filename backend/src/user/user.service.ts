import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto, SCOPE_VALUES } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
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

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customFields: UserCustomFieldService,
  ) {}

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
  async list(query: ListUsersQuery) {
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;

    // 拼装 where
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { username: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }
    if (query.active === 'true') where.active = true;
    if (query.active === 'false') where.active = false;
    if (query.adminOrgIds?.length) {
      where.memberships = {
        some: { orgId: { in: query.adminOrgIds }, org: { kind: 'admin' } },
      };
    } else if (query.adminOrgId) {
      where.memberships = { some: { orgId: query.adminOrgId, org: { kind: 'admin' } } };
    }
    if (query.partyOrgId) {
      where.memberships = {
        ...(where.memberships as Prisma.UserOrganizationListRelationFilter | undefined),
        some: { orgId: query.partyOrgId, org: { kind: 'party' } },
      };
    }
    if (query.hasParty === 'true') {
      where.memberships = {
        ...(where.memberships as Prisma.UserOrganizationListRelationFilter | undefined),
        some: { org: { kind: 'party' } },
      };
    }

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc',
    };

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

  /* ─── 软删 (active=false) ─── */
  async softDelete(id: string, actor: ActorContext) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    if (!u.active) throw new BadRequestException('用户已是禁用状态');

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

    await this.prisma.$transaction(async (tx) => {
      await tx.userOrganization.delete({ where: { userId_orgId: { userId: id, orgId } } });
      if (row.isPrimary) {
        const next = await tx.userOrganization.findFirst({
          where: { userId: id, org: { kind: row.org.kind } },
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
