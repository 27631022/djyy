import { Module } from '@nestjs/common';
import { PromptService } from './prompt.service';
import { PromptController } from './prompt.controller';

/**
 * AI 提示词集中管理模块。
 * PrismaService / AuditService 走全局模块,无需在此 import。
 * 叶子依赖(只依赖全局)→ 业务模块(avatar/task/certificate)import 本模块取 PromptService,不破 DAG。
 */
@Module({
  controllers: [PromptController],
  providers: [PromptService],
  exports: [PromptService],
})
export class PromptModule {}
