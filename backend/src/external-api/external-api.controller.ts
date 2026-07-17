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
import { Permission } from '../permission';
import { ExternalApiService } from './external-api.service';
import {
  CreateExternalApiDto,
  SetAiRouteDto,
  TestExternalApiDto,
  UpdateExternalApiDto,
} from './dto/update-external-api.dto';

/**
 * 外部 API 接入管理 — 配置 LLM/短信/邮件/对象存储 等平台的 apiKey/url/model。
 *
 * 收口 admin:menu(与前端「AI 接入管理」菜单一致)。⚠ 此前仅 AuthGuard:任何登录用户
 * 可删除/改路由 AI provider、发起测试连接 = 越权(apiKey 读时脱敏,但写操作可瘫痪全部 AI),已堵。
 * 消费方只有 AI 接入管理页(admin:menu);后端 AI 服务走 DI(ExternalApiService)不经此 HTTP 口。
 *
 * apiKey 始终脱敏返回(前 4 + 后 4,中间 ***)。
 */
@Controller('external-apis')
@UseGuards(AuthGuard)
@Permission('admin:menu')
export class ExternalApiController {
  constructor(private readonly svc: ExternalApiService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  /** 模型路由总览:每个 AI 消费功能当前命中的 provider + 备选链。须声明在 :provider 之前 */
  @Get('routing')
  routing() {
    return this.svc.listRouting();
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

  /** 绑定/解绑某功能到某 provider(provider 空=自动)。须声明在 :provider 之前 */
  @Patch('routing/:consumerKey')
  setRoute(
    @Param('consumerKey') consumerKey: string,
    @Body() dto: SetAiRouteDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    const provider =
      dto.provider && dto.provider.trim() ? dto.provider.trim() : null;
    return this.svc.setRoute(consumerKey, provider, {
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

  /** 测试连接 — body 可传 apiKey/apiUrl/model 覆盖,便于编辑对话框「测试当前编辑值」 */
  @Post(':provider/test')
  test(
    @Param('provider') provider: string,
    @Body() dto: TestExternalApiDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.test(provider, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 余额查询(仅个别 provider 支持) */
  @Get(':provider/balance')
  balance(@Param('provider') provider: string) {
    return this.svc.queryBalance(provider);
  }
}
