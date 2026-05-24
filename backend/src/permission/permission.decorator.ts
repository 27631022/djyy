import { SetMetadata } from '@nestjs/common';

/** PermissionGuard 读取的元数据 key */
export const PERMISSION_META_KEY = 'djyy:required-permissions';

/**
 * 标注一个 controller / 方法需要哪些权限点。
 * PermissionGuard 会在请求到达时校验当前用户是否拥有(任一即可)。
 *
 * 用法:
 *   @Permission('certificate:issue')
 *   @Post()
 *   issue(...) {}
 *
 *   @Permission('certificate:revoke', 'certificate:bulk-download')
 *   @Patch(...)
 *   ...
 *
 * 不带任何参数 = 仅要求登录(等价于不加,但显式标注更清楚)。
 */
export const Permission = (...codes: string[]) =>
  SetMetadata(PERMISSION_META_KEY, codes);
