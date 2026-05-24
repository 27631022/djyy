import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { CertificateIssueController } from './issue.controller';
import { CertificateIssueService } from './issue.service';

@Module({
  controllers: [CertificateController, CertificateIssueController],
  providers: [CertificateService, CertificateIssueService],
  exports: [CertificateService, CertificateIssueService],
})
export class CertificateModule {}
