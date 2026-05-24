import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { CertificateIssueController } from './issue.controller';
import { CertificateIssueService } from './issue.service';
import { CertificateExtractionService } from './extraction.service';
import { CertificatePublicVerifyController } from './public-verify.controller';

@Module({
  controllers: [
    CertificateController,
    CertificateIssueController,
    CertificatePublicVerifyController,
  ],
  providers: [
    CertificateService,
    CertificateIssueService,
    CertificateExtractionService,
  ],
  exports: [CertificateService, CertificateIssueService],
})
export class CertificateModule {}
