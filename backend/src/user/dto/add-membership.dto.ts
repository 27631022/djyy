import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 给某用户新增「单条」组织归属 —— 组织管理页「点机构 → 加成员」用。
 * 与 ReplaceMembershipsDto(整体替换)不同,这里只追加一条,不动用户其它归属。
 * 业务规则在 service 里兜:同组织不可重复、党组织最多 1 个、首条同类自动设主。
 */
export class AddMembershipDto {
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
