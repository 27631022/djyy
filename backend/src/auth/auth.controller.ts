import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService, AuthPayload } from './auth.service';
import { PrismaService } from '../prisma';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { OidcService } from './oidc.service';
import { DevLoginDto } from './dto/dev-login.dto';
import type { Request } from 'express';

// 不导入 AuditService:auth 写 dev_login 日志 vs audit 用 AuthGuard 保护读接口,
// 二者构成 import 环。auth.controller 直接走 prisma 写 auditLog 表打破环 ——
// 这是「表归属一个模块」约定的少数例外,理由记在 docs/conventions.md。
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly oidc: OidcService,
  ) {}

  /**
   * Mock 登录:接受 username,验证用户存在且激活,签发 dev JWT。
   * AUTH_MODE=oidc(统一登录)时默认禁用,ALLOW_DEV_LOGIN=1 可临时放行做内网兜底。
   */
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto, @Req() req: Request) {
    if (!this.oidc.devLoginAllowed) {
      throw new UnauthorizedException('演示登录已停用,请使用统一账号登录');
    }
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !user.active) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }
    const token = this.auth.signToken({
      sub: user.id,
      username: user.username,
      name: user.name,
    });
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          action: 'auth.dev_login',
          ip: req.ip,
        },
      });
    } catch (err) {
      this.logger.error(`审计日志写入失败 action=auth.dev_login: ${(err as Error).message}`);
    }
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  /**
   * 当前登录用户的完整画像:组织归属 (双体系) + 角色 + 数据范围。
   * 前端 AuthContext / Home 用户卡片 / 顶部菜单都从此接口获取。
   */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() current?: AuthPayload) {
    if (!current) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: current.sub },
      include: {
        memberships: {
          include: { org: true },
          orderBy: [{ isPrimary: 'desc' }],
        },
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            scopeOrgs: { include: { org: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    // 拆分行政归属 / 党组织归属,前端可直接渲染
    const adminMemberships = user.memberships.filter((m) => m.org.kind === 'admin');
    const partyMemberships = user.memberships.filter((m) => m.org.kind === 'party');

    // 有效权限点(供前端按权限隐藏菜单);platform_admin = 超管直通
    const permSet = new Set<string>();
    let isPlatformAdmin = false;
    for (const r of user.roles) {
      if (r.role.code === 'platform_admin') isPlatformAdmin = true;
      for (const rp of r.role.permissions) permSet.add(rp.permission.code);
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      active: user.active,
      isPlatformAdmin,
      permissions: [...permSet],
      memberships: {
        admin: adminMemberships,
        party: partyMemberships,
      },
      roles: user.roles.map((r) => ({
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
}
