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
import { ShowcaseInteractionService } from './showcase-interaction.service';
import { CreateFeedbackDto, ReplyFeedbackDto } from './dto/interaction.dto';

/**
 * 先锋晒场互动(登录态)。路径段 stages|entries → targetType(service 白名单校验)。
 * 点赞:唯一约束保证「每个账户对同一对象只能点一次」,DELETE 取消。
 * 吐槽:所有登录用户可发;查看/回复/关闭 = 台主/作者/管理员(service 内判)。
 */
@Controller('showcase')
@UseGuards(AuthGuard)
export class ShowcaseInteractionController {
  constructor(private readonly svc: ShowcaseInteractionService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  private kindToType(kind: string): string {
    return kind === 'stages' ? 'stage' : kind === 'entries' ? 'entry' : kind;
  }

  /* ─── 点赞 ─── */

  @Get(':kind(stages|entries)/:id/reactions/mine')
  reactionState(@Param('kind') kind: string, @Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.reactionState(this.kindToType(kind), id, me.sub);
  }

  @Post(':kind(stages|entries)/:id/reactions/like')
  like(@Param('kind') kind: string, @Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.setReaction(this.kindToType(kind), id, me.sub, 'like', true);
  }

  @Delete(':kind(stages|entries)/:id/reactions/like')
  unlike(@Param('kind') kind: string, @Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.setReaction(this.kindToType(kind), id, me.sub, 'like', false);
  }

  /* ─── 吐槽 ─── */

  @Post(':kind(stages|entries)/:id/feedback')
  addFeedback(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.addFeedback(this.kindToType(kind), id, dto, this.ctx(me, req));
  }

  @Get('feedback')
  listFeedback(
    @CurrentUser() me: AuthPayload,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listFeedback(me.sub, scope === 'all' ? 'all' : 'mine', status);
  }

  @Post('feedback/:id/replies')
  replyFeedback(
    @Param('id') id: string,
    @Body() dto: ReplyFeedbackDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.replyFeedback(id, dto, this.ctx(me, req));
  }

  @Patch('feedback/:id/close')
  closeFeedback(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.closeFeedback(id, this.ctx(me, req));
  }

  /* ─── 浏览 ─── */

  @Post(':kind(stages|entries)/:id/view')
  recordView(@Param('kind') kind: string, @Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.recordView(this.kindToType(kind), id, me.sub);
  }

  /* ─── 统计(管理端) ─── */

  @Permission('showcase:manage')
  @Get('stats')
  stats() {
    return this.svc.stats();
  }
}
