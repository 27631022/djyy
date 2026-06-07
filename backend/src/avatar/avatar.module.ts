import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { AvatarService } from './avatar.service';
import { AvatarController, PublicAvatarController } from './avatar.controller';

/**
 * 头像 AI 生成模块。
 * 依赖:storage(存照片/成图)+ external-api(选图生图 provider)+ prompt(取头像提示词)+ audit/prisma(全局)。
 * 位于 storage/external-api/prompt 之上、无人依赖 → 不破 DAG。
 */
@Module({
  imports: [StorageModule, ExternalApiModule, PromptModule],
  controllers: [AvatarController, PublicAvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarModule {}
