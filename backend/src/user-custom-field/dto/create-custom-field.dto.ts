import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'textarea', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export class CreateCustomFieldDto {
  /** 字段代码 — 全局唯一,小写字母数字下划线 */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'code 仅允许小写字母数字下划线,首位字母' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  @IsIn(CUSTOM_FIELD_TYPES as unknown as string[])
  type!: CustomFieldType;

  /** type=select 时必须提供,否则不允许 */
  @ValidateIf((o) => o.type === 'select')
  @IsString()
  @MaxLength(60)
  dictCode?: string;

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
