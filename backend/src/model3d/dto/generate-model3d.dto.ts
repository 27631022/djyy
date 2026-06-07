import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 生成 3D 模型:传上传图片的 fileId(走 storage 上传得到),可选 prompt。 */
export class GenerateModel3dDto {
  @IsString()
  @MaxLength(64)
  imageFileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}
