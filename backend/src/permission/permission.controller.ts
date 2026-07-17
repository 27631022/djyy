import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { AuthGuard } from '../auth';
import { Permission } from './permission.decorator';

/**
 * 权限点目录(全部权限码 + 名称)—— 收口 admin:role:read(唯一消费方=角色管理页,编辑角色权限时展示)。
 * ⚠ 此前仅 AuthGuard:任何登录用户可枚举全部权限点,已堵。
 */
@Controller('permissions')
@UseGuards(AuthGuard)
export class PermissionController {
  constructor(private readonly perms: PermissionService) {}

  @Get()
  @Permission('admin:role:read')
  list() {
    return this.perms.list();
  }
}
