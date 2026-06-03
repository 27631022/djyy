import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 发起新一期(周期报表):把当前任务克隆为新一期 ——
 * 串联 seriesId、上期已提交内容作为本期草稿预填、同责任人接力(无需重新认领)。
 */
export class NewPeriodDto {
  /** 期次标签(如「2026年7月」);可空,前端默认给当月 */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  periodLabel?: string;

  /** 新一期截止时间 ISO 串(可空 = 不限) */
  @IsOptional()
  @IsString()
  dueAt?: string;
}
