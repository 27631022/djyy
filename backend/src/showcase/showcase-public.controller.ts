import { Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StorageService, type StoredFileMeta } from '../storage';
import { ShowcaseInteractionService } from './showcase-interaction.service';
import { ViewBeaconDto } from './dto/interaction.dto';

/**
 * 先锋晒场公开口(**免登录**)—— 「登录可见」原则的受控豁免:
 *   GET  /public/showcase/files/:id   区块图片 / 视频 / 全景图流式
 *   POST /public/showcase/view-beacon 浏览时长回填
 * 理由:<img>/<video> 无法带 Authorization 头;sendBeacon 也带不了(与 knowledge 同一硬约束)。
 * 安全:只放行 ownerModule=showcase 的文件;fileId/viewLogId 是 cuid 不可枚举;
 * beacon 只能对已存在日志更新、取 max、封顶 4h,攻击面可控。
 * **带 HTTP Range**(照 exhibition-asset.controller 范本)—— 视频拖动进度 / 全景大图分段必需。
 */
@Controller('public/showcase')
export class ShowcasePublicController {
  constructor(
    private readonly storage: StorageService,
    private readonly interaction: ShowcaseInteractionService,
  ) {}

  @Post('view-beacon')
  viewBeacon(@Body() dto: ViewBeaconDto) {
    return this.interaction.recordDuration(dto.viewLogId, dto.durationSec);
  }

  @Get('files/:id')
  async serveFile(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const meta = await this.storage.getMeta(id); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'showcase') {
      throw new NotFoundException('不是先锋晒场文件');
    }
    await this.streamRanged(meta, req, res);
  }

  /**
   * 支持 HTTP Range 的流式下发:无 Range → 200 全量 + Accept-Ranges;
   * 带 Range → 206 + Content-Range,只从磁盘读该区间(不把整个视频读进内存)。
   */
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
