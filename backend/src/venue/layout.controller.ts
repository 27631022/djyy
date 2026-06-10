import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { LayoutService } from './layout.service';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';

/**
 * 会场图 CRUD。
 *   GET    /venue/layouts?roomId=  登录                       某会议室的会场图列表(不含 layoutJson)
 *   GET    /venue/layouts/:id      登录                       详情(含 layoutJson)
 *   POST   /venue/layouts          @Permission('venue:manage') 新建
 *   PATCH  /venue/layouts/:id      @Permission('venue:manage') 保存(设计器整体回写)
 *   DELETE /venue/layouts/:id      @Permission('venue:manage') 删除
 */
@Controller('venue/layouts')
@UseGuards(AuthGuard)
export class LayoutController {
  constructor(private readonly svc: LayoutService) {}

  @Get()
  list(@Query('roomId') roomId?: string, @Query('status') status?: string) {
    return this.svc.list(roomId, status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Permission('venue:manage')
  create(
    @Body() dto: CreateLayoutDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('venue:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLayoutDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('venue:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post(':id/duplicate')
  @Permission('venue:manage')
  duplicate(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.duplicate(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
