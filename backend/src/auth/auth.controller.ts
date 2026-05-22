import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService, AuthPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { AuditService } from '../audit/audit.service';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Mock 登录:接受 username,验证用户存在且激活,签发 dev JWT。
   * Casdoor 接入后此接口下线,改由 OIDC 回调签发。
   */
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !user.active) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }
    const token = this.auth.signToken({
      sub: user.id,
      username: user.username,
      name: user.name,
    });
    await this.audit.log({
      actorId: user.id,
      actorName: user.name,
      action: 'auth.dev_login',
      ip: req.ip,
    });
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
            role: true,
            scopeOrgs: { include: { org: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    // 拆分行政归属 / 党组织归属,前端可直接渲染
    const adminMemberships = user.memberships.filter((m) => m.org.kind === 'admin');
    const partyMemberships = user.memberships.filter((m) => m.org.kind === 'party');

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      active: user.active,
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
