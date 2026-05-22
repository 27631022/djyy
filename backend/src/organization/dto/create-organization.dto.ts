import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ORG_KINDS = ['party', 'admin'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

// 党组织内部类型
//   committee   党委
//   general     党总支
//   branch      党支部
//   temp_branch 临时党支部 (党员突击队 / 党员服务队 / 党建专班 / 学习专班等典型形态)
//   group       党小组
export const PARTY_TYPES = ['committee', 'general', 'branch', 'temp_branch', 'group'] as const;

// 行政机构单位层级分类 (按集团企业管理常用层级)
//   level1   一级企业 (集团总部)
//   level2   二级企业 (子公司 / 总部职能部门)
//   level3   三级企业 (分公司 / 二级公司部门)
//   level4   四级企业 (项目部 / 班组 / 一线作业单元)
export const ADMIN_TYPES = ['level1', 'level2', 'level3', 'level4'] as const;

export const ALL_ORG_TYPES = [...PARTY_TYPES, ...ADMIN_TYPES] as const;
export type OrgType = (typeof ALL_ORG_TYPES)[number];

export class CreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsIn(ORG_KINDS as unknown as string[])
  kind!: OrgKind;

  @IsIn(ALL_ORG_TYPES as unknown as string[])
  type!: OrgType;

  @ValidateIf((o) => o.parentId !== null && o.parentId !== undefined)
  @IsString()
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
