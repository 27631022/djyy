import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /files 的非文件字段(multipart 文本部分) */
export class UploadFileDto {
  /** 业务来源(= 顶层文件夹),如 'certificate' | 'task' */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  ownerModule!: string;

  /** 业务子文件夹,如 '2025-先进工作者'(可多级,'/' 分隔);留空落到 ownerModule 根 */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  folder?: string;

  @IsOptional()
  @IsIn(['private', 'public'])
  visibility?: 'private' | 'public';
}
