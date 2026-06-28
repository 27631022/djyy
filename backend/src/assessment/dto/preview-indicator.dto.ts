import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/** 单指标实时预览:一个计分工具 + 参数 + 难易系数 + 各对象实际值 → ●# 单项排名。units 内层 service 解析。 */
export class PreviewIndicatorDto {
  @IsString()
  scoringType!: string;

  /** 指标类型 normal/bonus/deduction —— 减分项「得分」按实际扣分额算(影响 manual_deduct 取值) */
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  fullScore?: number;

  @IsOptional()
  @IsBoolean()
  difficultyOn?: boolean;

  @IsOptional()
  @IsObject()
  difficultyCoefs?: Record<string, number>;

  /** [{ ref, name, raw }] —— 各对象的实际值 */
  @IsArray()
  units!: unknown[];
}
