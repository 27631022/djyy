import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { CertificateIssueService } from './issue.service';
import { CertificateExtractionService } from './extraction.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { IssueExternalCertificateDto } from './dto/external-certificate.dto';
import {
  BulkDownloadDto,
  RevokeCertificateDto,
} from './dto/revoke-certificate.dto';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTRACT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * 已发证书相关 admin API。
 *
 * 权限点(Phase B 启用):
 *   POST   /certificates                @Permission('certificate:issue')
 *   PATCH  /certificates/:id/revoke     @Permission('certificate:revoke')
 *   POST   /certificates/bulk-download  @Permission('certificate:bulk-download')
 *   GET 系列只校验登录,任意登录用户可查
 *
 * 未来:
 *   Phase D 加 POST /certificates/extract(AI 提取)
 *   Phase E 加 POST /certificates/external + POST /certificates/bulk(CSV)
 */
@Controller('certificates')
@UseGuards(AuthGuard)
export class CertificateIssueController {
  constructor(
    private readonly svc: CertificateIssueService,
    private readonly extraction: CertificateExtractionService,
  ) {}

  @Post()
  @Permission('certificate:issue')
  issue(
    @Body() dto: IssueCertificateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.issue(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  @Get()
  list(
    @Query('templateId') templateId?: string,
    @Query('source') source?: string,
    @Query('revoked') revoked?: string,
    @Query('batchKey') batchKey?: string,
    @Query('recipientUserId') recipientUserId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (templateId) filter.templateId = templateId;
    if (source === 'internal' || source === 'external') filter.source = source;
    if (revoked === 'true') filter.revoked = true;
    if (revoked === 'false') filter.revoked = false;
    if (batchKey) filter.batchKey = batchKey;
    if (recipientUserId) filter.recipientUserId = recipientUserId;
    return this.svc.list(filter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  /** 轻量缩略图(压缩预览图,不含 pdfData)— 已发证书详情预览用 */
  @Get(':id/thumbnail')
  getThumbnail(@Param('id') id: string) {
    return this.svc.getThumbnail(id);
  }

  /**
   * 删除证书 — 物理删除,管理员专用(@Permission('certificate:delete'),
   * 仅 platform_admin 拥有该权限点,故"只有管理员可用")。
   */
  @Delete(':id')
  @Permission('certificate:delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.remove(id, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /**
   * 撤销证书 — 软标记 revoked=true,不删数据(审计/公开验证页都还能查到状态)。
   */
  @Patch(':id/revoke')
  @Permission('certificate:revoke')
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeCertificateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.revoke(id, dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /**
   * 外部证书上传(Phase E)— 不绑模板,直接上传 PDF 入库。
   * 编号同样按 batch 规则,source = 'external'。
   */
  @Post('external')
  @Permission('certificate:issue')
  issueExternal(
    @Body() dto: IssueExternalCertificateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.issueExternal(dto, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
  }

  /**
   * AI 提取(Phase D)— 用户上传 Word/PDF 表彰文件 → DeepSeek 提取荣誉信息。
   * 返回结构化 JSON,前端拿来预填发证表单。
   * 返回后不持久化(只写审计 log),用户人工确认编辑后才真正发证。
   */
  @Post('extract')
  @Permission('certificate:issue')
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
   * 批量下载 — body { ids[] } → 后端打 ZIP → 直接以 application/zip 流式返回。
   * 文件名格式 djyy-certificates-YYYYMMDD-HHmm.zip。
   */
  @Post('bulk-download')
  @Permission('certificate:bulk-download')
  @Header('Content-Type', 'application/zip')
  async bulkDownload(
    @Body() dto: BulkDownloadDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buf = await this.svc.bulkDownload(dto.ids, {
      actorId: me.sub,
      actorName: me.name,
      ip: req.ip,
    });
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}` +
      `${String(now.getDate()).padStart(2, '0')}-` +
      `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `djyy-certificates-${stamp}.zip`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buf);
  }
}
