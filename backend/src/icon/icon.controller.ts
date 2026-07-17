import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { IconService } from './icon.service';

interface UploadedFileShape {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** multipart 文件名 multer 按 latin1 解,中文会乱码 → 转回 utf8 */
function decodeName(name: string): string {
  if (!name) return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

/**
 * 中央图标库管理(自定义上传)—— 收口 admin:menu(与前端「图标库」菜单一致)。
 * ⚠ 此前仅 AuthGuard:任何登录用户可上传/删除站点图标,已堵。
 * 公开取字节走 IconPublicController(/public/icons/:id,供 <img> 在任意页面/公开首页渲染,不受此门影响)。
 */
@Controller('icons')
@UseGuards(AuthGuard)
@Permission('admin:menu')
export class IconController {
  constructor(private readonly svc: IconService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: UploadedFileShape,
    @Body('name') name: string,
    @CurrentUser() me: AuthPayload,
    @Req() req: Request,
  ) {
    return this.svc.create(
      {
        name: (name && name.trim()) || decodeName(file?.originalname ?? ''),
        mimeType: file?.mimetype,
        buffer: file?.buffer,
      },
      { actorId: me.sub, actorName: me.name, ip: req.ip },
    );
  }

  @Delete(':id')
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
}

/** 公开取图标字节 —— 给 <img src="/api/public/icons/:id"> 用(任意页面 / 公开首页) */
@Controller('public/icons')
export class IconPublicController {
  constructor(private readonly svc: IconService) {}

  @Get(':id')
  async raw(@Param('id') id: string, @Res() res: Response) {
    const { mimeType, buffer } = await this.svc.getRaw(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 即使有人直接打开 URL(尤其 SVG),也禁脚本/外链,杜绝上传型 XSS
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.send(buffer);
  }
}
