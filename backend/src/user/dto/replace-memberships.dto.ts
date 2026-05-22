import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class MembershipEntryDto {
  @IsString()
  orgId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  position?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/**
 * 整体替换用户的归属列表。后端会对比当前数据,delete 旧的、create 新的、update 差异。
 * 业务规则:
 *   - admin 类型允许多归属,可有多个 isPrimary=true (每种 kind 内)
 *   - party 类型最多 1 个归属
 *   - 每个 kind 内 isPrimary=true 最多 1 个
 */
export class ReplaceMembershipsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MembershipEntryDto)
  memberships!: MembershipEntryDto[];
}
