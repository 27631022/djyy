import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, CurrentUser, type AuthPayload } from '../auth';
import { Permission } from '../permission';
import { StorageService } from '../storage';
import { AvatarService } from './avatar.service';
import { AvatarLibraryService } from './avatar-library.service';
import { GenerateAvatarDto } from './dto/generate-avatar.dto';
import { AddLibraryItemDto, UpdateLibraryItemDto } from './dto/avatar-library.dto';

/**
 * 头像 AI 生成(鉴权)。
 *   POST /avatars/generate  仅登录  { photoFileId, prompt? } → 生成 → 返回预览 { fileId, url }
 * 不直接改用户头像 —— 前端预览确认后再走 users.update 设 avatarUrl。
 */
@Controller('avatars')
@UseGuards(AuthGuard)
export class AvatarController {
  constructor(private readonly svc: AvatarService) {}

  @Post('generate')
  async generate(
    @Body() dto: GenerateAvatarDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.generate(
      dto.photoFileId,
      { actorId: me.sub, actorName: me.name, ip: req.ip },
      { prompt: dto.prompt, targetName: dto.targetName, employeeNumber: dto.employeeNumber },
    );
  }

  /** 某用户的历史 AI 头像(供「从历史头像库挑选」)。 */
  @Get('history')
  async history(
    @Query('name') name?: string,
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    return this.svc.listHistory({ name, employeeNumber });
  }
}

/**
 * 公共头像库(全平台共享)。
 *   GET    /avatars/library        仅登录(个人设置挑头像等消费场景也要看)
 *   POST   /avatars/library        avatar:manage  { fileId, name?, gender? } —— 文件先经 storage 上传拿 fileId
 *   PATCH  /avatars/library/:id    avatar:manage  { name?, gender? }
 *   DELETE /avatars/library/:id    avatar:manage  联动软删原图+缩略图
 */
@Controller('avatars/library')
@UseGuards(AuthGuard)
export class AvatarLibraryController {
  constructor(private readonly svc: AvatarLibraryService) {}

  @Get()
  list(@Query('q') q?: string, @Query('gender') gender?: string) {
    return this.svc.list({ q, gender });
  }

  /** 详情(含 configJson)—— 头像编辑器「回灌再编辑」取配置。 */
  @Get(':id')
  @Permission('avatar:manage')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @Permission('avatar:manage')
  add(@Body() dto: AddLibraryItemDto, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.add(dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Patch(':id')
  @Permission('avatar:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryItemDto,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.update(id, dto, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }

  @Delete(':id')
  @Permission('avatar:manage')
  remove(@Param('id') id: string, @CurrentUser() me: AuthPayload, @Req() req: Request) {
    return this.svc.remove(id, { actorId: me.sub, actorName: me.name, ip: req.ip });
  }
}

/**
 * 公开头像口(**免登录、持久**)—— 头像本就是公开展示资源(列表/挂件/前台都要 <img> 直显)。
 *   GET /public/avatars/:id → 流式头像图片
 * 安全:只放行 storage 里 ownerModule=user 且文件夹含 avatars 的图片,不当通用公开下载口用(降攻击面)。
 */
@Controller('public/avatars')
export class PublicAvatarController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  async serve(@Param('id') id: string): Promise<StreamableFile> {
    const meta = await this.storage.getMeta(id); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'user' || !(meta.folder ?? '').includes('avatars')) {
      throw new NotFoundException('不是头像文件');
    }
    const { stream } = await this.storage.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }
}
