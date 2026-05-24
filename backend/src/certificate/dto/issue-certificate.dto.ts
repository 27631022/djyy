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
 * 单证发证 DTO(Phase A)
 *
 * 持证人来源:
 *   - 关联系统用户 → 传 recipientUserId,服务端会从 User 表读 username/name 做快照
 *   - 手填外部人员 → 不传 recipientUserId,但 recipientName 必填
 *
 * 批次概念:
 *   batchKey = `${yearLabel}-${honorCode}-${batchTotal}`,
 *   服务端按 batchKey 决定 batchSeq(SELECT COUNT + 1,事务保证唯一)。
 *   超过 batchTotal 会报错。追加发证请用不同的 batchTotal。
 */
export class IssueCertificateDto {
  @IsString()
  templateId!: string;

  /** 持证人 — 关联系统用户(可选) */
  @IsOptional()
  @IsString()
  recipientUserId?: string;

  /** 持证人姓名(必填,关联 User 也会以此为准) */
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

  /** 年份段:"2024" 或 "2024-2025" */
  @IsString()
  @Matches(/^\d{4}(-\d{4})?$/, {
    message: 'yearLabel 必须形如 "2024" 或 "2024-2025"',
  })
  yearLabel!: string;

  /** 本批次总数(单证 = 1) */
  @IsInt()
  @Min(1)
  @Max(99999)
  batchTotal!: number;

  /** 变量值快照 JSON 字符串,如 '{"name":"张三","certNo":"..."}' */
  @IsString()
  variableData!: string;

  /** 前端 jspdf 渲染的 PDF base64 data URL */
  @IsString()
  pdfData!: string;

  /** 有效期至,ISO 日期串。空 = 永久 */
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  /** 发证机构 id(从当前用户主归属推断,可前端传) */
  @IsOptional()
  @IsString()
  issuingOrgId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  issuingOrgName?: string;
}
