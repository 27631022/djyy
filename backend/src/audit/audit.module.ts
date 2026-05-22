import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * @Global 后任何模块都可以直接 inject AuditService 写日志,
 * 无需在自身 module 的 imports 里显式声明 AuditModule。
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
