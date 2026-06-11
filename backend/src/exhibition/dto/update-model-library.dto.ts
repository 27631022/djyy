import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 模型库条目更新:改展示名 / 设置分类标签(整组替换) */
export class UpdateModelLibraryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  name?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true })
  tags?: string[];
}
