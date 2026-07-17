import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { UserModule } from '../user';
import { RoleModule } from '../role';
import { AvatarService } from './avatar.service';
import { AvatarLibraryService } from './avatar-library.service';
import {
  AvatarController,
  AvatarLibraryController,
  PublicAvatarController,
} from './avatar.controller';

/**
 * 头像模块:AI 生成 + 公共头像库(AvatarLibraryItem)。
 * 依赖:storage(存照片/成图/缩略图)+ external-api(选图生图 provider)+ prompt(取头像提示词)
 *   + user(applyDefaults 批量兜底无头像用户)+ role(history 判 avatar:manage 收敛越权)+ audit/prisma(全局)。
 * avatar→user、avatar→role 均单向(user/role 不依赖 avatar),不破 DAG。
 */
@Module({
  imports: [StorageModule, ExternalApiModule, PromptModule, UserModule, RoleModule],
  controllers: [AvatarController, AvatarLibraryController, PublicAvatarController],
  providers: [AvatarService, AvatarLibraryService],
  exports: [AvatarService, AvatarLibraryService],
})
export class AvatarModule {}
