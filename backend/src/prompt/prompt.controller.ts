import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { PromptService } from './prompt.service';
import { UpdatePromptDto } from './dto/update-prompt.dto';

/**
 * AI 提示词管理(鉴权;前端菜单按 admin:menu 收口)。
 *   GET   /prompts            列全部提示词(默认 + 覆盖状态)
 *   PATCH /prompts/:key       覆盖某提示词
 *   POST  /prompts/:key/reset 还原默认
 */
@Controller('prompts')
@UseGuards(AuthGuard)
export class PromptController {
  constructor(private readonly svc: PromptService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpdatePromptDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(key, dto.content, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Post(':key/reset')
  reset(@Param('key') key: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.reset(key, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
