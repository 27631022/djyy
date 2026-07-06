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
import { KnowledgeInteractionService } from './knowledge-interaction.service';
import {
  CreateCommentDto,
  CreateFeedbackDto,
  ReplyFeedbackDto,
} from './dto/interaction.dto';

/**
 * 知识分享互动(登录态):点赞/收藏/评论/吐槽/统计。
 * 反馈查看/回复由「作者或 manage」在 service 内判;统计 = knowledge:manage。
 */
@Controller('knowledge')
@UseGuards(AuthGuard)
export class KnowledgeInteractionController {
  constructor(private readonly svc: KnowledgeInteractionService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  /* 点赞 / 收藏 */
  @Get('articles/:id/reactions/mine')
  myReactions(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.reactionState(id, me.sub);
  }

  @Post('articles/:id/reactions/:type')
  addReaction(@Param('id') id: string, @Param('type') type: string, @CurrentUser() me: AuthPayload) {
    return this.svc.setReaction(id, me.sub, type, true);
  }

  @Delete('articles/:id/reactions/:type')
  removeReaction(@Param('id') id: string, @Param('type') type: string, @CurrentUser() me: AuthPayload) {
    return this.svc.setReaction(id, me.sub, type, false);
  }

  /* 评论 */
  @Get('articles/:id/comments')
  listComments(@Param('id') id: string, @Query('page') page?: string) {
    return this.svc.listComments(id, page ? Number(page) : 1);
  }

  @Post('articles/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.addComment(id, dto, this.ctx(me, req));
  }

  @Delete('comments/:id')
  removeComment(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeComment(id, this.ctx(me, req));
  }

  /* 吐槽反馈 */
  @Post('articles/:id/feedback')
  addFeedback(
    @Param('id') id: string,
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.addFeedback(id, dto, this.ctx(me, req));
  }

  @Get('feedback')
  listFeedback(
    @CurrentUser() me: AuthPayload,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listFeedback(me.sub, scope === 'all' ? 'all' : 'mine', status || undefined);
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

  /* 统计(管理端) */
  @Permission('knowledge:manage')
  @Get('stats')
  stats() {
    return this.svc.stats();
  }
}
