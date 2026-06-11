import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionAiService } from './exhibition-ai.service';
import {
  ConnectorController,
  ExhibitionController,
} from './exhibition.controller';
import { ExhibitionAssetController } from './exhibition-asset.controller';
import { ExhibitionFontController } from './exhibition-font.controller';
import { ExhibitionFontService } from './exhibition-font.service';

/**
 * 企业虚拟展厅模块。
 * imports StorageModule:公开素材口注入 StorageService 流式素材字节;
 * ExternalApiModule + PromptModule:AI 生成展厅(ExhibitionAiService)。
 * 字体子集口(text_3d 中文立体字)见 ExhibitionFontService。
 * (P5 连接器再 import CertificateModule / TaskModule 走 barrel DI 取真数据。)
 */
@Module({
  imports: [StorageModule, ExternalApiModule, PromptModule],
  controllers: [
    ExhibitionController,
    ConnectorController,
    ExhibitionAssetController,
    ExhibitionFontController,
  ],
  providers: [ExhibitionService, ExhibitionFontService, ExhibitionAiService],
  exports: [ExhibitionService],
})
export class ExhibitionModule {}
