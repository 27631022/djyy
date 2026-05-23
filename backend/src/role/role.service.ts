import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ReplacePermissionsDto } from './dto/replace-permissions.dto';

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
