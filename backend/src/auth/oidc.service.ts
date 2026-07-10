import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { AuthService } from './auth.service';

/**
 * 标准 OIDC 授权码流接入(当前对接自建 Casdoor;将来单位 SSO 开放 OIDC 时改 OIDC_ISSUER 即可)。
 *
 * 环境变量:
 *   AUTH_MODE          mock(默认,dev-login)| oidc(统一登录)
 *   OIDC_ISSUER        IdP 地址,如 http://10.185.28.220:8000(须带 /.well-known/openid-configuration)
 *   OIDC_CLIENT_ID / OIDC_CLIENT_SECRET
 *   OIDC_REDIRECT_URI  本服务回调完整 URL,如 http://10.185.28.220:3001/api/auth/oidc/callback
 *   OIDC_JIT_CREATE    "1" = IdP 账号在平台没有对应用户时自动创建(无角色,需管理员授权);默认关
 *   ALLOW_DEV_LOGIN    "1" = oidc 模式下仍放行 dev-login(内网兜底);默认关
 *   CASDOOR_ORG        Casdoor 组织名(修改密码 set-password 的 userOwner);默认 djyy,与部署手册第七节一致
 *
 * 设计不变量(见 ~/.claude/plans/casdoor-casdoor-groovy-map.md Phase C):
 *   - IdP 只负责认证;角色/组织/权限全在本地库
 *   - IdP 的 sub 永不直接当 userId 用 —— 一律解析成本地 User.id 再由 AuthService 签发原有 HS256 会话,
 *     下游 AuthGuard / PermissionGuard / @CurrentUser 契约零改动
 *   - 直连 prisma 读写 User 表(auth ↔ user 模块的 import 环破例,同 auth.controller 的 dev-login,
 *     理由记录在 docs/conventions.md)
 */

