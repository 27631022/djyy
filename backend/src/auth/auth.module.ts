import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';

/**
 * AuthModule 全局可见 — 任何业务模块都可以 @UseGuards(AuthGuard) 而无需 import。
 * AuthService 也导出供其他模块手动签发/校验 token 时使用。
 * OidcService/OidcController = 统一登录(Casdoor / 单位 SSO,标准 OIDC 授权码流)。
 */
@Global()
@Module({
  controllers: [AuthController, OidcController],
  providers: [AuthService, AuthGuard, OidcService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
