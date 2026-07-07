import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;

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
