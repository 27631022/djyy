import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * 公开文件下载(签名 URL)—— 不挂 AuthGuard。
 *
 * 浏览器原生下载用:authed 侧调 `GET /files/:id/download-url` 拿到带 `?exp&sig` 的短时效 URL,
 * 再用 `<a download>` / window.open 命中本接口 —— 浏览器边下边写盘,不经 axios 内存 Blob,
 * 大文件 / 批量 / 弱网都稳。签名(HMAC+exp)防猜测、限时失效。
 */
@Controller('public/files')
export class StoragePublicController {
  constructor(private readonly svc: StorageService) {}

  @Get(':id')
  async download(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
  ): Promise<StreamableFile> {
    if (!this.svc.verifyFileSig(id, Number(exp), sig)) {
      throw new ForbiddenException('下载链接无效或已过期');
    }
    const { meta, stream } = await this.svc.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
    });
  }
}
