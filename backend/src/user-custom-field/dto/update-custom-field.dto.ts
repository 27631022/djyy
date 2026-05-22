import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CUSTOM_FIELD_TYPES, CustomFieldType } from './create-custom-field.dto';

/** code 不可修改 (避免破坏 User.customFields JSON 中的键) */
export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[])
  type?: CustomFieldType;

  @ValidateIf((o) => o.type === 'select')
  @IsString()
  @MaxLength(60)
  dictCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeholder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
