import { Module, type OnModuleInit } from '@nestjs/common';
import { StorageModule } from '../storage';
import { DocFormatController } from './doc-format.controller';
import { DocFormatService } from './doc-format.service';

/**
 * 公文排版模块。
 * PrismaService / AuditService 走全局模块,无需在此 import;StorageService 要走 barrel import。
 * 依赖:storage(存原件与产物)。无人依赖本模块 → 不破 DAG。
 */
@Module({
  imports: [StorageModule],
  controllers: [DocFormatController],
  providers: [DocFormatService],
  exports: [DocFormatService],
})
export class DocFormatModule implements OnModuleInit {
  constructor(private readonly svc: DocFormatService) {}

  /** 内置模板缺哪套补哪套(用户改过的不动)—— 不必整库 reseed 也能拿到新预设 */
  async onModuleInit(): Promise<void> {
    await this.svc.ensureBuiltins();
  }
}
