import { Module } from '@nestjs/common';
import { DesktopController } from './desktop.controller';
import { DesktopService } from './desktop.service';

/**
 * @module: desktop
 * 桌面客户端发版 / 自动更新(无业务依赖、无人依赖它 → 不影响 DAG)。
 */
@Module({
  controllers: [DesktopController],
  providers: [DesktopService],
})
export class DesktopModule {}
