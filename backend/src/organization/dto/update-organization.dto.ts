import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ALL_ORG_TYPES, ORG_KINDS, OrgKind, OrgType } from './create-organization.dto';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

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

  @IsOptional()
  @IsString()
  meta?: string;
}
