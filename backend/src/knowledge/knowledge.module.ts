import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth';
import { StorageModule } from '../storage';
import { RoleModule } from '../role';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeImportService } from './knowledge-import.service';
import { KnowledgeInteractionService } from './knowledge-interaction.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgePublicController } from './knowledge-public.controller';
import { KnowledgeImportController } from './knowledge-import.controller';
import { KnowledgeInteractionController } from './knowledge-interaction.controller';

/**
 * 知识分享平台。P2 存量 md 批量导入 + P3 互动统计(knowledge-interaction.*)已加;
 * P4 加 AI(knowledge-ai.service + ExternalApi/Prompt),P5 imports PointsModule 埋积分事件。
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, StorageModule, RoleModule],
  controllers: [
    KnowledgeController,
    KnowledgePublicController,
    KnowledgeImportController,
    KnowledgeInteractionController,
  ],
  providers: [KnowledgeService, KnowledgeImportService, KnowledgeInteractionService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
