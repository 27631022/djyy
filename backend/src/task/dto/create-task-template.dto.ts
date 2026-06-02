import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTaskTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  /** TaskField[] —— 语义校验在 service(normalizeFieldDefs) */
  @IsArray()
  fields!: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
