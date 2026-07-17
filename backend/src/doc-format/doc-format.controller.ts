import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { DocFormatService } from './doc-format.service';
import { RenderDto, SaveTemplateDto } from './dto/doc-format.dto';

interface UploadedDoc {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * 解析前的大小闸。storage.put 的 30MB 闸在**解析之后**才生效(实测 44MB 文件先白解析 912ms),
 * 而解析是同步阻塞事件循环的。公文再大也就几 MB,这里先拦一道(照 certificate/task 的先例)。
 */
const UPLOAD_MAX_BYTES = 30 * 1024 * 1024;

/** multipart 中文文件名 latin1→utf8 还原(与 storage.controller / knowledge-import 同款修复) */
function decodeName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

/**
 * 公文排版。
 *   排版三口(登录即可用 —— 这是给写公文的人用的前台工具,不该要管理权限):
 *     POST /doc-format/analyze   multipart .doc/.docx → 结构识别 + 孤字提醒 + 预览
 *     POST /doc-format/preview   改了段落类型或换了模板 → 重算(服务端权威,前端不镜像算法)
 *     POST /doc-format/render    生成排好版的 .docx → 走 storage 下载口取回
 *   模板配置(doc-format:manage)
 */
@Controller('doc-format')
@UseGuards(AuthGuard)
export class DocFormatController {
  constructor(private readonly svc: DocFormatService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  analyze(
    @UploadedFile() file: UploadedDoc | undefined,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    if (file.size > UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `文件过大(${(file.size / 1024 / 1024).toFixed(1)}MB),公文最大 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    return this.svc.analyze(
      { ...file, originalname: decodeName(file.originalname) },
      this.ctx(me, req),
    );
  }

  @Post('preview')
  preview(@Body() dto: RenderDto) {
    return this.svc.preview(dto.fileId, dto.templateId, dto.overrides);
  }

  @Post('render')
  render(@Body() dto: RenderDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.render(dto.fileId, dto.templateId, dto.overrides, this.ctx(me, req));
  }

  // --------------------------------------------------------- 模板

  /** 排版时要选模板,所以列表登录即可读;改动才要 doc-format:manage */
  @Get('templates')
  listTemplates() {
    return this.svc.listTemplates();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.svc.getTemplate(id);
  }

  @Permission('doc-format:manage')
  @Post('templates')
  createTemplate(@Body() dto: SaveTemplateDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createTemplate(dto, this.ctx(me, req));
  }

  @Permission('doc-format:manage')
  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: SaveTemplateDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateTemplate(id, dto, this.ctx(me, req));
  }

  @Permission('doc-format:manage')
  @Post('templates/:id/duplicate')
  duplicateTemplate(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.duplicateTemplate(id, this.ctx(me, req));
  }

  @Permission('doc-format:manage')
  @Post('templates/:id/reset')
  resetTemplate(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.resetTemplate(id, this.ctx(me, req));
  }

  @Permission('doc-format:manage')
  @Delete('templates/:id')
  removeTemplate(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.removeTemplate(id, this.ctx(me, req));
  }
}
