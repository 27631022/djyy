import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
import { PermissionGuard } from './permission.guard';

/**
 * @Global() 让 PermissionGuard / decorator 在跨模块场景下 ergonomic —
 * 业务模块直接 import { Permission } from '../permission' 即可用,
 * 不需要再 import PermissionModule。
 */
@Global()
@Module({
  controllers: [PermissionController],
  providers: [PermissionService, PermissionGuard],
  exports: [PermissionService, PermissionGuard],
})
export class PermissionModule {}
