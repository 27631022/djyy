import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { TaskService } from './task.service';
import { TaskExtractionService } from './task-extraction.service';
import { DispatchTaskDto } from './dto/dispatch-task.dto';
import { SuggestFieldsDto } from './dto/suggest-fields.dto';
import { SaveFillDto } from './dto/save-fill.dto';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTRACT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * 任务派发(派发人侧)。
 *   POST /tasks            @Permission('task:manage')  建任务 + 派发(fan-out + 对口路由)
 *   GET  /tasks            登录                          我派发的任务列表
 *   GET  /tasks/:id        登录                          任务详情 + 派发对象状态
 * 接收/填报/审核/汇总(inbox / review / summary)在 P2、P3 加。
 */
@Controller('tasks')
@UseGuards(AuthGuard)
export class TaskController {
  constructor(
    private readonly svc: TaskService,
    private readonly extraction: TaskExtractionService,
  ) {}

  @Post()
  @Permission('task:manage')
  dispatch(
    @Body() dto: DispatchTaskDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.dispatch(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /**
   * AI 识别通知文件 — 上传 Word/PDF → LLM 抽 任务名称 / 重点描述 / 注意事项 / 截止日期。
   * 返回结构化 JSON,前端拿来预填新建任务第一步;不持久化(只写审计)。
   */
  @Post('extract')
  @Permission('task:manage')
  @UseInterceptors(FileInterceptor('file'))
  async extract(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    if (file.size > EXTRACT_MAX_BYTES) {
      throw new BadRequestException(
        `文件过大(${(file.size / 1024 / 1024).toFixed(1)}MB),最大支持 ${EXTRACT_MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    return this.extraction.extract(file, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /**
   * 按填报要求文本生成填报字段(不读文件)。第二步「按填报要求生成字段」按钮用。
   */
  @Post('suggest-fields')
  @Permission('task:manage')
  suggestFields(
    @Body() dto: SuggestFieldsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.extraction.suggestFields(dto.requirements, dto.title, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Get()
  list(@CurrentUser() me: AuthPayload) {
    return this.svc.list({ actorId: me.sub, actorName: me.name });
  }

  /**
   * 我的待办(接收侧):我负责的 + 我所在责任部门待接收的。
   * 不加权限点 —— 只展示「本人 / 本部门」的任务,范围由组织归属天然限定,任何登录员工都能看自己的待办。
   */
  @Get('inbox')
  inbox(@CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.inbox({ actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 接收(认领)一个派发对象 → 成为责任人(service 内校验「只能认领自己责任部门的」)。 */
  @Post('targets/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.claim(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 填报页数据(责任人):任务字段 + 我的回执 */
  @Get('targets/:id/fill')
  getFill(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.getFill(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 保存填报(草稿 / 提交) */
  @Post('targets/:id/fill')
  saveFill(
    @Param('id') id: string,
    @Body() dto: SaveFillDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.saveFill(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
