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
import { AuditService } from '../audit';
import { UpdateDirectoryMemberDto } from './dto/directory.dto';

interface ActorContext {
  actorId?: string;
  actorName?: string;
  ip?: string;
}

/**
 * 通讯录后台管理(2026-07-12):排序 / 隐藏 / 改联系方式。
 *
 * 权限:`directory:manage`(功能权限,全局 PermissionGuard 校验);
 * 数据范围:走 OrgScopeService.resolveWrite(actorId, 'directory:manage')——
 *   - scope=all / platform_admin → unrestricted(管理所有 = 通讯录管理员)
 *   - scope=custom/subtree 锚定二级单位 → adminOrgIds = 该单位子树(= 二级通讯录管理员,管所在二级单位及以下)
 * 覆盖判定按行政维:管某单位需该单位 ∈ 范围;管某人需其任一行政归属 ∈ 范围。
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScope: OrgScopeService,
    private readonly audit: AuditService,
  ) {}

  private async scopeOf(actorId: string | undefined): Promise<OrgWriteScope> {
    if (!actorId) throw new ForbiddenException('缺少操作人身份');
    return this.orgScope.resolveWrite(actorId, 'directory:manage');
  }

  /** 管理范围概要:全公司 or 可管理的行政机构 id 集合(前端据此裁剪组织树只显可管单位) */
  async myScope(actorId: string): Promise<{ all: boolean; orgIds: string[] }> {
    const ws = await this.scopeOf(actorId);
    return { all: ws.unrestricted, orgIds: ws.unrestricted ? [] : [...ws.adminOrgIds] };
  }

  private assertCoversOrg(ws: OrgWriteScope, orgId: string) {
    if (!ws.unrestricted && !ws.adminOrgIds.has(orgId)) {
      throw new ForbiddenException('该单位不在你的通讯录管理范围内');
    }
  }

  /** 目标用户的任一行政归属须落在管理范围内(unrestricted 直通) */
  private async assertCoversUser(ws: OrgWriteScope, userId: string) {
    if (ws.unrestricted) return;
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId, org: { kind: 'admin' } },
      select: { orgId: true },
    });
    if (!rows.some((r) => ws.adminOrgIds.has(r.orgId))) {
      throw new ForbiddenException('该用户不在你的通讯录管理范围内');
    }
  }

  /** 某行政机构的直接成员(通讯录管理视图):含被隐藏的,按统一 sortOrder 排 */
  async unitMembers(actorId: string, orgId: string, search?: string) {
    const ws = await this.scopeOf(actorId);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, kind: true, name: true },
    });
    if (!org) throw new NotFoundException('单位不存在');
    if (org.kind !== 'admin') throw new BadRequestException('通讯录管理只针对行政机构');
    this.assertCoversOrg(ws, orgId);

    const q = (search ?? '').trim();
    const rows = await this.prisma.userOrganization.findMany({
      where: {
        orgId,
        ...(q
          ? {
              user: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { username: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { user: { name: 'asc' } }, { userId: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            phone: true,
            email: true,
            active: true,
            directoryHidden: true,
          },
        },
      },
    });
    return {
      org: { id: org.id, name: org.name },
      members: rows.map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        phone: m.user.phone,
        email: m.user.email,
        active: m.user.active,
        position: m.position,
        isPrimary: m.isPrimary,
        hidden: m.user.directoryHidden,
        sortOrder: m.sortOrder,
      })),
    };
  }

  /**
   * 拖拽排序:按传入 userId 顺序给本单位直接成员重排统一 sortOrder(10,20,30…)。
   * 与组织管理「成员拖拽」(organization.reorderMembers)写同一列 —— 通讯录/组织/门户排序一致。
   */
  async reorder(actorId: string, orgId: string, userIds: string[], actor: ActorContext) {
    const ws = await this.scopeOf(actorId);
    this.assertCoversOrg(ws, orgId);
    const existing = await this.prisma.userOrganization.findMany({
      where: { orgId },
      select: { userId: true },
    });
    const valid = new Set(existing.map((e) => e.userId));
    const ordered = [...new Set(userIds)].filter((u) => valid.has(u));
    if (ordered.length === 0) return { ok: true, count: 0 };
    await this.prisma.$transaction(
      ordered.map((userId, i) =>
        this.prisma.userOrganization.update({
          where: { userId_orgId: { userId, orgId } },
          data: { sortOrder: (i + 1) * 10 },
        }),
      ),
    );
    await this.audit.log({
      ...actor,
      action: 'directory.reorder',
      target: orgId,
      detail: { count: ordered.length },
    });
    return { ok: true, count: ordered.length };
  }

  /** 改联系方式 / 隐藏显示(范围内单个用户) */
  async updateMember(actorId: string, userId: string, dto: UpdateDirectoryMemberDto, actor: ActorContext) {
    const ws = await this.scopeOf(actorId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.assertCoversUser(ws, userId);

    const data: Prisma.UserUpdateInput = {};
    const norm = (v: string | null | undefined): string | null | undefined =>
      v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim();
    const email = norm(dto.email);
    const phone = norm(dto.phone);
    if (dto.email !== undefined) data.email = email;
    if (dto.phone !== undefined) data.phone = phone;
    if (dto.hidden !== undefined) data.directoryHidden = dto.hidden;

    if (email && email !== user.email) {
      const dup = await this.prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
      if (dup) throw new ConflictException(`邮箱 "${email}" 已被其他用户占用`);
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`邮箱 "${email}" 已被其他用户占用`);
      }
      throw e;
    }

    await this.audit.log({
      ...actor,
      action: 'directory.member.update',
      target: userId,
      detail: {
        before: { email: user.email, phone: user.phone, directoryHidden: user.directoryHidden },
        after: { email, phone, hidden: dto.hidden },
      },
    });

    return {
      userId,
      phone: dto.phone !== undefined ? phone : user.phone,
      email: dto.email !== undefined ? email : user.email,
      hidden: dto.hidden !== undefined ? dto.hidden : user.directoryHidden,
    };
  }
}
