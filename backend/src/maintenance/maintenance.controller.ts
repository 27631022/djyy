import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { MaintenanceService } from './maintenance.service';

/**
 * 运维维护(后台)。孤儿文件 GC:
 *   GET  /maintenance/orphan-files        admin:menu  扫描报告(只读,不删)
 *   POST /maintenance/orphan-files/purge  admin:menu  清理(service 内再判 platform_admin;删字节不可逆)
 */
@Controller('maintenance')
@UseGuards(AuthGuard)
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}

  /** 孤儿文件扫描报告(只读)。 */
  @Get('orphan-files')
  @Permission('admin:menu')
  scan() {
    return this.svc.scanOrphans();
  }

  /** 清理孤儿文件(仅系统管理员,service 内判)。body.graceDays 可覆盖默认宽限天数。 */
  @Post('orphan-files/purge')
  @Permission('admin:menu')
  purge(@CurrentUser() me: AuthPayload, @Body() body: { graceDays?: number }) {
    return this.svc.purgeOrphans(me.sub, body?.graceDays);
  }
}
