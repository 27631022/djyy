import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { ExternalApiService } from './external-api.service';
import {
  CreateExternalApiDto,
  UpdateExternalApiDto,
} from './dto/update-external-api.dto';

/**
 * 外部 API 接入管理 — 配置 LLM/短信/邮件/对象存储 等平台的 apiKey/url/model。
 *
 * 所有接口加 AuthGuard。撤销/删除可后续单独加 @Permission 控制(目前任意登录用户可看可改,
 * 因为系统设置类操作通常只对管理员开放,而管理员都是 platform_admin 角色)。
 *
 * apiKey 始终脱敏返回(前 4 + 后 4,中间 ***)。
 */
@Controller('external-apis')
@UseGuards(AuthGuard)
export class ExternalApiController {
  constructor(private readonly svc: ExternalApiService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':provider')
  get(@Param('provider') provider: string) {
    return this.svc.get(provider);
  }

  @Post()
  create(
    @Body() dto: CreateExternalApiDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Patch(':provider')
  update(
    @Param('provider') provider: string,
    @Body() dto: UpdateExternalApiDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(provider, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Delete(':provider')
  remove(
    @Param('provider') provider: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.remove(provider, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
