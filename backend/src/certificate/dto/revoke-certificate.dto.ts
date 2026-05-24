import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeCertificateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BulkDownloadDto {
  @IsArray()
  @ArrayMinSize(1, { message: '至少选择 1 张证书' })
  @ArrayMaxSize(200, { message: '一次最多打包 200 张,超出请分批' })
  @IsString({ each: true })
  ids!: string[];
}
