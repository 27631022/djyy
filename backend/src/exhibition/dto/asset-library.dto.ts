import { IsArray, IsOptional, IsString } from 'class-validator';

/** 文件型素材改名 / 打标签(分类由 query ?category= 指定,service 内校验) */
export class UpdateAssetDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsArray()
  tags?: string[];
}
