import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth';
import { StorageModule } from '../storage';
import { RoleModule } from '../role';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeImportService } from './knowledge-import.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgePublicController } from './knowledge-public.controller';
import { KnowledgeImportController } from './knowledge-import.controller';

/**
 * 知识分享平台。P2 存量 md 批量导入(knowledge-import.*)已加;P3 加互动
 * (knowledge-interaction.*),P4 加 AI(knowledge-ai.service + ExternalApi/Prompt),
 * P5 imports PointsModule 埋积分事件。
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, StorageModule, RoleModule],
  controllers: [KnowledgeController, KnowledgePublicController, KnowledgeImportController],
  providers: [KnowledgeService, KnowledgeImportService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
