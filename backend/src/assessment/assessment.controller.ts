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
}
