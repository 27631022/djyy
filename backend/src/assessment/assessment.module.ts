import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';

/**
 * 考核系统(通用考核平台)。
 * P1:考核体系(AssessmentScheme)CRUD + 指标树/计分工具/数据源注册表(纯逻辑)。
 * PrismaService / AuditService 均 @Global,无需 imports。
 * P2 起注入 OrganizationModule(党委→行政单位关联解析)、TaskModule/CertificateModule(业务数据源)。
 */
@Module({
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
