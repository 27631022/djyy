import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /**
   * V2:荣誉代码 — Update 时仍为可选(部分更新);若传则要求非空
   */
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '荣誉代码不能为空' })
  @MaxLength(32)
  honorCode?: string;

  /** V3:荣誉类型 — individual / collective */
  @IsOptional()
  @IsIn(['individual', 'collective'])
  honorType?: 'individual' | 'collective';

  /** V3+:荣誉等级 — 字典 cert_honor_level 的 code(默认 company/department/subsidiary) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  honorLevel?: string;

  /** V3+:落款单位(发证机构) */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  issuingOrgName?: string;

  @IsOptional()
  @IsString()
  designJson?: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(4000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(4000)
  height?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
