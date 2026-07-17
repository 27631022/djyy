import { Module, type OnModuleInit } from '@nestjs/common';
import { RoleModule } from '../role';
import { StorageModule } from '../storage';
import { DocFormatController } from './doc-format.controller';
import {
  DocFormatInteractionController,
  DocFormatPublicController,
} from './doc-format-interaction.controller';
import { DocFormatInteractionService } from './doc-format-interaction.service';
import { DocFormatService } from './doc-format.service';

/**
 * 公文排版模块。
 * PrismaService / AuditService 走全局模块,无需在此 import;StorageService / RoleService 走 barrel。
 * 依赖:storage(存原件与产物、反馈里的失败样本)、role(判 doc-format:manage)。
 * ⚠ 本模块被 maintenance 依赖(反馈样本要进孤儿 GC 的在用集合),别再让它依赖上层模块。
 */
@Module({
  imports: [StorageModule, RoleModule],
  controllers: [DocFormatController, DocFormatInteractionController, DocFormatPublicController],
  providers: [DocFormatService, DocFormatInteractionService],
  exports: [DocFormatService, DocFormatInteractionService],
})
export class DocFormatModule implements OnModuleInit {
  constructor(private readonly svc: DocFormatService) {}

  /** 内置模板缺哪套补哪套(用户改过的不动)—— 不必整库 reseed 也能拿到新预设 */
  async onModuleInit(): Promise<void> {
    await this.svc.ensureBuiltins();
  }
}
