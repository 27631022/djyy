import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  /** 一句话说明 */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  /** 展示区块(service 过 normalizeBlocks 白名单重建) */
  @IsOptional()
  blocks?: unknown;

  /** 申报数值(台 rankBy=metric 时提交前必填) */
  @IsOptional()
  @IsNumber()
  metricValue?: number;
}
