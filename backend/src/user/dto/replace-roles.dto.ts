import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export const SCOPE_VALUES = ['self', 'own', 'subtree', 'all', 'custom'] as const;
export type ScopeValue = (typeof SCOPE_VALUES)[number];

export class RoleAssignmentDto {
  @IsString()
  roleId!: string;

  @IsIn(SCOPE_VALUES as unknown as string[])
  scope!: ScopeValue;

  /**
   * 数据范围 custom 时,允许多棵子树并集。scope 非 custom 时此字段必须为空 / 省略。
   * 重复的 orgId 会在服务层去重。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  scopeOrgIds?: string[];
}

export class ReplaceRolesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles!: RoleAssignmentDto[];
}
