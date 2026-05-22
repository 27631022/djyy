import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

/**
 * AuthModule 全局可见 — 任何业务模块都可以 @UseGuards(AuthGuard) 而无需 import。
 * AuthService 也导出供其他模块手动签发/校验 token 时使用。
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
