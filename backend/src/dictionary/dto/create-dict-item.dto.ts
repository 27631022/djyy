import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDictItemDto {
  /** 字典项代码 — 在所属字典内唯一 */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[a-z0-9_]+$/i, { message: 'code 仅允许字母数字下划线' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

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

  /**
   * 父级项 id (二级分类用)。null/缺省 = 根级 (分类自身);
   * 提供则该项是二级项,父必须是同字典的根级项 (强制 2 级)
   */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
