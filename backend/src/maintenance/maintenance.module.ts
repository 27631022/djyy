import { Module } from '@nestjs/common';
import { StorageModule } from '../storage';
import { CertificateModule } from '../certificate';
import { TaskModule } from '../task';
import { RoleModule } from '../role';
import { ExhibitionModule } from '../exhibition';
import { ReportModule } from '../report';
import { KnowledgeModule } from '../knowledge';
import { ShowcaseModule } from '../showcase';
import { InteractiveModule } from '../interactive';
import { AvatarModule } from '../avatar';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * 运维维护 —— 位于 storage / certificate / task / exhibition / report / knowledge / showcase / interactive / avatar 之上(聚合它们的「在用 fileId」做孤儿 GC)。
 * 无人依赖本模块 → 依赖图仍是 DAG(GC 编排放这里,避免 storage→cert/task 成环)。
 */
@Module({
  imports: [StorageModule, CertificateModule, TaskModule, RoleModule, ExhibitionModule, ReportModule, KnowledgeModule, ShowcaseModule, InteractiveModule, AvatarModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
