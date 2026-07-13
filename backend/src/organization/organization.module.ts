import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrgScopeService } from './org-scope.service';
import { RoleModule } from '../role';

@Module({
  imports: [RoleModule], // OrgScopeService 解析 UserRole.scope 数据范围
  controllers: [OrganizationController],
  providers: [OrganizationService, OrgScopeService],
  exports: [OrganizationService, OrgScopeService],
})
export class OrganizationModule {}
