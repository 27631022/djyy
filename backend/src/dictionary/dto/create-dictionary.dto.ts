import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDictionaryDto {
  /** 字典代码 — 全局唯一,小写字母数字下划线 */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'code 仅允许小写字母数字下划线,且首位为字母' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
