import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import {
  ExhibitionModelLibraryService,
  type LibraryModelItem,
} from './exhibition-model-library.service';
import { UpdateModelLibraryDto } from './dto/update-model-library.dto';

/**
 * 模型库:统一管理可上展台的 3D 模型(上传 + AI 生成两源)。
 *  GET   /exhibition/model-library          列表(含标签/缩略图)
 *  PATCH /exhibition/model-library/:fileId  改名 / 打标签
 * 上传走通用 POST /files(ownerModule=exhibition, folder=model-library),删除走 DELETE /files/:id。
 */
@Controller('exhibition/model-library')
@UseGuards(AuthGuard)
export class ExhibitionModelLibraryController {
  constructor(private readonly svc: ExhibitionModelLibraryService) {}

  @Get()
  @Permission('exhibition:manage')
  list(): Promise<LibraryModelItem[]> {
    return this.svc.list();
  }

  @Patch(':fileId')
  @Permission('exhibition:manage')
  update(
    @Param('fileId') fileId: string,
    @Body() dto: UpdateModelLibraryDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(fileId, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}
