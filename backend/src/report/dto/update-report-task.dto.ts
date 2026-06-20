import { IsArray, IsOptional, IsString } from 'class-validator';

/** 编辑报送任务(标题 / 填报要求 / 截止时间 / 目标定义;字段结构发布后不在此改)。 */
export class UpdateReportTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** ISO 字符串;传空串 = 清除截止时间 */
  @IsOptional()
  @IsString()
  dueAt?: string;

  /** ReportGoal[] —— 目标定义(语义校验在 service.normalizeGoals);发布后可改 */
  @IsOptional()
  @IsArray()
  goals?: unknown[];
}
