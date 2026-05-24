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

  /** V2:荣誉代码(允许空字符串清空) */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  honorCode?: string;

  /** V3:荣誉类型 — individual(个人)/ collective(集体) */
  @IsOptional()
  @IsIn(['individual', 'collective'])
  honorType?: 'individual' | 'collective';

  /** V3:荣誉等级 — national / provincial / corporate / company */
  @IsOptional()
  @IsIn(['national', 'provincial', 'corporate', 'company'])
  honorLevel?: 'national' | 'provincial' | 'corporate' | 'company';

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
