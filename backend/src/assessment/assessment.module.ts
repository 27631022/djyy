import { Module } from '@nestjs/common';
import { RoleModule } from '../role';
import { UserModule } from '../user';
import { OrganizationModule } from '../organization';
import { ExternalApiModule } from '../external-api';
import { PromptModule } from '../prompt';
import { ReportModule } from '../report';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentExtractionService } from './assessment-extraction.service';

/**
 * 考核系统(通用考核平台)。
 * P1:考核表(AssessmentScheme)CRUD + 指标树/计分工具/数据源注册表 + 考核关系/区域收敛 + AI 生成指标。
 * PrismaService / AuditService 均 @Global,无需 imports。
 * RoleModule(我的考核区域 scope)、UserModule(membership)、OrganizationModule(组织树/成员/关联);
 * ExternalApiModule + PromptModule(AI 生成指标:模型路由 + 提示词)。
 * P2 起再注入 TaskModule/CertificateModule(业务数据源)。
 */
@Module({
  imports: [RoleModule, UserModule, OrganizationModule, ExternalApiModule, PromptModule, ReportModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, AssessmentExtractionService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
