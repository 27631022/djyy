import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { CertificateIssueService } from './issue.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';

/**
 * 已发证书相关 admin API。
 *
 * Phase A 范围:
 *   POST   /certificates       单证发证
 *   GET    /certificates       已发列表(不带 pdfData)
 *   GET    /certificates/:id   详情(带 pdfData,下载/预览用)
 *
 * Phase B 会在路由方法上加 @Permission('certificate:issue' | 'certificate:list')。
 * Phase C 加撤销 + 批量下载。
 * Phase D 加 AI 提取。
 * Phase E 加外部证书 + CSV 批量。
 */
@Controller('certificates')
@UseGuards(AuthGuard)
export class CertificateIssueController {
  constructor(private readonly svc: CertificateIssueService) {}

  @Post()
  @Permission('certificate:issue')
  issue(
    @Body() dto: IssueCertificateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.issue(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Get()
  list(
    @Query('templateId') templateId?: string,
    @Query('source') source?: string,
    @Query('revoked') revoked?: string,
    @Query('batchKey') batchKey?: string,
    @Query('recipientUserId') recipientUserId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (templateId) filter.templateId = templateId;
    if (source === 'internal' || source === 'external') filter.source = source;
    if (revoked === 'true') filter.revoked = true;
    if (revoked === 'false') filter.revoked = false;
    if (batchKey) filter.batchKey = batchKey;
    if (recipientUserId) filter.recipientUserId = recipientUserId;
    return this.svc.list(filter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
