import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 多指标合计实时预览(打分人看自己负责的几项的单项 + 合计排名)。
 * leaves / units / deductBlocks 内层由 service 解析(同 PreviewIndicatorDto 范式)。
 */
export class PreviewSubtotalDto {
  /** [{ code, scoringType, weight, strategyParams, difficultyOn, difficultyCoefs }] */
  @IsArray()
  leaves!: unknown[];

  /** [{ ref, name, valuesByLeaf: { leafCode: raw } }] */
  @IsArray()
  units!: unknown[];

  /** 顶层「减分块」子树(含我负责的减分叶子的那些块,带 weight/children)——用于逐级减分上限封顶,
   *  使打分页合计与考核排名页口径一致。可空(没有减分指标时不传)。 */
  @IsOptional()
  @IsArray()
  deductBlocks?: unknown[];

  /** 自动源年份段缺省值(前端传考核年度;荣誉积分等叶子 sourceParams.yearLabel 未设时用) */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultYearLabel?: string;
}
