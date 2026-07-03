import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** 荣誉积分预览:sourceParams(yearLabel/weights)+ 考核对象 → 各对象积分(打分页中栏自动取数展示用)。 */
export class CertHonorPreviewDto {
  /** { yearLabel?: "2026", weights?: { company, department, subsidiary, other } } */
  @IsOptional()
  @IsObject()
  sourceParams?: Record<string, unknown>;

  /** 考核对象快照 [{orgId|userId,name}] */
  @IsArray()
  targets!: unknown[];

  /** 年份段缺省值(前端传考核年度;sourceParams.yearLabel 未设时用) */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultYearLabel?: string;
}
