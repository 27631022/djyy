import { Global, Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';
import { LlmClientService } from './llm-client.service';

/**
 * @Global() 让其它模块(certificate.extraction、knowledge.ai、未来短信/邮件等)
 * 直接 inject ExternalApiService / LlmClientService,不必再 import ExternalApiModule。
 */
@Global()
@Module({
  controllers: [ExternalApiController],
  providers: [ExternalApiService, LlmClientService],
  exports: [ExternalApiService, LlmClientService],
})
export class ExternalApiModule {}
