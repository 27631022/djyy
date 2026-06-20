import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** AI 识别发票:fileId = 已上传(storage,ownerModule=report)的发票文件;catalogTag 用于把识别出的明细匹配清单。 */
export class ExtractInvoiceDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;

  @IsOptional()
  @IsString()
  catalogTag?: string;
}
