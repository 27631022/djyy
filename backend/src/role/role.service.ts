import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';
import { AssignRoleUserDto, ROLE_SCOPE_VALUES } from './dto/assign-role-user.dto';

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

    if (!ROLE_SCOPE_VALUES.includes(dto.scope)) {
      throw new BadRequestException(`非法 scope: ${dto.scope}`);
    }
    const hasScopeOrgs = !!dto.scopeOrgIds && dto.scopeOrgIds.length > 0;
    if (dto.scope === 'custom' && !hasScopeOrgs) {
      throw new BadRequestException('scope=custom 必须至少指定一个组织');
    }
    if (dto.scope !== 'custom' && hasScopeOrgs) {
      throw new BadRequestException('仅 scope=custom 时允许提供 scopeOrgIds');
    }
    const orgIds = dto.scope === 'custom' ? Array.from(new Set(dto.scopeOrgIds ?? [])) : [];
    if (orgIds.length > 0) {
      const found = await this.prisma.organization.count({ where: { id: { in: orgIds } } });
      if (found !== orgIds.length) throw new BadRequestException('部分 scopeOrgIds 对应的组织不存在');
    }

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

  /** 角色成员:解除某用户的此角色(不影响其它角色)。 */
  async removeUser(roleId: string, userId: string, actor: ActorContext) {
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException('该用户未持有此角色');

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
