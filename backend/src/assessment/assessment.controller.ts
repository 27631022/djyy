import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { AssessmentService } from './assessment.service';
import { AssessmentExtractionService } from './assessment-extraction.service';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { TrialScoreDto } from './dto/trial-score.dto';
import { PreviewIndicatorDto } from './dto/preview-indicator.dto';
import { ReportQueryPreviewDto } from './dto/report-query-preview.dto';
import { GenerateCriteriaDto } from './dto/generate-criteria.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { SaveScoresDto } from './dto/save-scores.dto';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

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
  constructor(
    private readonly svc: AssessmentService,
    private readonly extraction: AssessmentExtractionService,
  ) {}

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

  /** POST /assessment/scoring/preview  单指标实时预览:各对象 ●得分 + ●# 单项排名(登录即可) */
  @Post('scoring/preview')
  previewIndicator(@Body() dto: PreviewIndicatorDto) {
    return this.svc.previewIndicator(dto);
  }

  /** GET /assessment/report-query/sources  报送取数可选源:有目标的报送任务 + 目标(登录即可) */
  @Get('report-query/sources')
  reportQuerySources() {
    return this.svc.reportQuerySources();
  }

  /** POST /assessment/report-query/preview  报送取数预览:各对象将取到的值(登录即可) */
  @Post('report-query/preview')
  reportQueryPreview(@Body() dto: ReportQueryPreviewDto) {
    return this.svc.reportQueryPreview(dto);
  }

  /** GET /assessment/my-scope  我的考核区域(按登录账号收敛的考核关系 + 主体) */
  @Get('my-scope')
  myScope(@CurrentUser() me: AuthPayload) {
    return this.svc.myScope(me.sub);
  }

  /** GET /assessment/relations/:key/objects?subjectOrgId=  主体 → 考核对象候选(批量选用) */
  @Get('relations/:key/objects')
  relationObjects(@Param('key') key: string, @Query('subjectOrgId') subjectOrgId: string) {
    return this.svc.relationObjects(key, subjectOrgId);
  }

  /** POST /assessment/extract  上传考核办法文件 → AI 生成指标树草稿(预留接口,不落库) */
  @Post('extract')
  @Permission('assessment:manage')
  @UseInterceptors(FileInterceptor('file'))
  extract(
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.extraction.extractIndicators(file, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** POST /assessment/criteria/generate  指标配置 → AI 写一段评分标准/说明(不落库,前端填入 rubric) */
  @Post('criteria/generate')
  @Permission('assessment:manage')
  generateCriteria(@Body() dto: GenerateCriteriaDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.extraction.generateCriteria(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  // ─── P2 打分闭环:考核轮次 ───

  /** POST /assessment/schemes/:id/rounds  发起考核(快照考核表) */
  @Post('schemes/:id/rounds')
  @Permission('assessment:manage')
  createRound(
    @Param('id') id: string,
    @Body() dto: CreateRoundDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createRound(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** GET /assessment/rounds?schemeId=  轮次列表 */
  @Get('rounds')
  listRounds(@Query('schemeId') schemeId?: string) {
    return this.svc.listRounds(schemeId);
  }

  /** GET /assessment/rounds/:id  轮次详情(快照 + 已录原始值) */
  @Get('rounds/:id')
  getRound(@Param('id') id: string) {
    return this.svc.getRound(id);
  }

  /** DELETE /assessment/rounds/:id  删除轮次(级联得分) */
  @Delete('rounds/:id')
  @Permission('assessment:manage')
  removeRound(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeRound(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** POST /assessment/rounds/:id/scores  批量录入指标原始值(责任部门打分) */
  @Post('rounds/:id/scores')
  @Permission('assessment:score')
  saveScores(
    @Param('id') id: string,
    @Body() dto: SaveScoresDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.saveScores(id, dto.scores, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** POST /assessment/rounds/:id/compute  计算轮次(取数→计分→难易系数→排名→汇总→定级) */
  @Post('rounds/:id/compute')
  @Permission('assessment:manage')
  computeRound(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.computeRound(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
