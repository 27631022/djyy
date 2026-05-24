import { Global, Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';

/**
 * @Global() 让其它模块(certificate.extraction、未来短信/邮件等)
 * 直接 inject ExternalApiService,不必再 import ExternalApiModule。
 */
@Global()
@Module({
  controllers: [ExternalApiController],
  providers: [ExternalApiService],
  exports: [ExternalApiService],
})
export class ExternalApiModule {}
