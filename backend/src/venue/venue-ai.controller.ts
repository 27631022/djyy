import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { VenueAiService } from './venue-ai.service';
import { ExtractLayoutDto } from './dto/extract-layout.dto';
import { ExtractRosterDto } from './dto/extract-roster.dto';

/**
 * 会场 AI(智能生成布局的「AI 帮填」)。
 *   POST /venue/ai/extract-layout  @Permission('venue:manage')  描述 → 排式布局参数
 */
@Controller('venue/ai')
@UseGuards(AuthGuard)
export class VenueAiController {
  constructor(private readonly svc: VenueAiService) {}

  @Post('extract-layout')
  @Permission('venue:manage')
  extractLayout(
    @Body() dto: ExtractLayoutDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.extractLayoutSpec(dto.description, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Post('extract-roster')
  @Permission('venue:manage')
  extractRoster(
    @Body() dto: ExtractRosterDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.extractRoster(dto.text, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
