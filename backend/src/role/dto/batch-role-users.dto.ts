import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ROLE_SCOPE_VALUES, type RoleScopeValue } from './assign-role-user.dto';

/** 批量成员操作上限 —— 与 GET /users/ids 的上限同值(超出让管理员先收窄筛选条件) */
export const ROLE_BATCH_MAX_USERS = 5000;

/**
 * 「角色与权限」页批量添加成员:一批用户统一授此角色 + 同一数据范围。
 * 幂等:已持有该角色的成员 = 覆盖更新其数据范围(与单个 addUser 同语义)。
 */
export class BatchAssignRoleUsersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ROLE_BATCH_MAX_USERS)
  @IsString({ each: true })
  userIds!: string[];

  @IsIn(ROLE_SCOPE_VALUES as unknown as string[])
  scope!: RoleScopeValue;

  /** scope=custom 时的锚点组织(全批共用同一组锚点);其它 scope 须为空。
   *  50 上限对齐 replace-roles.dto —— 不封顶时 5000 人 × 数百锚点的事务会撞 Prisma 5s 超时(P2028) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  scopeOrgIds?: string[];
}

/** 批量移除成员(幂等:未持有此角色的 id 自动忽略)。 */
export class BatchRemoveRoleUsersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(ROLE_BATCH_MAX_USERS)
  @IsString({ each: true })
  userIds!: string[];
}
