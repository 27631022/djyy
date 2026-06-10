import {
  Controller,
  Get,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { StorageService } from '../storage';

/**
 * 公开展厅素材口(免登录、持久)—— 3D 客户端直接加载图片 / 视频 / .glb。
 *   GET /public/exhibition/assets/:id → 流式素材
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
    const { stream } = await this.storage.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }
}
