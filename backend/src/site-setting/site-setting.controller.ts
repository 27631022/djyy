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
import { Permission } from '../permission';
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
   * 更新 — 仅管理员(admin:menu,与「系统设置」菜单同门)。
   * 站点设置承载 品牌/主题/首页榜单指定,原先只判登录 —— 任何账号都能改站名/主题色/
   * 把首页考核榜单点来点去,风险面太大;platform_admin 直通,enterprise_admin 有 admin:menu。
   */
  @Put()
  @UseGuards(AuthGuard)
  @Permission('admin:menu')
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
