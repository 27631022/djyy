import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;

  /** 上级分类 id(空=顶级;只允许两级,父必须是顶级 —— service 校验) */
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /** lucide 图标名 */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
