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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { ReportService } from './report.service';
import { ReportCatalogService, type CatalogSearchQuery } from './report-catalog.service';
import { ReportSubmissionService } from './report-submission.service';
import { ReportInvoiceExtractionService } from './report-invoice-extraction.service';
import { PublishReportDto } from './dto/publish-report.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { SaveSubmissionDto } from './dto/save-submission.dto';
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { ExtractInvoiceDto } from './dto/extract-invoice.dto';
import { UpdateReportTaskDto } from './dto/update-report-task.dto';
import { SaveGoalTargetsDto } from './dto/save-goal-targets.dto';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 通用报送平台(report)。对口责任部门走「组织机构」org-meta(counterpartParentOrgIds,照搬 task),
 * 无独立对口配置端点。⚠ 路由顺序:具体路径(catalog* / inbox / targets)必须声明在 `:id` 之前。
 */
@Controller('reports')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(
    private readonly svc: ReportService,
    private readonly catalog: ReportCatalogService,
    private readonly submissions: ReportSubmissionService,
    private readonly invoiceExtract: ReportInvoiceExtractionService,
  ) {}

  // ─── 清单(目录)─────────────────────────────
  @Post('catalog/import')
  @Permission('report:manage')
  @UseInterceptors(FileInterceptor('file'))
  importCatalog(
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body() body: { catalogTag?: string; name?: string; year?: string },
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.catalog.importFromFile(
      file,
      { catalogTag: body.catalogTag ?? '', name: body.name ?? '', year: body.year ? Number(body.year) : null },
      { actorId: me.sub, actorName: me.name, ip: req.ip },
    );
  }

  @Get('catalogs')
  listCatalogs() {
    return this.catalog.listCatalogs();
  }

  @Get('catalog')
  searchCatalog(@Query() query: CatalogSearchQuery) {
    return this.catalog.searchItems(query);
  }

  @Get('catalog/categories')
  catalogCategories(@Query('catalogTag') catalogTag: string) {
    return this.catalog.categories(catalogTag);
  }

  @Get('catalog/filters')
  catalogFilters(@Query('catalogTag') catalogTag: string) {
    return this.catalog.filterFacets(catalogTag);
  }

  // ─── 派发对象快捷组(每人自己,服务端持久化)─────
  @Get('unit-groups')
  listUnitGroups(@CurrentUser() me: AuthPayload) {
    return this.svc.listUnitGroups(me.sub);
  }

  @Post('unit-groups')
  createUnitGroup(@Body() body: { name?: string; orgIds?: string[] }, @CurrentUser() me: AuthPayload) {
    return this.svc.createUnitGroup(me.sub, body.name ?? '', body.orgIds ?? []);
  }

  @Delete('unit-groups/:id')
  deleteUnitGroup(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.svc.deleteUnitGroup(me.sub, id);
  }

  // ─── 接收侧:待办 / 认领 / 指派 ───────────────
  @Get('inbox')
  inbox(@CurrentUser() me: AuthPayload) {
    return this.svc.inbox({ actorId: me.sub, actorName: me.name });
  }

  @Post('targets/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.claim(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post('targets/:id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignReportDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.assign(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  // ─── 录入(master-detail)/ 审核 ───────────────
  /** 填报页数据(承办人):任务字段 + 派发来源 + 已录发票。 */
  @Get('targets/:id/fill')
  getFill(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.submissions.getFill(id, { actorId: me.sub, actorName: me.name });
  }

  /** 录入一张发票(头 + 明细)。 */
  @Post('targets/:id/submissions')
  saveSubmission(
    @Param('id') id: string,
    @Body() dto: SaveSubmissionDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.submissions.saveSubmission(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 列出某对象已录发票(承办人 / 派发人 / 管理员)。 */
  @Get('targets/:id/submissions')
  listSubmissions(@Param('id') id: string, @CurrentUser() me: AuthPayload) {
    return this.submissions.listSubmissions(id, { actorId: me.sub, actorName: me.name });
  }

  @Delete('submissions/:id')
  deleteSubmission(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.submissions.deleteSubmission(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Post('submissions/:id/review')
  reviewSubmission(
    @Param('id') id: string,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.submissions.reviewSubmission(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** AI 识别发票(承办人录入辅助):上传后传 fileId → 抽发票号/日期/金额/明细,前端自动填表。 */
  @Post('extract-invoice')
  extractInvoice(@Body() dto: ExtractInvoiceDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.invoiceExtract.extractInvoice(dto.fileId, dto.catalogTag, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  // ─── 报送任务 ────────────────────────────────
  @Post()
  @Permission('report:manage')
  publish(@Body() dto: PublishReportDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.publish(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Get()
  list(@Query('mine') mine: string | undefined, @CurrentUser() me: AuthPayload) {
    return this.svc.listTasks(mine ? me.sub : undefined);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.getTask(id);
  }

  /** 目标完成情况(逐单位×逐目标:实际值/完成率/是否达标)。 */
  @Get(':id/goal-progress')
  goalProgress(@Param('id') id: string) {
    return this.svc.goalProgress(id);
  }

  /** report.query 取数口:取一个目标的各单位值(供考核侧消费 / 预览;目标独立不耦合)。 */
  @Get(':id/goals/:goalKey/query')
  queryGoal(@Param('id') id: string, @Param('goalKey') goalKey: string) {
    return this.svc.queryGoal(id, goalKey);
  }

  /** 保存逐单位目标值(perUnit 金额目标)。派发人本人或管理员。 */
  @Post(':id/goal-targets')
  @Permission('report:manage')
  saveGoalTargets(
    @Param('id') id: string,
    @Body() dto: SaveGoalTargetsDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.saveGoalTargets(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 编辑报送任务(标题 / 填报要求 / 截止)。派发人本人或管理员。 */
  @Patch(':id')
  @Permission('report:manage')
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateReportTaskDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateTask(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 删除报送任务,并清理其下全部派发对象 / 发票 / 明细 / 附件文件。 */
  @Delete(':id')
  @Permission('report:manage')
  deleteTask(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.deleteTask(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
