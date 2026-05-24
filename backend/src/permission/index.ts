// 注意:Module 导出必须放最后(barrel 加载顺序约定,详见 auth/index.ts)。
export { PermissionService } from './permission.service';
export { Permission, PERMISSION_META_KEY } from './permission.decorator';
export { PermissionGuard } from './permission.guard';
export { PermissionModule } from './permission.module';
