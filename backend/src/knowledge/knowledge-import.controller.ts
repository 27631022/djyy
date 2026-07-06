import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { KnowledgeImportService } from './knowledge-import.service';
import { ImportExecuteDto } from './dto/import-execute.dto';

interface UploadedZip {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** multipart 中文文件名 latin1→utf8 还原(与 storage.controller 同款修复) */
function decodeName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

/**
 * 知识库存量 MD 批量导入(knowledge:manage)。
 *   POST /knowledge/import/analyze  multipart zip → 预览(标题/分类建议/图片/去重)
 *   POST /knowledge/import/execute  按核对后的映射逐篇入库
 */
@Controller('knowledge/import')
@UseGuards(AuthGuard)
export class KnowledgeImportController {
  constructor(private readonly svc: KnowledgeImportService) {}

  @Permission('knowledge:manage')
  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  analyze(@UploadedFile() file: UploadedZip | undefined, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.svc.analyze(
      { ...file, originalname: decodeName(file.originalname) },
      { actorId: me.sub, actorName: me.name, ip: req.ip },
    );
  }

  @Permission('knowledge:manage')
  @Post('execute')
  execute(@Body() dto: ImportExecuteDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.execute(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
