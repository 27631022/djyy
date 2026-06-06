import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
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
import { ReviewSubmissionDto } from './dto/review-submission.dto';
import { NewPeriodDto } from './dto/new-period.dto';
import { ConfigureCounterpartDto, SetDispatchOrgDto } from './dto/counterpart.dto';
import { ConfirmTargetDto } from './dto/confirm-target.dto';
import { AssignTargetDto } from './dto/assign-target.dto';

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
 * 接收/填报/审核(inbox / claim / fill / review)在 P2 已落地;汇总(summary)在 P3 加。
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

  /** 我的统计(桌面挂件):待领取 / 待落实 / 已完成(本年)/ 累计完成。 */
  @Get('my-stats')
  myStats(@CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.myStats({ actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 我的已完成清单(挂件「已完成 / 累计完成」点开即看):range=year|all。 */
  @Get('my-completed')
  myCompleted(
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
    @Query('range') range?: string,
  ) {
    return this.svc.myCompleted(
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      range === 'year' ? 'year' : 'all',
    );
  }

  /** 我的派发范围(给「派发对象」选择器过滤;unrestricted=true 不限) */
  @Get('dispatch-scope')
  dispatchScope(@CurrentUser() me: AuthPayload) {
    return this.svc.getDispatchScope(me.sub);
  }

  /**
   * 平级确认队列(部门负责人侧):待我确认的跨机关部门派发对象。
   * 不加权限点 —— 是否能确认由「我是否相关部门负责人」在 service 内判定(组织归属天然限定)。
   */
  @Get('confirm-queue')
  confirmQueue(@CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.confirmQueue({ actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 平级确认决定:approve / reject(service 校验我是相关部门负责人)。 */
  @Post('targets/:id/confirm')
  confirmTarget(
    @Param('id') id: string,
    @Body() dto: ConfirmTargetDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.confirmTarget(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 重新发起(派发人侧):把被驳回的跨部门派发对象重置回「待确认」,再走一遍双方确认。 */
  @Post('targets/:id/reinitiate')
  @Permission('task:manage')
  reinitiateConfirm(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.reinitiateConfirm(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 接收(认领)一个派发对象 → 成为责任人(service 内校验「只能认领自己责任部门的」)。 */
  @Post('targets/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.claim(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 指派承办人(承办部门负责人侧):把待接收对象指定给本部门成员承办(service 校验我是负责人 + 承办人是本部门成员)。 */
  @Post('targets/:id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTargetDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.assign(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
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

  /** 审核:派发人查看某派发对象的回执(填报内容 + 责任人)。 */
  @Get('targets/:id/submission')
  getSubmission(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.getSubmission(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 审核:通过(done)/ 退回重填(returned + 退回原因)。派发人侧。 */
  @Post('targets/:id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.review(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 汇总(派发人侧):一行一对象 + 数字合计 + 附件引用。 */
  @Get(':id/summary')
  summary(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.getSummary(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /**
   * 附件批量打包下载(派发人侧):按单位分文件夹的 ZIP。
   * 用 POST 而非 GET —— 下载管理器(迅雷高级集成等)只拦截 GET 式下载,POST 响应不被当下载抢走;
   * 配合无 Content-Disposition + octet-stream,避免被拦成假 CORS 错误(同证书 bulk-download)。
   */
  @Post(':id/attachments-zip')
  async attachmentsZip(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const { buffer } = await this.svc.getAttachmentsZip(id, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
    // 故意不发 Content-Disposition: attachment、也不用 application/zip ——
    // 前端走 axios 取 Blob、用 blob: URL 本地命名下载,服务端无需声明下载意图。
    // 带 attachment / zip 头会被「迅雷高级集成」等下载管理器在网络层拦截(返回 204、丢 CORS 头,
    // 浏览器误报成 CORS 错误)。用 octet-stream + 无 disposition 让它当普通接口响应放行。
    return new StreamableFile(buffer, { type: 'application/octet-stream' });
  }

  /** 发起新一期(周期报表):克隆为新一期 + 上期值预填 + 同责任人接力。派发人侧。 */
  @Post(':id/new-period')
  @Permission('task:manage')
  newPeriod(
    @Param('id') id: string,
    @Body() dto: NewPeriodDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.startNewPeriod(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  /** 配置对口(派发人侧):把某责任部门的「对口上级」设为本任务派发部门,实时生效。 */
  @Post(':id/configure-counterpart')
  @Permission('task:manage')
  configureCounterpart(
    @Param('id') id: string,
    @Body() dto: ConfigureCounterpartDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.configureCounterpart(id, dto.handlerOrgId, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 设置 / 补「派发部门」(派发人侧):历史任务没派发部门时补上。 */
  @Post(':id/dispatch-org')
  @Permission('task:manage')
  setDispatchOrg(
    @Param('id') id: string,
    @Body() dto: SetDispatchOrgDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.setDispatchOrg(id, dto.dispatchOrgId, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /** 手动触发「超期自动通过」扫描(仅系统管理员;自动扫描已每 6h 跑一次)。 */
  @Post('admin/sweep-overdue')
  sweepOverdue(@CurrentUser() me: AuthPayload) {
    return this.svc.triggerOverdueSweep(me.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
