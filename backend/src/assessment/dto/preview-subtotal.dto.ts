import { IsArray } from 'class-validator';

/**
 * 多指标合计实时预览(打分人看自己负责的几项的单项 + 合计排名)。
 * leaves / units 内层由 service 解析(同 PreviewIndicatorDto 范式)。
 */
export class PreviewSubtotalDto {
  /** [{ code, scoringType, weight, strategyParams, difficultyOn, difficultyCoefs }] */
  @IsArray()
  leaves!: unknown[];

  /** [{ ref, name, valuesByLeaf: { leafCode: raw } }] */
  @IsArray()
  units!: unknown[];
}
