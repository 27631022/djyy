import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { StorageService, type StoredFileMeta } from '../storage';
import { UserService } from '../user';
import { AvatarLibraryService } from '../avatar';
import { InteractiveService } from './interactive.service';
import { RoomSessionService } from './room-session.service';

/** 头像上传约束:图片 mime 白名单 + 3MB 封顶(匿名公开口,min-damage) */
const AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/**
 * 现场互动公开口(**免登录**)—— 大屏/手机是匿名端:
 *   GET /public/interactive/rooms/:code   进场前拿队伍列表 + 各队实时人数(手机团队选择用)
 *   GET /public/interactive/files/:id      背景图 / 背景音乐 流式(大屏 <img>/<audio> 带不了 auth 头)
 * 安全:文件只放行 ownerModule=interactive;fileId 是 cuid 不可枚举(能力 URL)。音乐带 HTTP Range 便于播放器。
 */
@Controller('public/interactive')
export class PublicInteractiveController {
  constructor(
    private readonly rooms: RoomSessionService,
    private readonly storage: StorageService,
    private readonly interactive: InteractiveService,
    private readonly users: UserService,
    private readonly avatarLibrary: AvatarLibraryService,
  ) {}

  /**
   * 进场头像候选:从公共头像库随机抽一批(替代早期 bundle 的 11 个预设卡通头像)。
   * 手机网格显示 thumbFileId 缩略图(256px webp 省流量),选中落库存 "u:<fileId>" 原图
   * (与工牌进场同一标识,头像工坊删除时的在用防护已覆盖)。匿名公开口收敛:
   * 须带有效房间码(活动进行中),条件不满足回空列表不报错(照 employees 口惯例)。
   */
  @Get('avatar-options')
  async avatarOptions(
    @Query('roomCode') roomCodeRaw?: string,
  ): Promise<{ items: { fileId: string; thumbFileId: string | null }[] }> {
    const roomCode = String(roomCodeRaw ?? '')
      .toUpperCase()
      .trim();
    if (!roomCode) return { items: [] };
    const event = await this.interactive.loadRoomByCode(roomCode);
    if (!event || event.status === 'ended') return { items: [] };
    return { items: await this.avatarLibrary.randomForInteractive(12) };
  }

  @Get('rooms/:code')
  roomInfo(@Param('code') code: string) {
    return this.rooms.publicRoomInfo(code);
  }

  /**
   * 工牌进场:输入员工编号或姓名 → 精确匹配在职员工,带出 姓名 + 平台头像(前端存 "u:<fileId>")。
   * 匿名公开口收敛:须带有效房间码(活动进行中)+ 只做精确等值匹配(不模糊,防拉花名册)+
   * 只回 姓名/头像 fileId(不回工号/组织);无命中/条件不满足一律回空列表不报错。
   */
  @Get('employees')
  async employeeLookup(
    @Query('roomCode') roomCodeRaw?: string,
    @Query('q') qRaw?: string,
  ): Promise<{ items: { name: string; avatarFileId: string | null }[] }> {
    const roomCode = String(roomCodeRaw ?? '')
      .toUpperCase()
      .trim();
    const q = String(qRaw ?? '').trim();
    if (!roomCode || q.length < 2) return { items: [] };
    const event = await this.interactive.loadRoomByCode(roomCode);
    if (!event || event.status === 'ended') return { items: [] };
    const rows = await this.users.matchForInteractive(q);
    const items = rows.map((r) => {
      // 只认平台头像 URL(/api/public/avatars/<fileId>);外链/空头像 → 只带姓名
      const m = /^\/api\/public\/avatars\/([a-z0-9]+)$/i.exec(r.avatarUrl ?? '');
      return { name: r.name, avatarFileId: m ? m[1] : null };
    });
    return { items };
  }

  /**
   * 玩家头像上传(匿名公开口)—— 观众无账号,POST /files 走不了(要登录)。
   * 约束:必须带有效房间码(活动存在且未结束)+ 图片 mime 白名单 + ≤3MB;
   * 存 ownerModule='interactive' + folder=event-<id>/avatars;返回 fileId(前端存 "f:<fileId>")。
   * GC:collectInUseFileIds 已扫 InteractivePlayer.avatar,弃用的孤儿走 30 天宽限回收。
   */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<{ fileId: string }> {
    const roomCode = String((req.body as Record<string, unknown>)?.roomCode ?? '').toUpperCase().trim();
    if (!roomCode) throw new BadRequestException('缺少房间码');
    const event = await this.interactive.loadRoomByCode(roomCode);
    if (!event || event.status === 'ended') throw new BadRequestException('房间不存在或活动已结束');
    if (!file?.buffer?.length) throw new BadRequestException('缺少图片文件');
    if (!AVATAR_MIMES.has(file.mimetype)) throw new BadRequestException('仅支持 JPG/PNG/WebP/GIF 图片');
    if (file.size > AVATAR_MAX_BYTES) throw new BadRequestException('头像图片不能超过 3MB');
    // multipart 中文文件名 latin1→utf8(仓库既有坑,照 storage 惯例修正)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const meta = await this.storage.put(
      {
        buffer: file.buffer,
        originalName: originalName || 'avatar.png',
        mimeType: file.mimetype,
        ownerModule: 'interactive',
        folder: `event-${event.id}/avatars`,
        visibility: 'private',
      },
      { actorName: `观众@${roomCode}`, ip: req.ip },
    );
    return { fileId: meta.id };
  }

  @Get('files/:id')
  async serveFile(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const meta = await this.storage.getMeta(id); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'interactive') {
      throw new NotFoundException('不是现场互动文件');
    }
    await this.streamRanged(meta, req, res);
  }

  /** 支持 HTTP Range 的流式下发(照 showcase-public.controller 范本;音频拖动/大图分段必需)。 */
  private async streamRanged(meta: StoredFileMeta, req: Request, res: Response): Promise<void> {
    const total = meta.size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const rangeHeader = req.headers.range;
    if (rangeHeader && total > 0) {
      const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        res.end();
        return;
      }
      const { stream } = await this.storage.getStream(meta.id, { start, end });
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(total));
    const { stream } = await this.storage.getStream(meta.id);
    stream.pipe(res);
  }
}
