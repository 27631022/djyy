import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { KnowledgeAiService } from './knowledge-ai.service';
import { AiCleanDto, AiSearchDto, FetchUrlDto } from './dto/ai.dto';

/**
 * 知识分享 AI(P4)。归档相关(fetch-url/clean/search)= knowledge:publish(发文者用);
 * 导读/FAQ 作用于具体文章 = 作者或 manage(service 内判)。
 */
@Controller('knowledge/ai')
@UseGuards(AuthGuard)
export class KnowledgeAiController {
  constructor(private readonly svc: KnowledgeAiService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  @Get('capabilities')
  capabilities() {
    return this.svc.capabilities();
  }

  @Permission('knowledge:publish')
  @Post('fetch-url')
  fetchUrl(@Body() dto: FetchUrlDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.fetchUrl(dto.url, this.ctx(me, req));
  }

  @Permission('knowledge:publish')
  @Post('clean')
  clean(@Body() dto: AiCleanDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.clean(dto.name, dto.text, this.ctx(me, req));
  }

  @Permission('knowledge:publish')
  @Post('search')
  search(@Body() dto: AiSearchDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.search(dto.name, dto.hint, this.ctx(me, req));
  }

  /* 作用于具体文章:作者或 manage(service 内判) */
  @Post('articles/:id/guide')
  guide(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.generateGuide(id, this.ctx(me, req));
  }

  @Post('articles/:id/faq')
  faq(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.generateFaq(id, this.ctx(me, req));
  }
}
