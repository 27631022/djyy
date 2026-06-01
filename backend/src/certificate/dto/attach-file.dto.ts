import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 回填证书文件 DTO(PATCH /certificates/:id/file)。
 * V4:发证流程「先发号 → 拿真 certNo 渲染 PDF → 上传 storage → 回填」。
 */
export class AttachCertificateFileDto {
  /** 渲染好的证书 PDF 的 storage 文件 id */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pdfFileId!: string;

  /** 压缩预览缩略图 JPEG base64(随发证存 DB) */
  @IsOptional()
  @IsString()
  thumbnail?: string;

  /** 用真实 certNo 重渲染后的变量快照 JSON(覆盖发号时的占位快照,可选) */
  @IsOptional()
  @IsString()
  variableData?: string;
}
