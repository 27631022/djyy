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
 * 单证发证 DTO(Phase A)
 *
 * 持证人来源:
 *   - 关联系统用户 → 传 recipientUserId,服务端会从 User 表读 username/name 做快照
 *   - 手填外部人员 → 不传 recipientUserId,但 recipientName 必填
 *
 * ⚠ 传了 recipientUserId 时,服务端会校验 recipientName/recipientEmpNo 与该 User
 *   是否为同一个人,不符直接 400(防「绑错人 → 快照静默改写证书上的姓名」)。
 *
 * 批次概念:
 *   batchKey = `${yearLabel}-${honorCode}-${batchTotal}`,
 *   服务端按 batchKey 决定 batchSeq(事务内取批次现存 max(batchSeq) + 1,保证唯一)。
 *   超过 batchTotal 会报错。追加发证请用不同的 batchTotal。
 */
export class IssueCertificateDto {
  @IsString()
  templateId!: string;

  /** 持证人 — 关联系统用户(可选) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientUserId?: string;

  /**
   * 持证人姓名(必填)。
   * ⚠ 关联 User 时,落库以 **User 快照为准**(本字段只用于一致性校验,不符会 400)——
   *   与集体荣誉不同,集体荣誉恒以本字段为准。
   */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  recipientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientEmpNo?: string;

  /**
   * 所在单位/部门 —— 发证向导从组织树点选,存全称路径快照。
   * (2026-06-01)暂时放开「必填」:允许留空以支持快速发证。
   * 恢复必填:去掉 @IsOptional()、加回 @MinLength(1),并把末尾 `?` 改回 `!`。
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
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

  /** 证书 PDF 的 storage 文件 id(前端先 POST /files 上传 PDF 拿到)→ StoredFile.id */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pdfFileId?: string;

  /** 该表彰的原始表彰文件 storage id(best-effort,前端发证前上传)→ StoredFile.id */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceFileId?: string;

  /** 压缩预览缩略图 JPEG base64(前端从同一次渲染降采样生成,约几十 KB)。仍存 DB。可选 */
  @IsOptional()
  @IsString()
  thumbnail?: string;

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

  /**
   * 荣誉类型(V3):
   *   individual(个人)— 老接口/老前端不传时默认走个人路径
   *   collective(集体)— 凡非个人皆归此类(团队/单位/党组织/家庭/小组 等)
   * 取值校验:仅允许这 2 种;老 "unit" 值兼容由 controller 层兜底转换
   */
  @IsOptional()
  @IsIn(['individual', 'collective'])
  honorType?: 'individual' | 'collective';

  /**
   * 颁发日期(V3):前端表彰记录上的"表彰日期"。
   * 不传时后端用 prisma 默认值 now()(老接口兼容)。
   */
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}