export interface OidcClaims {
  sub: string;
  name?: string;
  preferred_username?: string;
  displayName?: string;
  email?: string | null;
  picture?: string | null;
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private discovery: { doc: DiscoveryDoc; fetchedAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /* ─── 模式与配置 ─── */

  get mode(): 'mock' | 'oidc' {
    return process.env.AUTH_MODE === 'oidc' ? 'oidc' : 'mock';
  }

  get devLoginAllowed(): boolean {
    return this.mode === 'mock' || process.env.ALLOW_DEV_LOGIN === '1';
  }

  private requireEnv(key: string): string {
    const v = (process.env[key] ?? '').trim();
    if (!v) throw new Error(`统一登录未配置:缺少环境变量 ${key}`);
    return v;
  }

  /* ─── OIDC discovery(带缓存)─── */

  private async getDiscovery(): Promise<DiscoveryDoc> {
    if (this.discovery && Date.now() - this.discovery.fetchedAt < DISCOVERY_TTL_MS) {
      return this.discovery.doc;
    }
    const issuer = this.requireEnv('OIDC_ISSUER').replace(/\/$/, '');
    const url = `${issuer}/.well-known/openid-configuration`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`OIDC discovery 失败:${url} → HTTP ${resp.status}`);
    const doc = (await resp.json()) as Partial<DiscoveryDoc>;
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
      throw new Error(`OIDC discovery 缺少必要端点:${url}`);
    }
    this.discovery = { doc: doc as DiscoveryDoc, fetchedAt: Date.now() };
    return this.discovery.doc;
  }

  /* ─── AUTH_SECRET(HMAC / JWT 共用)—— 生产漏配即 fail-fast,不回退公开默认值 ─── */

  static readonly DEV_SECRET = 'dev-secret-CHANGE-IN-PROD';

  private secret(): string {
    const v = process.env.AUTH_SECRET ?? OidcService.DEV_SECRET;
    if (process.env.NODE_ENV === 'production' && (v === OidcService.DEV_SECRET || v.length < 16)) {
      // 生产用公开默认密钥 = 任何人可伪造会话 JWT / OIDC state → 拒绝服务而非裸奔
      throw new Error('生产环境必须配置足够强的 AUTH_SECRET(≥16 字符)');
    }
    return v;
  }

  /* ─── state(HMAC 签名 + 绑定浏览器 nonce cookie 防登录 CSRF + 携带回跳地址)─── */

  private hmac(input: string): string {
    return crypto.createHmac('sha256', this.secret()).update(`oidc-state:${input}`).digest('base64url');
  }

  private sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('base64url');
  }

  /**
   * 发起登录:生成随机 nonce(明文进 HttpOnly cookie,哈希进签名 state)。
   * 回调时要求 cookie 里的 nonce 哈希与 state 里的一致 —— 攻击者预造的 state 到受害者
   * 浏览器没有对应 cookie,签不成会话,堵住登录 CSRF / 会话固定。
   */
  issueState(returnUrl: string): { state: string; nonce: string } {
    const nonce = crypto.randomBytes(16).toString('hex');
    const body = Buffer.from(
      JSON.stringify({ r: returnUrl, h: this.sha256(nonce), exp: Date.now() + STATE_TTL_MS }),
      'utf8',
    ).toString('base64url');
    return { state: `${body}.${this.hmac(body)}`, nonce };
  }

  verifyState(state: string, cookieNonce: string | undefined): { returnUrl: string } | null {
    try {
      const [body, sig] = state.split('.');
      if (!body || !sig) return null;
      const expected = this.hmac(body);
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
      if (typeof payload.r !== 'string' || typeof payload.h !== 'string') return null;
      // nonce 绑定:cookie 明文哈希须等于 state 里的哈希(等长常数时间比较)
      if (!cookieNonce) return null;
      const cookieHash = this.sha256(cookieNonce);
      if (cookieHash.length !== payload.h.length || !crypto.timingSafeEqual(Buffer.from(cookieHash), Buffer.from(payload.h))) {
        return null;
      }
      return { returnUrl: payload.r };
    } catch {
      return null;
    }
  }

  /** state nonce cookie 名(HttpOnly,SameSite=Lax 以便 IdP 顶级跳转回调时携带) */
  static readonly NONCE_COOKIE = 'djyy_oidc_nonce';

  /* ─── 回跳地址校验(防 open redirect;口径与 main.ts 的 CORS 白名单一致)─── */

  validateReturnUrl(raw: string | undefined): string | null {
    if (!raw) return null;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const origin = url.origin;
    const whitelist = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (whitelist.includes(origin)) return url.toString();
    // dev 便利旁路收紧:① fail-closed(仅显式 development 开)② 主机名限本机/内网私有网段,
    //   不再用 [^/]+ 放行任意公网主机(否则 http://evil.com:5173 会被当合法回跳,token 外泄)。
    const isDev = process.env.NODE_ENV === 'development';
    const privateHost =
      /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(517[34]|3001)$/;
    if (isDev && privateHost.test(origin)) return url.toString();
    return null;
  }

  /** 错误兜底回跳的前端基址(白名单第一项) */
  fallbackFrontend(): string {
    const first = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0].trim();
    return first || 'http://localhost:5173';
  }

  /* ─── 授权跳转 URL ─── */

  async buildAuthorizeUrl(state: string): Promise<string> {
    const doc = await this.getDiscovery();
    const u = new URL(doc.authorization_endpoint);
    u.searchParams.set('client_id', this.requireEnv('OIDC_CLIENT_ID'));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', this.requireEnv('OIDC_REDIRECT_URI'));
    u.searchParams.set('scope', 'openid profile email');
    u.searchParams.set('state', state);
    return u.toString();
  }

  /* ─── code → access_token → userinfo ─── */

  async fetchClaims(code: string): Promise<OidcClaims> {
    const doc = await this.getDiscovery();
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.requireEnv('OIDC_CLIENT_ID'),
      client_secret: this.requireEnv('OIDC_CLIENT_SECRET'),
      redirect_uri: this.requireEnv('OIDC_REDIRECT_URI'),
    });
    const tokenResp = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenResp.ok) {
      // 详情只进服务端日志;对外抛泛化错误,不回显 IdP 内部报错体
      this.logger.warn(`换取 access_token 失败:HTTP ${tokenResp.status} ${(await tokenResp.text()).slice(0, 300)}`);
      throw new Error('统一登录换取令牌失败,请重试或联系管理员');
    }
    const tokenJson = (await tokenResp.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error('统一登录换取令牌失败,请重试或联系管理员');

    // 服务端持凭据直连 token/userinfo 端点(confidential client),响应可信,无需再验 id_token 签名
    const uiResp = await fetch(doc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!uiResp.ok) throw new Error(`拉取 userinfo 失败:HTTP ${uiResp.status}`);
    const claims = (await uiResp.json()) as OidcClaims;
    if (!claims.sub) throw new Error('userinfo 缺少 sub');
    return claims;
  }

  /**
   * 「登录名」取哪个 claim。默认 `preferred_username` —— 标准 OIDC 约定,**实测真 Casdoor 的
   * OIDC userinfo 也遵循**(preferred_username=登录名/工号,name=显示名)。
   * ⚠ 别被「Casdoor 数据模型里 user.Name=登录名」误导:那是它内部字段名,对外 OIDC claim 是标准的。
   * 个别非标 IdP 若把登录名放 name,配 OIDC_USERNAME_CLAIM=name 兜底。
   */
  private get usernameClaim(): 'name' | 'preferred_username' {
    return process.env.OIDC_USERNAME_CLAIM === 'name' ? 'name' : 'preferred_username';
  }

  /* ─── IdP 身份 → 本地 User ───
   * 安全边界(对抗审查后收紧):账号绑定**只认单一 OIDC_USERNAME_CLAIM**(=工号列 username),
   *   不再拿显示名 / email 这些用户在 IdP 侧可自改的字段做隐式匹配 —— 否则攻击者把自己的
   *   显示名/邮箱改成 admin 即可首登抢绑平台超管账号(externalId 为空时)。
   *   ⚠ 部署要求:Casdoor 关自助注册、登录名由管理员按工号下发(见部署 README 第七节)。
   */
  async resolveLocalUser(claims: OidcClaims, ip?: string) {
    const sub = String(claims.sub);

    // 1) externalId 精确命中(二次登录走这里)
    let user = await this.prisma.user.findUnique({ where: { externalId: sub } });

    // 2) 单一登录名 claim 匹配本地 username(=工号),命中即回填 externalId 完成首绑
    if (!user) {
      const username = (claims[this.usernameClaim] ?? '').trim();
      if (username) {
        const hit = await this.prisma.user.findUnique({ where: { username } });
        if (hit) {
          if (hit.externalId && hit.externalId !== sub) {
            this.logger.warn(`OIDC 绑定冲突:username=${username} 已绑 externalId=${hit.externalId},拒绝 sub=${sub}`);
            throw new Error('该账号已绑定其他统一登录身份,请联系管理员');
          }
          user = await this.prisma.user.update({ where: { id: hit.id }, data: { externalId: sub } });
        }
      }
    }

    // 3) JIT 自动开通(默认关;开通出来无任何角色,需管理员在用户管理里授权)
    if (!user) {
      if (process.env.OIDC_JIT_CREATE !== '1') {
        throw new Error('该账号尚未在平台开通,请联系管理员');
      }
      const username = (claims[this.usernameClaim] ?? '').trim() || `sso_${sub.slice(0, 12)}`;
      const displayName =
        (claims.displayName ?? '').trim() ||
        (claims[this.usernameClaim === 'name' ? 'preferred_username' : 'name'] ?? '').trim() ||
        username;
      try {
        user = await this.prisma.user.create({
          data: { username, name: displayName, email: claims.email ?? null, externalId: sub, active: true },
        });
        this.logger.log(`OIDC JIT 创建用户 ${username}(sub=${sub}),尚无角色`);
      } catch (err) {
        // 并发首登 / 用户名撞车:唯一约束冲突后重查一次(可能是另一个并发请求已建好本 sub)
        const raced = await this.prisma.user.findUnique({ where: { externalId: sub } });
        if (raced) user = raced;
        else throw new Error('账号开通失败(可能与现有账号冲突),请联系管理员', { cause: err });
      }
    }

    if (!user.active) throw new Error('账号已被禁用,请联系管理员');

    // 审计(直连 prisma,理由同 dev-login:避免 auth→audit→auth 的 import 环)
    try {
      await this.prisma.auditLog.create({
        data: { actorId: user.id, actorName: user.name, action: 'auth.oidc_login', ip },
      });
    } catch (err) {
      this.logger.error(`审计日志写入失败 action=auth.oidc_login: ${(err as Error).message}`);
    }

    return user;
  }

  /** 全流程:code → claims → 本地用户 → 本地 HS256 会话 token */
  async loginWithCode(code: string, ip?: string): Promise<string> {
    const claims = await this.fetchClaims(code);
    const user = await this.resolveLocalUser(claims, ip);
    return this.auth.signToken({ sub: user.id, username: user.username, name: user.name });
  }

  /* ─── 修改密码(个人设置页;仅 oidc 模式,平台本地不存密码)───
   * Casdoor 管理 API `POST /api/set-password`(form),Basic auth = clientId:clientSecret
   * (应用凭据即该组织的管理凭据,复用 OIDC 四件套,不需要额外的管理员账密)。
   * oldPassword 一并透传由 Casdoor 校验 —— 不能只凭登录态改密,否则 token 泄露即可静默改密。
   * userOwner = Casdoor 组织名(CASDOOR_ORG,默认 djyy,须与部署手册第七节建的组织一致);
   * userName = 本地 User.username(工号,首绑约定保证与 Casdoor 登录名一致)。
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (this.mode !== 'oidc') {
      throw new BadRequestException(
        '当前为演示登录模式,平台不保存密码;正式环境启用统一登录后方可在此修改密码',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new UnauthorizedException('用户不存在或已禁用');

    const issuer = this.requireEnv('OIDC_ISSUER').replace(/\/$/, '');
    const clientId = this.requireEnv('OIDC_CLIENT_ID');
    const clientSecret = this.requireEnv('OIDC_CLIENT_SECRET');
    const org = (process.env.CASDOOR_ORG ?? 'djyy').trim();

    const form = new URLSearchParams({
      userOwner: org,
      userName: user.username,
      oldPassword,
      newPassword,
    });
    let resp: Response;
    try {
      resp = await fetch(`${issuer}/api/set-password`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Language': 'zh',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      this.logger.warn(`修改密码失败(IdP 不可达):${(e as Error).message}`);
      throw new BadRequestException('统一登录服务暂不可达,请稍后再试');
    }
    // Casdoor 出错也回 HTTP 200,靠 body 的 status 字段判(真机实测:错误旧密码
    // → {status:'error', msg:'密码不正确,您还有 N 次尝试的机会'},并带尝试次数锁定)
    const data = (await resp.json().catch(() => null)) as { status?: string; msg?: string } | null;
    if (!resp.ok || !data || data.status !== 'ok') {
      const msg = (data?.msg ?? `HTTP ${resp.status}`).trim();
      this.logger.warn(`修改密码被 IdP 拒绝 user=${user.username}: ${msg}`);
      // 旧密码错误是最常见失败,归一化成友好中文(保留剩余尝试次数);其余原样透出(如复杂度不达标)
      const wrongOld = /password.*(wrong|incorrect|not correct)|密码不正确|密码错误/i.test(msg);
      if (wrongOld) {
        const attempts = /还有\s*(\d+)\s*次/.exec(msg)?.[1];
        throw new BadRequestException(attempts ? `原密码不正确(还可尝试 ${attempts} 次)` : '原密码不正确');
      }
      throw new BadRequestException(`修改密码失败:${msg}`);
    }
  }
}
