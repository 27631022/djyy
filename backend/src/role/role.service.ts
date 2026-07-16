import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';
import { AssignRoleUserDto, ROLE_SCOPE_VALUES, type RoleScopeValue } from './dto/assign-role-user.dto';
import { BatchAssignRoleUsersDto, BatchRemoveRoleUsersDto } from './dto/batch-role-users.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 解析某用户在某权限点下的「数据范围」(供越权校验 / 数据过滤复用)。
   * 返回 isPlatformAdmin(超管不限范围);entries = 持有该权限的各角色的 { scope, orgIds(custom 时的锚点单位) }。
   * 范围语义(scope):self 仅本人 / own 仅本组织 / subtree 本组织+下级 / custom 指定子树 / all 全平台。
   */
  async getScopesForPermission(
    userId: string,
    permissionCode: string,
  ): Promise<{ isPlatformAdmin: boolean; entries: { scope: string; orgIds: string[] }[] }> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        scope: true,
        scopeOrgs: { select: { orgId: true } },
        role: {
          select: {
            code: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    let isPlatformAdmin = false;
    const entries: { scope: string; orgIds: string[] }[] = [];
    for (const ur of userRoles) {
      if (ur.role.code === 'platform_admin') isPlatformAdmin = true;
      const grants = ur.role.permissions.some((rp) => rp.permission.code === permissionCode);
      if (grants) entries.push({ scope: ur.scope, orgIds: ur.scopeOrgs.map((s) => s.orgId) });
    }
    return { isPlatformAdmin, entries };
  }

  /** 列出所有角色,带用户与权限计数 */
  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ builtin: 'desc' }, { code: 'asc' }],
      include: { _count: { select: { users: true, permissions: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      builtin: r.builtin,
      createdAt: r.createdAt,
      userCount: r._count.users,
      permissionCount: r._count.permissions,
    }));
  }

  /** 详情:权限点 + 关联用户数 */
  async findOne(id: string) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!r) throw new NotFoundException('角色不存在');
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      builtin: r.builtin,
      createdAt: r.createdAt,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        category: rp.permission.category,
        pluginName: rp.permission.pluginName,
      })),
    };
  }

  /** 持有该角色的用户列表 */
  async listUsers(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');

    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId: id },
      include: {
        user: true,
        scopeOrgs: { include: { org: true } },
      },
      orderBy: [{ grantedAt: 'desc' }],
    });

    return userRoles.map((ur) => ({
      userId: ur.userId,
      username: ur.user.username,
      name: ur.user.name,
      avatarUrl: ur.user.avatarUrl,
      active: ur.user.active,
      scope: ur.scope,
      scopeOrgs: ur.scopeOrgs.map((s) => ({
        id: s.org.id,
        name: s.org.name,
        kind: s.org.kind,
      })),
      grantedAt: ur.grantedAt,
    }));
  }

  /**
   * 角色成员:直接给某角色添加/更新一名成员(= 给该用户授此角色 + 配数据范围),不影响该用户的其它角色。
   * 「角色与权限」页的成员增删入口;与用户页 replaceRoles 同为授权动作,统一挂 admin:role:write(仅系统管理员)。
   * ⚠ 直读 user / organization 表做存在性校验:role 模块被 organization 模块依赖(OrgScopeService),
   *   若反向注入 OrganizationService/UserService 会成 module 环 —— 故这里直连 prisma(表非本模块,
   *   但仅只读存在性校验,与既有 listUsers 读 user 表同源;scopeOrgs 存在性校验同 UserService.replaceRoles)。
   */
  async addUser(roleId: string, dto: AssignRoleUserDto, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const orgIds = await this.validateScopeOrgs(dto.scope, dto.scopeOrgIds);

    // 追加/更新该用户的这一条 UserRole:先删(cascade 清 scopeOrgs)再建 —— 幂等,既能「加」也能「改 scope」
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: dto.userId, roleId } });
      await tx.userRole.create({
        data: {
          userId: dto.userId,
          roleId,
          scope: dto.scope,
          ...(orgIds.length > 0
            ? { scopeOrgs: { create: orgIds.map((oid) => ({ orgId: oid })) } }
            : {}),
        },
      });
    });

    await this.audit.log({
      ...actor,
      action: 'role.user.assign',
      target: roleId,
      detail: { userId: dto.userId, scope: dto.scope, orgIds },
    });

    return this.listUsers(roleId);
  }

  /** scope 合法性 + custom 锚点校验(addUser / batchAssignUsers 共用),返回去重后的锚点 orgIds */
  private async validateScopeOrgs(scope: RoleScopeValue, scopeOrgIds?: string[]): Promise<string[]> {
    if (!ROLE_SCOPE_VALUES.includes(scope)) {
      throw new BadRequestException(`非法 scope: ${scope}`);
    }
    const hasScopeOrgs = !!scopeOrgIds && scopeOrgIds.length > 0;
    if (scope === 'custom' && !hasScopeOrgs) {
      throw new BadRequestException('scope=custom 必须至少指定一个组织');
    }
    if (scope !== 'custom' && hasScopeOrgs) {
      throw new BadRequestException('仅 scope=custom 时允许提供 scopeOrgIds');
    }
    const orgIds = scope === 'custom' ? Array.from(new Set(scopeOrgIds ?? [])) : [];
    if (orgIds.length > 0) {
      const found = await this.prisma.organization.count({ where: { id: { in: orgIds } } });
      if (found !== orgIds.length) throw new BadRequestException('部分 scopeOrgIds 对应的组织不存在');
    }
    return orgIds;
  }

  /**
   * 角色成员:批量添加(整批同一 scope + custom 锚点)。来源 = 角色页「批量添加」按筛选条件圈人。
   * 幂等语义与单个 addUser 一致:已持有该角色的成员 = 覆盖更新其数据范围(先删后建);
   * id 不存在的(并发被删等)跳过并计入 missing,不让整批失败。
   * custom 时 UserRole 需要显式 id 才能 createMany 后挂 UserRoleScope —— 预生成 randomUUID
   * (列是 String 主键,cuid 只是默认值,任意唯一串合法)。
   */
  async batchAssignUsers(roleId: string, dto: BatchAssignRoleUsersDto, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');

    const orgIds = await this.validateScopeOrgs(dto.scope, dto.scopeOrgIds);

    const requestedIds = Array.from(new Set(dto.userIds));
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true },
    });
    const validIds = existingUsers.map((u) => u.id);
    const missing = requestedIds.length - validIds.length;
    if (validIds.length === 0) throw new BadRequestException('所选用户均不存在');

    // deleteMany 的 count = 原本已持有该角色的人数(事务内取,计数与写入强一致)。
    // timeout 30s:5000 人 × 50 锚点级别的 createMany 会超默认 5s 交互事务超时(P2028)
    let updated = 0;
    await this.prisma.$transaction(
      async (tx) => {
        const del = await tx.userRole.deleteMany({
          where: { roleId, userId: { in: validIds } },
        });
        updated = del.count;
        if (orgIds.length === 0) {
          await tx.userRole.createMany({
            data: validIds.map((uid) => ({ userId: uid, roleId, scope: dto.scope })),
          });
        } else {
          const rows = validIds.map((uid) => ({
            id: randomUUID(),
            userId: uid,
            roleId,
            scope: dto.scope,
          }));
          await tx.userRole.createMany({ data: rows });
          await tx.userRoleScope.createMany({
            data: rows.flatMap((r) => orgIds.map((oid) => ({ userRoleId: r.id, orgId: oid }))),
          });
        }
      },
      { timeout: 30_000 },
    );

    await this.audit.log({
      ...actor,
      action: 'role.user.batch_assign',
      target: roleId,
      detail: {
        count: validIds.length,
        updated,
        missing,
        scope: dto.scope,
        orgIds,
        sampleUserIds: validIds.slice(0, 50),
      },
    });

    return {
      requested: requestedIds.length,
      added: validIds.length - updated,
      updated,
      missing,
    };
  }

  /**
   * 防自锁守卫:platform_admin 是唯一持 admin:role:write 的内置角色,成员被移空 = 全平台
   * 再无人能进角色管理(PermissionGuard 每请求现查 DB,立即生效),只能直改数据库恢复。
   * 单个/批量移除共用;user 模块 replaceRoles 的同类缺口另行跟进(跨模块)。
   */
  private async assertNotEmptyingPlatformAdmin(
    role: { id: string; code: string },
    removingUserIds: string[],
  ) {
    if (role.code !== 'platform_admin') return;
    const remaining = await this.prisma.userRole.count({
      where: { roleId: role.id, userId: { notIn: removingUserIds } },
    });
    if (remaining === 0) {
      throw new BadRequestException('不能移除最后一名平台管理员 —— 否则无人能再管理角色与权限');
    }
  }

  /** 角色成员:批量移除(幂等:未持有此角色的 id 自动忽略,返回实际移除数)。 */
  async batchRemoveUsers(roleId: string, dto: BatchRemoveRoleUsersDto, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');

    const ids = Array.from(new Set(dto.userIds));
    await this.assertNotEmptyingPlatformAdmin(role, ids);
    const res = await this.prisma.userRole.deleteMany({
      where: { roleId, userId: { in: ids } },
    });

    await this.audit.log({
      ...actor,
      action: 'role.user.batch_unassign',
      target: roleId,
      detail: { requested: ids.length, removed: res.count, sampleUserIds: ids.slice(0, 50) },
    });

    return { requested: ids.length, removed: res.count };
  }

  /** 角色成员:解除某用户的此角色(不影响其它角色)。 */
  async removeUser(roleId: string, userId: string, actor: ActorContext) {
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: { role: { select: { id: true, code: true } } },
    });
    if (!existing) throw new NotFoundException('该用户未持有此角色');
    await this.assertNotEmptyingPlatformAdmin(existing.role, [userId]);

    await this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });

    await this.audit.log({
      ...actor,
      action: 'role.user.unassign',
      target: roleId,
      detail: { userId },
    });

    return this.listUsers(roleId);
  }

  /** 创建自定义角色 (builtin=false) */
  async create(input: CreateRoleDto, actor: ActorContext) {
    const dup = await this.prisma.role.findUnique({ where: { code: input.code } });
    if (dup) throw new ConflictException(`code "${input.code}" 已存在`);

    const created = await this.prisma.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        builtin: false,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'role.create',
      target: created.id,
      detail: { code: created.code, name: created.name },
    });

    return this.findOne(created.id);
  }

  /** 更新名称/描述 (code 不可改;builtin 可改名但通常不改) */
  async update(id: string, input: UpdateRoleDto, actor: ActorContext) {
    const before = await this.prisma.role.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('角色不存在');

    await this.prisma.role.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        description: input.description ?? undefined,
      },
    });

    await this.audit.log({
      ...actor,
      action: 'role.update',
      target: id,
      detail: {
        before: { name: before.name, description: before.description },
        after: input,
      },
    });

    return this.findOne(id);
  }

  /** 删除自定义角色;内置角色禁止删除 */
  async remove(id: string, actor: ActorContext) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!r) throw new NotFoundException('角色不存在');
    if (r.builtin) throw new BadRequestException('内置角色不可删除');
    if (r._count.users > 0) {
      throw new BadRequestException(`仍有 ${r._count.users} 个用户持有该角色,请先解除分配`);
    }

    await this.prisma.role.delete({ where: { id } });

    await this.audit.log({
      ...actor,
      action: 'role.delete',
      target: id,
      detail: { code: r.code, name: r.name },
    });

    return { id, deleted: true };
  }

  /** 整体替换权限分配 */
  async replacePermissions(id: string, dto: ReplacePermissionsDto, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');

    const permIds = Array.from(new Set(dto.permissionIds));
    if (permIds.length > 0) {
      const found = await this.prisma.permission.count({ where: { id: { in: permIds } } });
      if (found !== permIds.length) throw new BadRequestException('部分权限点不存在');
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...(permIds.length > 0
        ? [
            this.prisma.rolePermission.createMany({
              data: permIds.map((pid) => ({ roleId: id, permissionId: pid })),
            }),
          ]
        : []),
    ]);

    await this.audit.log({
      ...actor,
      action: 'role.permissions.replace',
      target: id,
      detail: { count: permIds.length },
    });

    return this.findOne(id);
  }
}
