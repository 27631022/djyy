import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ALL_ORG_TYPES, ORG_KINDS, OrgKind, OrgType } from './create-organization.dto';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /** 全称 — 证书 / 公文 / 印章等正式场合用,可空 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsIn(ORG_KINDS as unknown as string[])
  kind?: OrgKind;

  @IsOptional()
  @IsIn(ALL_ORG_TYPES as unknown as string[])
  type?: OrgType;

  // 显式传 null 即可解除父节点 (改为根节点)
  @IsOptional()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  /** 部门标记(与层级 type 正交) */
  @IsOptional()
  @IsBoolean()
  isDept?: boolean;

  @IsOptional()
  @IsString()
  meta?: string;
}
