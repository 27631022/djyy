import { IsNumber, IsOptional, IsString } from 'class-validator';

/** AI 生成评分标准入参:指标名 + 数据源说明 + 计分工具 + 规则 + 满分。 */
export class GenerateCriteriaDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  dataSourceDesc?: string;

  @IsOptional()
  @IsString()
  tool?: string;

  @IsOptional()
  @IsString()
  rule?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;
}
