import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceMembershipsDto } from './dto/replace-memberships.dto';
import { ReplaceRolesDto, SCOPE_VALUES } from './dto/replace-roles.dto';
import { ListUsersQuery } from './dto/list-users.query';
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
    if (query.adminOrgId) {
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
