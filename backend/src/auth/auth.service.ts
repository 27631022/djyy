import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * 极简 JWT (HS256) 实现 — Mock auth 阶段使用,
 * 后续接 Casdoor 时只需把 verifyToken 改为校验 IdP 颁发的 RS256 即可。
 *
 * Token 结构: base64url(header).base64url(payload).base64url(signature)
 *
 * 设计目标:
 *   - 不引入 passport-jwt / @nestjs/jwt 等额外依赖,保持后端体积干净
 *   - 接口契约 (Authorization: Bearer ...) 与 Casdoor OIDC 一致,迁移零成本
 */
export interface AuthPayload {
  sub: string;        // user id
  username: string;
  name: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  /** Token 有效期 7 天 */
  private readonly ttlMs = 7 * 24 * 3600 * 1000;

  constructor() {
    this.secret = process.env.AUTH_SECRET ?? 'dev-secret-CHANGE-IN-PROD';
    // 生产漏配 AUTH_SECRET = 用源码公开默认密钥签发会话 JWT,任何人可伪造 → 启动即拒绝(fail-fast)
    if (process.env.NODE_ENV === 'production' && (this.secret === 'dev-secret-CHANGE-IN-PROD' || this.secret.length < 16)) {
      throw new Error('生产环境必须配置足够强的 AUTH_SECRET(≥16 字符);当前缺失或过弱,拒绝启动');
    }
    if (this.secret === 'dev-secret-CHANGE-IN-PROD') {
      this.logger.warn('AUTH_SECRET 未配置,正在使用开发密钥。生产环境必须设置 .env 中的 AUTH_SECRET');
    }
  }

  signToken(payload: { sub: string; username: string; name: string }): string {
    const now = Date.now();
    const full = { ...payload, iat: now, exp: now + this.ttlMs };
    const header = this.b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.b64url(JSON.stringify(full));
    const signature = this.sign(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  verifyToken(token: string): AuthPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      const expected = this.sign(`${header}.${body}`);
      // 等长比较防时序攻击
      if (
        signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      ) {
        return null;
      }
      const payload: AuthPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private sign(input: string): string {
    return crypto.createHmac('sha256', this.secret).update(input).digest('base64url');
  }

  private b64url(input: string): string {
    return Buffer.from(input, 'utf8').toString('base64url');
  }
}
