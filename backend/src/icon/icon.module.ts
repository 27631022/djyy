import { Global, Module } from '@nestjs/common';
import { IconController, IconPublicController } from './icon.controller';
import { IconService } from './icon.service';

/**
 * @Global() 让其它模块(如需在后端渲染/校验图标)可直接 inject IconService。
 * 当前主要由前端消费(列表 + 公开取字节)。
 */
@Global()
@Module({
  controllers: [IconController, IconPublicController],
  providers: [IconService],
  exports: [IconService],
})
export class IconModule {}
