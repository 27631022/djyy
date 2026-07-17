import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from '../auth';
import { Permission } from '../permission';

/**
 * 审计日志只读浏览接口 —— 全员操作日志(谁做了什么)是敏感读,收口 admin:menu
 * (此前仅 AuthGuard,任何登录用户可查全员日志=越权)。目前尚无消费页面(路线图「审计日志查询页」),
 * 故用 admin:menu 粗粒度先挡住普通用户;将来做查询页时再按需引入专属 audit:read 做更细粒度。
 */
@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permission('admin:menu')
  list(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('pluginName') pluginName?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.audit.list({
      take: take ? parseInt(take, 10) || 50 : 50,
      skip: skip ? parseInt(skip, 10) || 0 : 0,
      action: action?.trim() || undefined,
      actorId: actorId?.trim() || undefined,
      pluginName: pluginName?.trim() || undefined,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
    });
  }
}
