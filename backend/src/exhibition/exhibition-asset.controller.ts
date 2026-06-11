import {
  Controller,
  Get,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
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
  async serve(@Param('id') id: string): Promise<StreamableFile> {
    const meta = await this.storage.getMeta(id);
    if (meta.ownerModule !== 'exhibition') {
      throw new NotFoundException('不是展厅素材文件');
    }
    return this.streamOf(meta);
  }

  @Get(':id/rel/*')
  async serveRelative(
    @Param('id') id: string,
    @Param('0') relPath: string,
  ): Promise<StreamableFile> {
    const main = await this.storage.getMeta(id);
    if (main.ownerModule !== 'exhibition') {
      throw new NotFoundException('不是展厅素材文件');
    }
    if (relPath === '__self__') return this.streamOf(main);

    // 取末段文件名匹配(glb uri 可能带子目录如 textures/foo.jpg,配套上传时已拍平)
    const name = relPath.split('/').pop() ?? relPath;
    const sibling = main.folder
      ? await this.storage.findByName('exhibition', main.folder, name)
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
