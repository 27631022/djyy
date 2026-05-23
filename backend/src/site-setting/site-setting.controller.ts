import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SiteSettingService } from './site-setting.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { UpdateSiteSettingDto } from './dto/update-site-setting.dto';

@Controller('site-settings')
export class SiteSettingController {
  constructor(private readonly svc: SiteSettingService) {}

  /**
   * 公开接口 — 前台首页 NavPage 未登录也要拉这个配置渲染
   * 不加 @UseGuards(AuthGuard)
   */
  @Get()
  async get() {
    return this.svc.get();
  }

  /**
   * 更新 — 仅认证用户可调用(后期可叠加 permission guard 限制为 admin 角色)
   */
  @Put()
  @UseGuards(AuthGuard)
  async update(
    @Body() dto: UpdateSiteSettingDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }
}
