import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization';
import { UserModule } from '../user';
import { RoleModule } from '../role';
import { StorageModule } from '../storage';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportCatalogService } from './report-catalog.service';
import { ReportSubmissionService } from './report-submission.service';
import { ReportInvoiceExtractionService } from './report-invoice-extraction.service';

/**
 * 通用报送平台(report)。「一次发布 · 多次提交」底座,扶贫采买是第一个实例。
 * PrismaModule / AuditModule 全局,无需显式 import。
 * 派发/对口/认领需要组织树 + 用户归属 + 权限范围 → 注入 Organization/User/Role。
 * 发票 AI 识别需要 Storage(取文件) + ExternalApi(选模型) + Prompt(提示词)。
 * 详见 docs/specs/2026-06-16-report-platform.md。
 */
@Module({
  imports: [
    OrganizationModule,
    UserModule,
    RoleModule,
    StorageModule,
    ExternalApiModule,
    PromptModule,
  ],
  controllers: [ReportController],
  providers: [
    ReportService,
    ReportCatalogService,
    ReportSubmissionService,
    ReportInvoiceExtractionService,
  ],
  exports: [ReportService],
})
export class ReportModule {}
