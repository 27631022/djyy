import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, ValidateNested } from 'class-validator';

export class ReorderCategoryItemDto {
  @IsString()
  id!: string;

  @IsInt()
  sortOrder!: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  @ArrayMaxSize(500)
  items!: ReorderCategoryItemDto[];
}
