import { Controller, Get, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { StorageService } from '../storage';

/**
 * 知识分享公开口(**免登录**)—— 「/knowledge 登录可见」原则的受控豁免:
 *   GET /public/knowledge/files/:id  正文图片 / 附件流式
 * 理由:markdown 里 <img> 无法带 Authorization 头(与 /public/avatars 同一硬约束)。
 * 安全:只放行 ownerModule=knowledge 的文件;fileId 是 cuid 不可枚举。
 * (P3 将加 POST view-beacon —— sendBeacon 也带不了 auth 头。)
 */
@Controller('public/knowledge')
export class KnowledgePublicController {
  constructor(private readonly storage: StorageService) {}

  @Get('files/:id')
  async serveFile(@Param('id') id: string): Promise<StreamableFile> {
    const meta = await this.storage.getMeta(id); // 不存在/软删 → NotFound
    if (meta.ownerModule !== 'knowledge') {
      throw new NotFoundException('不是知识库文件');
    }
    const { stream } = await this.storage.getStream(id);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
      length: meta.size,
    });
  }
}
