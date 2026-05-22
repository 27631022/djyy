import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from '../auth/auth.guard';

/**
 * 审计日志只读浏览接口。
 * 后续 P1 阶段加权限校验,仅 admin:audit:read 角色可访问。
 */
@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
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
