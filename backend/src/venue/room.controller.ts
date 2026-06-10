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
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

/**
 * 实体会议室 CRUD。
 *   GET    /venue/rooms          登录                       列表(?active=true 仅启用)
 *   GET    /venue/rooms/:id      登录                       详情 + 会场图列表
 *   POST   /venue/rooms          @Permission('venue:manage') 新建
 *   PATCH  /venue/rooms/:id      @Permission('venue:manage') 更新
 *   DELETE /venue/rooms/:id      @Permission('venue:manage') 删除(级联删会场图)
 */
@Controller('venue/rooms')
@UseGuards(AuthGuard)
export class RoomController {
  constructor(private readonly svc: RoomService) {}

  @Get()
  list(@Query('active') active?: string) {
    return this.svc.list(active !== 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Permission('venue:manage')
  create(
    @Body() dto: CreateRoomDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('venue:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
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
}
