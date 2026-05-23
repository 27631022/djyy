import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserCustomFieldService } from './user-custom-field.service';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Controller('user-custom-fields')
@UseGuards(AuthGuard)
export class UserCustomFieldController {
  constructor(private readonly service: UserCustomFieldService) {}

  /** 列表 — inactive=true 含禁用 */
  @Get()
  list(@Query('inactive') inactive?: string) {
    return this.service.list(inactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomFieldDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.service.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.service.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
