import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddAttachmentDto {
  /** storage 文件 id(前端先 storageApi.upload 拿到) */
  @IsString()
  fileId!: string;

  /** 展示名,默认原始文件名 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
