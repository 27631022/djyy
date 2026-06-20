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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import {
  type AssetCategory,
  ExhibitionLibraryService,
} from './exhibition-library.service';
import { CreateGuidePresetDto, RenameGuidePresetDto } from './dto/guide-preset.dto';
import { UpdateAssetDto } from './dto/asset-library.dto';

/**
 * 展厅素材中心。
 *  讲解员形象包(整套立绘/3D + 音色 + 肩点,可复用到任意厅):
 *    GET    /exhibition/guide-presets        列表(已解析,可预览)
 *    POST   /exhibition/guide-presets        存为形象包 { name, config }
 *    PATCH  /exhibition/guide-presets/:id     改名 { name }
 *    DELETE /exhibition/guide-presets/:id     删除
 *  文件型素材(音色 / 墙面贴图 / 墙面装饰):
 *    GET    /exhibition/asset-library?category=voice|wall-texture|wall-decor   列表
 *    PATCH  /exhibition/asset-library/:fileId?category=...                     改名 / 标签
 *  上传走通用 POST /files(ownerModule=exhibition, folder=library-<分类>),删除走 DELETE /files/:id。
 */
@Controller('exhibition')
@UseGuards(AuthGuard)
export class ExhibitionLibraryController {
  constructor(private readonly svc: ExhibitionLibraryService) {}

  private ctx(me: AuthPayload, req: Request) {
    return { actorId: me.sub, actorName: me.name, ip: req.ip };
  }

  /* ── 讲解员形象包 ── */
  @Get('guide-presets')
  @Permission('exhibition:manage')
  listPresets() {
    return this.svc.listPresets();
  }

  @Post('guide-presets')
  @Permission('exhibition:manage')
  createPreset(@Body() dto: CreateGuidePresetDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.createPreset(dto.name, dto.config, this.ctx(me, req));
  }

  @Patch('guide-presets/:id')
  @Permission('exhibition:manage')
  renamePreset(
    @Param('id') id: string,
    @Body() dto: RenameGuidePresetDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.renamePreset(id, dto.name, this.ctx(me, req));
  }

  @Delete('guide-presets/:id')
  @Permission('exhibition:manage')
  deletePreset(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.deletePreset(id, this.ctx(me, req));
  }

  /* ── 文件型素材库 ── */
  @Get('asset-library')
  @Permission('exhibition:manage')
  listFiles(@Query('category') category: AssetCategory) {
    return this.svc.listFiles(category);
  }

  @Patch('asset-library/:fileId')
  @Permission('exhibition:manage')
  updateFile(
    @Param('fileId') fileId: string,
    @Query('category') category: AssetCategory,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.updateFile(category, fileId, dto, this.ctx(me, req));
  }
}
