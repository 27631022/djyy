import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { AssessmentService } from './assessment.service';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { TrialScoreDto } from './dto/trial-score.dto';

/**
 * 考核体系 API(P1)。
 *   GET    /assessment/schemes        登录                         体系列表
 *   GET    /assessment/schemes/:id    登录                         体系详情(含指标树 JSON)
 *   POST   /assessment/schemes        @Permission('assessment:manage') 新建
 *   PATCH  /assessment/schemes/:id    @Permission('assessment:manage') 更新(可含整棵指标树)
 *   DELETE /assessment/schemes/:id    @Permission('assessment:manage') 删除
 */
@Controller('assessment')
@UseGuards(AuthGuard)
export class AssessmentController {
  constructor(private readonly svc: AssessmentService) {}

  @Get('schemes')
  list() {
    return this.svc.list();
  }

  @Get('schemes/:id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post('schemes')
  @Permission('assessment:manage')
  create(@Body() dto: CreateSchemeDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.create(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch('schemes/:id')
  @Permission('assessment:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchemeDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete('schemes/:id')
  @Permission('assessment:manage')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** POST /assessment/schemes/:id/duplicate  整体复制一张考核表(复用) */
  @Post('schemes/:id/duplicate')
  @Permission('assessment:manage')
  duplicate(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.duplicate(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** POST /assessment/scoring/trial  试算预览(登录即可) */
  @Post('scoring/trial')
  trial(@Body() dto: TrialScoreDto) {
    return this.svc.trial(dto);
  }
}
