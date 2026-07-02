import { IsOptional, IsString, MaxLength } from 'class-validator';

/** AI 生成单位体检诊断建议:前端组织好的体检数据摘要(结构化文本)+ 单位名。 */
export class GenerateCheckupIssuesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  unitName?: string;

  /** 体检数据摘要(总分/名次/维度得分率 vs 平均/失分点/扣分/加分空间),前端按固定格式拼好 */
  @IsString()
  @MaxLength(8000)
  summary!: string;
}
