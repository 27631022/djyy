import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 字典项更新:code 同样不允许改 (其它字段引用) */
export class UpdateDictItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

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

  /** 允许改 parentId,null 表示晋升为根级分类 */
  @IsOptional()
  parentId?: string | null;
}
