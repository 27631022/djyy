import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserCustomFieldService } from './user-custom-field.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Controller('user-custom-fields')
@UseGuards(AuthGuard)
export class UserCustomFieldController {
  constructor(private readonly service: UserCustomFieldService) {}

  /**
   * 列表 — inactive=true 含禁用。
   * 读取字段「定义」(元数据,驱动用户资料表单):自定义字段配置页(admin:menu)+ 用户管理页(admin:user:read)
   * 两处消费,故 admin:menu 或 admin:user:read 任一即可(此前仅 AuthGuard,任何登录用户可读用户表元数据)。
   * 与字典下拉不同:自定义字段定义不被跨域下拉消费,收窄到这两个域不会误伤(普通成员/门户不消费)。
   */
  @Get()
  @Permission('admin:menu', 'admin:user:read')
  list(@Query('inactive') inactive?: string) {
    return this.service.list(inactive === 'true');
  }

  @Get(':id')
  @Permission('admin:menu', 'admin:user:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ── 写操作 = 改用户表字段定义(仅自定义字段配置页消费),收口 admin:menu(与菜单门控一致)。 ──

  @Post()
  @Permission('admin:menu')
  create(@Body() dto: CreateCustomFieldDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.service.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('admin:menu')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('admin:menu')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.service.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
