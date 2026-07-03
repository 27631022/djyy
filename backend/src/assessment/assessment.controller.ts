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
import { UpdateSubtreeDto } from './dto/update-subtree.dto';
import { TrialScoreDto } from './dto/trial-score.dto';
import { PreviewIndicatorDto } from './dto/preview-indicator.dto';
import { PreviewSubtotalDto } from './dto/preview-subtotal.dto';
import { ReportQueryPreviewDto } from './dto/report-query-preview.dto';
import { CertHonorPreviewDto } from './dto/cert-honor-preview.dto';
import { GenerateCriteriaDto } from './dto/generate-criteria.dto';
import { GenerateCheckupIssuesDto } from './dto/generate-checkup-issues.dto';
import { CreateRoundDto } from './dto/create-round.dto';
import { SaveScoresDto } from './dto/save-scores.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { ConfirmRequestDto } from './dto/confirm-request.dto';
import { ConfirmIndicatorDto } from './dto/confirm-indicator.dto';

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

  /** GET /assessment/my-managed-schemes  「我维护的考核」:我作为节点管理员可维护的表 + 我管的节点(登录即可) */
  @Get('my-managed-schemes')
  myManagedSchemes(@CurrentUser() me: AuthPayload) {
    return this.svc.managedSchemes(me.sub);
  }

  /** PATCH /assessment/schemes/:id/subtree  节点管理员维护本节点子树(登录;service 内按节点管理员/管理员鉴权) */
  @Patch('schemes/:id/subtree')
  updateSubtree(
    @Param('id') id: string,
    @Body() dto: UpdateSubtreeDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateSubtree(
      id,
      dto.nodeCode,
      dto.subtree,
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      dto.confirmDataLoss === true,
    );
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

  /** POST /assessment/scoring/preview-subtotal  多指标合计实时预览:各项单项 + 合计排名(打分人侧,登录即可) */
  @Post('scoring/preview-subtotal')
  previewSubtotal(@Body() dto: PreviewSubtotalDto) {
    return this.svc.previewSubtotal(dto);
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

  /** POST /assessment/cert-honor/preview  荣誉积分预览:各对象将取到的积分(打分页中栏自动取数展示;登录即可) */
  @Post('cert-honor/preview')
  certHonorPreview(@Body() dto: CertHonorPreviewDto) {
    return this.svc.certHonorPreview(dto);
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

  /** POST /assessment/checkup/issues  单位体检数据摘要 → AI 写「问题与改进建议」。
   *  登录即可(单位自助看自己体检单也能点「AI 生成」);不落库,AI 不可达前端回退规则版。 */
  @Post('checkup/issues')
  generateCheckupIssues(@Body() dto: GenerateCheckupIssuesDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.extraction.generateCheckupIssues(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
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

  /** GET /assessment/rounds/:id  轮次详情(快照 + 已录原始值;责任人电话按调用者权限裁剪) */
  @Get('rounds/:id')
  getRound(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.getRound(id, me.sub);
  }

  /** DELETE /assessment/rounds/:id  删除轮次(级联得分) */
  @Delete('rounds/:id')
  @Permission('assessment:manage')
  removeRound(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeRound(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** POST /assessment/rounds/:id/scores  批量录入指标原始值(责任部门打分) */
  @Post('rounds/:id/scores')
  saveScores(
    @Param('id') id: string,
    @Body() dto: SaveScoresDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.saveScores(id, dto.scores, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** GET /assessment/rounds/:id/live-results  实时全表结果(读当前录入实时算,不落库;排名实时,已无手动「计算」)— 登录即可 */
  @Get('rounds/:id/live-results')
  liveResults(@Param('id') id: string) {
    return this.svc.liveResults(id);
  }

  // ─── 季度结果快照(一轮制下手动定格 + 历次对比)───

  /** POST /assessment/rounds/:id/snapshots  生成季度结果快照(用当前最新录入算一次并命名冻结) */
  @Post('rounds/:id/snapshots')
  @Permission('assessment:manage')
  createSnapshot(
    @Param('id') id: string,
    @Body() dto: CreateSnapshotDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.createSnapshot(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** GET /assessment/rounds/:id/snapshots  某轮次的结果快照列表(含 resultsJson,供切换/对比)— 登录即可 */
  @Get('rounds/:id/snapshots')
  listSnapshots(@Param('id') id: string) {
    return this.svc.listSnapshots(id);
  }

  /** DELETE /assessment/snapshots/:snapshotId  删除一份结果快照 */
  @Delete('snapshots/:snapshotId')
  @Permission('assessment:manage')
  removeSnapshot(@Param('snapshotId') snapshotId: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeSnapshot(snapshotId, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  // ─── 分数确认会签 ───

  /** POST /assessment/rounds/:id/confirm-request  总管理员发起/重新发起分数确认 */
  @Post('rounds/:id/confirm-request')
  @Permission('assessment:manage')
  requestConfirm(
    @Param('id') id: string,
    @Body() dto: ConfirmRequestDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.requestConfirm(id, !!dto?.reset, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** GET /assessment/rounds/:id/confirm  确认进度(哪个指标、谁还没确认 + 电话) */
  @Get('rounds/:id/confirm')
  @Permission('assessment:manage')
  confirmProgress(@Param('id') id: string) {
    return this.svc.confirmProgress(id);
  }

  /** GET /assessment/confirm/mine  我的考核确认(待我确认 / 已确认,跨轮次)— 登录即可 */
  @Get('confirm/mine')
  myConfirmations(@CurrentUser() me: AuthPayload) {
    return this.svc.myConfirmations(me.sub);
  }

  /** POST /assessment/rounds/:id/confirm/:leafCode  责任人确认某指标分数无误 — 登录即可(service 判责任人) */
  @Post('rounds/:id/confirm/:leafCode')
  confirmIndicator(
    @Param('id') id: string,
    @Param('leafCode') leafCode: string,
    @Body() dto: ConfirmIndicatorDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.confirmIndicator(id, leafCode, { actorId: me.sub, actorName: me.name, ip: req.ip }, dto?.note);
  }

  /** GET /assessment/rounds/:id/confirm-mine  我在本轮负责指标的确认状态(打分页「确认完成」按钮用) */
  @Get('rounds/:id/confirm-mine')
  myRoundConfirm(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.myRoundConfirm(id, me.sub);
  }

  /** POST /assessment/rounds/:id/confirm-mine  确认完成:把我本轮负责的全部指标标记已确认 — 登录即可 */
  @Post('rounds/:id/confirm-mine')
  confirmMineInRound(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.confirmMineInRound(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** GET /assessment/my-assessments  「我的考核」:我有负责指标的轮次 + 确认进度(打分人入口 + 实时角标)— 登录即可 */
  @Get('my-assessments')
  myAssessments(@CurrentUser() me: AuthPayload) {
    return this.svc.myAssessments(me.sub);
  }
}
