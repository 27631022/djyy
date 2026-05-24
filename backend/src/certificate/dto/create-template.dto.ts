import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /** V2:荣誉首字母代码,如 "QDJL"(庆典奖励),用于发证编号生成 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  honorCode?: string;

  /** DesignerState 序列化的 JSON 字符串。前端 Canvas 设计器负责生成 + 解析。 */
  @IsString()
  designJson!: string;

  /** 缩略图 data URL,可空(新建时一般还没有) */
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
