import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { AvatarService } from './avatar.service';
import { AvatarLibraryService } from './avatar-library.service';
import {
  AvatarController,
  AvatarLibraryController,
  PublicAvatarController,
} from './avatar.controller';

/**
 * 头像模块:AI 生成 + 公共头像库(AvatarLibraryItem)。
 * 依赖:storage(存照片/成图/缩略图)+ external-api(选图生图 provider)+ prompt(取头像提示词)+ audit/prisma(全局)。
 * 位于 storage/external-api/prompt 之上、无人依赖 → 不破 DAG。
 */
@Module({
  imports: [StorageModule, ExternalApiModule, PromptModule],
  controllers: [AvatarController, AvatarLibraryController, PublicAvatarController],
  providers: [AvatarService, AvatarLibraryService],
  exports: [AvatarService, AvatarLibraryService],
})
export class AvatarModule {}
