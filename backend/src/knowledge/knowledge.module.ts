import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth';
import { StorageModule } from '../storage';
import { RoleModule } from '../role';
import { UserModule } from '../user';
import { PromptModule } from '../prompt';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeImportService } from './knowledge-import.service';
import { KnowledgeInteractionService } from './knowledge-interaction.service';
import { KnowledgeAiService } from './knowledge-ai.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgePublicController } from './knowledge-public.controller';
import { KnowledgeImportController } from './knowledge-import.controller';
import { KnowledgeInteractionController } from './knowledge-interaction.controller';
import { KnowledgeAiController } from './knowledge-ai.controller';

/**
 * 知识分享平台。P2 导入 + P3 互动统计 + P4 AI(knowledge-ai.*,LLM 走 external-api 的 @Global
 * LlmClientService,提示词走 PromptModule)已加;P5 imports PointsModule 埋积分事件。
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, StorageModule, RoleModule, UserModule, PromptModule],
  controllers: [
    KnowledgeController,
    KnowledgePublicController,
    KnowledgeImportController,
    KnowledgeInteractionController,
    KnowledgeAiController,
  ],
  providers: [KnowledgeService, KnowledgeImportService, KnowledgeInteractionService, KnowledgeAiService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
