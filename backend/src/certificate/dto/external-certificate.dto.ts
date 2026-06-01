import {
  IsDateString,
  IsIn,
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
 *   - pdfFileId 指向上传到 storage 的外部 PDF 原件
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

  /** 上传的外部 PDF 的 storage 文件 id(前端先 POST /files 上传拿到)→ StoredFile.id */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  pdfFileId!: string;

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

  /** 荣誉类型(V3):同 IssueCertificateDto。仅 2 类 — individual / collective */
  @IsOptional()
  @IsIn(['individual', 'collective'])
  honorType?: 'individual' | 'collective';
}
