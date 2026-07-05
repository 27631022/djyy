import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OidcService } from './oidc.service';

/**
 * 统一登录(OIDC 授权码流)入口。两个端点都是浏览器整页跳转,不是 XHR:
 *
 *   GET /auth/oidc/login?return=<前端地址>
 *     → 下发 HttpOnly nonce cookie + 302 到 IdP 授权页(return 经白名单校验后打包进 HMAC state)
 *
 *   GET /auth/oidc/callback?code&state
 *     → 校验 state 签名 + cookie nonce(防登录 CSRF)→ 换码拿 userinfo → 映射本地用户
 *     → 签发本地 HS256 会话 → 302 回 <return>#djyy_token=<token>(fragment 不进服务器日志)
 *     失败 → 302 回 <前端>/login?sso_error=<原因>
 *
 * GET /auth/mode 公开:前端据此决定登录页渲染 mock 面板还是「统一账号登录」按钮。
 */
@Controller('auth')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(private readonly oidc: OidcService) {}

  @Get('mode')
  mode() {
    return { mode: this.oidc.mode };
  }

  @Get('oidc/login')
  async login(@Query('return') ret: string | undefined, @Res() res: Response) {
    const fallback = `${this.oidc.fallbackFrontend()}/login`;
    const returnUrl = this.oidc.validateReturnUrl(ret) ?? fallback;
    try {
      const { state, nonce } = this.oidc.issueState(returnUrl);
      // HttpOnly + SameSite=Lax:IdP 顶级跳转回调时浏览器会带上;仅限 /api/auth 路径
      res.cookie(OidcService.NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 10 * 60 * 1000,
      });
      const url = await this.oidc.buildAuthorizeUrl(state);
      return res.redirect(url);
    } catch (err) {
      this.logger.error(`构建授权跳转失败: ${(err as Error).message}`);
      return this.redirectError(res, returnUrl, '统一登录暂不可用,请稍后重试或联系管理员');
    }
  }

  @Get('oidc/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') idpError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookieNonce = this.readNonceCookie(req);
    const parsed = state ? this.oidc.verifyState(state, cookieNonce) : null;
    res.clearCookie(OidcService.NONCE_COOKIE, { path: '/api/auth' }); // 一次性,无论成败都清

    // returnUrl 二次白名单校验(纵深防御:即便 state 被伪造也不会把 token 投到站外)
    const returnUrl =
      (parsed && this.oidc.validateReturnUrl(parsed.returnUrl)) || `${this.oidc.fallbackFrontend()}/login`;

    if (idpError) return this.redirectError(res, returnUrl, '统一登录已取消或失败,请重试');
    if (!parsed) return this.redirectError(res, returnUrl, '登录状态无效或已过期,请重新登录');
    if (!code) return this.redirectError(res, returnUrl, '统一登录未返回授权码,请重试');

    try {
      const token = await this.oidc.loginWithCode(code, req.ip);
      const target = new URL(returnUrl);
      target.hash = `djyy_token=${token}`;
      return res.redirect(target.toString());
    } catch (err) {
      this.logger.warn(`OIDC 登录失败: ${(err as Error).message}`);
      return this.redirectError(res, returnUrl, (err as Error).message);
    }
  }

  /** 解析请求头里的 nonce cookie(不引 cookie-parser 依赖) */
  private readNonceCookie(req: Request): string | undefined {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      if (part.slice(0, idx).trim() === OidcService.NONCE_COOKIE) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  /** 失败统一回前端登录页展示;固定 /login 路径(防钓鱼样式路径),保留原 redirect 参数 */
  private redirectError(res: Response, returnUrl: string, message: string) {
    let origin: string;
    let redirect: string | null = null;
    try {
      const u = new URL(returnUrl);
      origin = u.origin;
      redirect = u.searchParams.get('redirect');
    } catch {
      origin = this.oidc.fallbackFrontend();
    }
    // 按码点截断,避免切开代理对导致 encodeURIComponent 抛 URIError
    const safeMsg = Array.from(message).slice(0, 160).join('');
    const params = new URLSearchParams({ sso_error: safeMsg });
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) params.set('redirect', redirect);
    return res.redirect(`${origin}/login?${params.toString()}`);
  }
}
