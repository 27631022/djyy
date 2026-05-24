import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * 外部证书上传 DTO(source='external')
 *
 * 跟内部发证 DTO 的关键差异:
 *   - 没有 templateId(外部证书不走模板渲染)
 *   - honorCode + honorName 必填(因为没模板可拷快照)
 *   - pdfData 字段名沿用,但实际放上传的外部 PDF
 *
 * 编号规则与内部一致:{yearLabel}-{honorCode}-{batchTotal}-{seq}。
 */
export class IssueExternalCertificateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  honorName!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'honorCode 只能含字母/数字/横线' })
  @MaxLength(32)
  honorCode!: string;

  @IsOptional()
  @IsString()
  recipientUserId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recipientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientEmpNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  recipientDept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientIdCard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientPhone?: string;

  @IsString()
  @Matches(/^\d{4}(-\d{4})?$/, {
    message: 'yearLabel 必须形如 "2024" 或 "2024-2025"',
  })
  yearLabel!: string;

  @IsInt()
  @Min(1)
  @Max(99999)
  batchTotal!: number;

  /** 上传的原 PDF base64 data URL(也会作为 pdfData 用于下载) */
  @IsString()
  externalFileData!: string;

  /** 变量值快照 JSON 串(留空 '{}' 也行,因为外部证书不渲染) */
  @IsOptional()
  @IsString()
  variableData?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  issuingOrgName?: string;
}
