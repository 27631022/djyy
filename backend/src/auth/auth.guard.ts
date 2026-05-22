import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService, AuthPayload } from './auth.service';

/**
 * 全局 AuthGuard — 校验 Authorization: Bearer <token> 头,
 * 解析成功后把 payload 挂在 req.user 供 @CurrentUser() 装饰器消费。
 *
 * 用法:
 *   @UseGuards(AuthGuard)
 *   @Controller('foo')
 *
 * 或在 Module 提供为 APP_GUARD 进行全局生效 (本项目暂用 per-controller)。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: AuthPayload }>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.startsWith('Bearer ')) {
      throw new UnauthorizedException('未携带访问令牌');
    }
    const token = raw.slice(7).trim();
    const payload = this.auth.verifyToken(token);
    if (!payload) throw new UnauthorizedException('令牌无效或已过期');
    req.user = payload;
    return true;
  }
}
