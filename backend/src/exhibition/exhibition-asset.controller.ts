import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { StorageService, type StoredFileMeta } from '../storage';

/**
 * 1×1 白色 BMP(58 字节,手工构造保证正确)。
 * glb/gltf 引用的外链贴图缺失时兜底返回 —— 模型照常加载,只是该处材质无贴图(素色),
 * 不再因单张贴图 404 导致整模加载失败回落占位。
 */
const WHITE_BMP = Buffer.from([
  0x42, 0x4d, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, // BITMAPFILEHEADER
  40, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 24, 0, // BITMAPINFOHEADER(1×1, 24bpp)
  0, 0, 0, 0, 4, 0, 0, 0, 0x13, 0x0b, 0, 0, 0x13, 0x0b, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0xff, 0xff, 0xff, 0x00, // 白色像素 + 行对齐
]);

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif|ktx2?|basis)$/i;

/** 放行的归属模块:exhibition 素材 + model3d(AI 生成的 .glb,模型库直接上展台用) */
const ALLOWED_MODULES = new Set(['exhibition', 'model3d']);

/**
 * 公开展厅素材口(免登录、持久)—— 3D 客户端直接加载图片 / 视频 / .glb。
 *   GET /public/exhibition/assets/:id            → 流式素材
 *   GET /public/exhibition/assets/:id/rel/*      → 解析「:id 同文件夹下名为 * 的兄弟文件」
 * 兄弟口给 glb/gltf 的外链资源用:客户端以 …/:id/rel/ 为 rootUrl 加载模型,模型 JSON 里
 * 相对 uri(贴图/bin)就会落到本路由,按 同folder+原始文件名 找配套上传的散文件;
 * `__self__` 表示主文件本身;缺失的图片类资源回 1×1 白图兜底(模型不至于整体加载失败)。
 * 安全:只放行 storage 里 ownerModule=exhibition 的文件(照 PublicModel3dController 范本)。
 * dev 下客户端经 vite proxy 同源访问;生产经同域反代。
 */
@Controller('public/exhibition/assets')
export class ExhibitionAssetController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  async serve(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const meta = await this.storage.getMeta(id);
    if (!ALLOWED_MODULES.has(meta.ownerModule)) {
      throw new NotFoundException('不是展厅素材文件');
    }
    await this.streamRanged(meta, req, res);
  }

  /**
   * 支持 HTTP Range 的流式下发(关键:视频拖动进度/截帧、大文件断点都靠它)。
   * 无 Range → 200 全量 + Accept-Ranges:bytes(告知可分段);带 Range → 206 + Content-Range,
   * 只从磁盘读该区间(不把整个视频读进内存)。手动 pipe(@Res)以完全掌控状态码与响应头。
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

  @Get(':id/rel/*')
  async serveRelative(
    @Param('id') id: string,
    @Param('0') relPath: string,
  ): Promise<StreamableFile> {
    const main = await this.storage.getMeta(id);
    if (!ALLOWED_MODULES.has(main.ownerModule)) {
      throw new NotFoundException('不是展厅素材文件');
    }
    if (relPath === '__self__') return this.streamOf(main);

    // 取末段文件名匹配(glb uri 可能带子目录如 textures/foo.jpg,配套上传时已拍平);
    // 兄弟文件在主文件自己的 模块+文件夹 里找
    const name = relPath.split('/').pop() ?? relPath;
    const sibling = main.folder
      ? await this.storage.findByName(main.ownerModule, main.folder, name)
      : null;
    if (sibling) return this.streamOf(sibling);

    if (IMAGE_EXT.test(name)) {
      return new StreamableFile(WHITE_BMP, { type: 'image/bmp', length: WHITE_BMP.length });
    }
    throw new NotFoundException(`同文件夹未找到配套文件:${name}`);
  }

  private async streamOf(meta: StoredFileMeta): Promise<StreamableFile> {
    const { stream } = await this.storage.getStream(meta.id);
    return new StreamableFile(stream as Readable, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }
}
