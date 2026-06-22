import { IsArray, IsOptional, IsString } from 'class-validator';

/** report.query 预览:任务 + 目标 + 取值(actual/rate)+ 考核对象 → 各对象将取到的值。targets 内层 service 解析。 */
export class ReportQueryPreviewDto {
  @IsOptional()
  @IsString()
  reportTaskId?: string;

  @IsOptional()
  @IsString()
  goalKey?: string;

  @IsOptional()
  @IsString()
  field?: string;

  /** [{ orgId|userId, name }] —— 考核对象快照 */
  @IsOptional()
  @IsArray()
  targets?: unknown[];
}
