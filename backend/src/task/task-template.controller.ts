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
import { TaskTemplateService } from './task-template.service';
import { CreateTaskTemplateDto } from './dto/create-task-template.dto';
import { UpdateTaskTemplateDto } from './dto/update-task-template.dto';

/**
 * 任务模板(可复用表单 schema)CRUD。
 * 写操作 @Permission('task:manage');读仅校验登录(任意登录用户建任务时要选模板)。
 */
@Controller('task-templates')
@UseGuards(AuthGuard)
export class TaskTemplateController {
  constructor(private readonly svc: TaskTemplateService) {}

  @Get()
  list(@Query('active') active?: string) {
    // ?active=true 仅启用;默认含禁用(管理页要看全部)
    return this.svc.list(active !== 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Permission('task:manage')
  create(
    @Body() dto: CreateTaskTemplateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('task:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskTemplateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('task:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
