import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

/** 角色数据范围取值(与 user/dto 的 SCOPE_VALUES 同集合;role 模块内自持一份避免跨模块耦合) */
export const ROLE_SCOPE_VALUES = ['self', 'own', 'subtree', 'all', 'custom'] as const;
export type RoleScopeValue = (typeof ROLE_SCOPE_VALUES)[number];

/** 在「角色与权限」页给某角色直接添加/更新一名成员(= 给该用户授此角色 + 配数据范围)。 */
export class AssignRoleUserDto {
  @IsString()
  userId!: string;

  @IsIn(ROLE_SCOPE_VALUES as unknown as string[])
  scope!: RoleScopeValue;

  /** scope=custom 时的锚点组织(行政或党组织,取并集);其它 scope 须为空 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeOrgIds?: string[];
}
