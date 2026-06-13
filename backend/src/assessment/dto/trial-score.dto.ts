import { Allow, IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/** 试算:给一个计分工具 + 参数 + 样例原始值 → 返回得分。供配置时即时预览。 */
export class TrialScoreDto {
  @IsString()
  scoringType!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  /** 该叶子满分(分值);缺省按 100 */
  @IsOptional()
  @IsNumber()
  fullScore?: number;

  /** 当前对象的原始值(number | boolean);crossTarget 工具用于在 rawValues 中定位名次 */
  @Allow()
  raw?: unknown;

  /** crossTarget 工具(排名/标准化)的全体样例值 */
  @IsOptional()
  @IsArray()
  rawValues?: number[];
}
