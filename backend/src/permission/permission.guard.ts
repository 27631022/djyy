import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma';
import { AuthService, type AuthPayload } from '../auth';
import { PERMISSION_META_KEY } from './permission.decorator';

interface RequestWithUser {
  user?: AuthPayload;
  djyyPermissions?: string[];
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * 细粒度权限守卫 — 全局注册为 APP_GUARD。
 *
 * 工作流程:
 *   1. 读取处理函数 + 类上的 @Permission(...codes) 元数据
 *   2. 没标 → 直接放行(兼容现有不带装饰器的接口,继续仅靠 AuthGuard 校验登录)
 *   3. 标了 → 必须有 req.user(由 AuthGuard 提前注入),否则 401
 *   4. 拉用户的角色 -> 权限点集合,跟需要的 codes 求交集,任一命中即可
 *   5. 全不命中 → 403
 *
 * 性能:每次有 @Permission() 的请求查一次 DB,SQLite 单机量级不是问题。
 *       后续要省查询可加 LRU 缓存,本 MVP 阶段不优化。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[] | undefined>(
        PERMISSION_META_KEY,
        [ctx.getHandler(), ctx.getClass()],
      ) ?? [];

    // 没标注 = 不强制
    if (!required || required.length === 0) return true;

    // NestJS 全局 guard 在 per-controller @UseGuards(AuthGuard) 之前运行,
    // 此时 req.user 还没被 AuthGuard 注入。如果有 token 这里自己解一下。
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    let user = req.user;
    if (!user) {
      const header = req.headers?.['authorization'];
      const raw = Array.isArray(header) ? header[0] : header;
      if (raw && raw.startsWith('Bearer ')) {
        const token = raw.slice(7).trim();
        user = this.auth.verifyToken(token) ?? undefined;
        if (user) req.user = user; // 顺带塞回去,避免 AuthGuard 再做一次
      }
    }
    if (!user) {
      throw new UnauthorizedException('需要登录');
    }

    // 拉用户角色 + 关联的权限点
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.sub },
      select: {
        role: {
          select: {
            code: true,
            permissions: {
              select: {
                permission: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    const has = new Set<string>();
    let isSuperAdmin = false;
    for (const ur of userRoles) {
      // platform_admin 角色 = 超级管理员,直接放行所有权限校验
      if (ur.role.code === 'platform_admin') isSuperAdmin = true;
      for (const rp of ur.role.permissions) {
        has.add(rp.permission.code);
      }
    }

    req.djyyPermissions = Array.from(has);

    if (isSuperAdmin) return true;

    // 任一所需权限命中即可
    const hit = required.some((c) => has.has(c));
    if (!hit) {
      throw new ForbiddenException(
        `当前账号缺少所需权限:${required.join(' / ')}`,
      );
    }
    return true;
  }
}
