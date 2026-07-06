import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization';
import { UserModule } from '../user';
import { RoleModule } from '../role';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

/**
 * 批量导入模块(组织机构 + 用户 Excel 导入)。
 * 位于 organization / user / role 之上,只经它们的 Service 走 DI,不直连别人的表(守 DAG + 表归属)。
 */
@Module({
  imports: [OrganizationModule, UserModule, RoleModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
