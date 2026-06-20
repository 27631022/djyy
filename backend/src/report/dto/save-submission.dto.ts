import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/** 录入一张发票:formData = { 字段code: 填报值 }(头字段 + 明细子表行数组)。语义/role 映射在 service。 */
export class SaveSubmissionDto {
  @IsObject()
  formData!: Record<string, unknown>;

  /** 提交人确认过的「明细与发票差异」备注(前端提交前核对生成);存头层供审核高亮。 */
  @IsOptional()
  @IsString()
  discrepancyNote?: string;

  /** 发票销售方(AI 识别带入);存头层供审核核对。 */
  @IsOptional()
  @IsString()
  supplier?: string;

  /**
   * AI 识别出的发票各行「价税合计金额(元)」。后端据此做**权威**自动审批判定:
   * 每条上报明细金额都能在发票上找到对应行 + 均在扶贫目录 → 系统自动通过,否则转人工审核。
   * 未识别(纯手工录入)则不传 → 金额无法与发票比对 → 转人工审核。
   */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  invoiceLines?: number[];
}
