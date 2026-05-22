import { Module } from '@nestjs/common';
import { SiteSettingService } from './site-setting.service';
import { SiteSettingController } from './site-setting.controller';

@Module({
  controllers: [SiteSettingController],
  providers: [SiteSettingService],
  exports: [SiteSettingService],
})
export class SiteSettingModule {}
