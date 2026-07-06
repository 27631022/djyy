import { Body, Controller, Get, NotFoundException, Param, Post, StreamableFile } from '@nestjs/common';
import { StorageService } from '../storage';
import { KnowledgeInteractionService } from './knowledge-interaction.service';
import { ViewBeaconDto } from './dto/interaction.dto';

/**
 * 知识分享公开口(**免登录**)—— 「/knowledge 登录可见」原则的受控豁免:
 *   GET /public/knowledge/files/:id  正文图片 / 附件流式
 * 理由:markdown 里 <img> 无法带 Authorization 头(与 /public/avatars 同一硬约束)。
 * 安全:只放行 ownerModule=knowledge 的文件;fileId 是 cuid 不可枚举。
 * (P3 将加 POST view-beacon —— sendBeacon 也带不了 auth 头。)
 */
@Controller('public/knowledge')
export class KnowledgePublicController {
  constructor(
    private readonly storage: StorageService,
    private readonly interaction: KnowledgeInteractionService,
  ) {}

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

  /**
   * 浏览时长回填(**公开**)—— 离开页面时 navigator.sendBeacon 上报,带不了 auth 头故公开。
   * 只允许对已存在的 viewLog(cuid 不可枚举)更新时长、取 max、封顶 4h,攻击面可控。
   */
  @Post('view-beacon')
  viewBeacon(@Body() dto: ViewBeaconDto) {
    return this.interaction.recordDuration(dto.viewLogId, dto.durationSec);
  }
}
