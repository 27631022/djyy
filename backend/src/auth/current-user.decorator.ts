import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPayload } from './auth.service';

/**
 * 在 controller 方法参数上使用:
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthPayload) { ... }
 *
 * 上游必须配合 @UseGuards(AuthGuard) 才能拿到非空值。
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthPayload | undefined => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthPayload }>();
  return req.user;
});
