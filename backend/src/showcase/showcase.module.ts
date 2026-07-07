import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { AuditModule } from '../audit';
import { AuthModule } from '../auth';
import { StorageModule } from '../storage';
import { RoleModule } from '../role';
import { ShowcaseService } from './showcase.service';
import { ShowcaseInteractionService } from './showcase-interaction.service';
import { ShowcaseController } from './showcase.controller';
import { ShowcaseInteractionController } from './showcase-interaction.controller';
import { ShowcasePublicController } from './showcase-public.controller';

/**
 * 先锋晒场 —— 擂台型晒实绩平台:晒台(台主发起 + 管理员审核上架)+ 参晒作品(人人投稿 +
 * 台主/管理员审核)+ 台内排位(点赞/申报数值)+ 互动(点赞/吐槽/浏览时长)。
 * exports ShowcaseService 供 MaintenanceModule 聚合孤儿 GC 在用集合。
 */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, StorageModule, RoleModule],
  controllers: [ShowcaseController, ShowcaseInteractionController, ShowcasePublicController],
  providers: [ShowcaseService, ShowcaseInteractionService],
  exports: [ShowcaseService],
})
export class ShowcaseModule {}
