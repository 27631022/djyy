// 注意:Module 导出必须放最后(barrel 加载顺序约定,详见 auth/index.ts)。
export { OrganizationService } from './organization.service';
export { OrgScopeService } from './org-scope.service';
export type { UserReadScope, OrgWriteScope, MembersAccess } from './org-scope.service';
export { OrganizationModule } from './organization.module';
