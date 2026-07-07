import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  /** 展示区块(未传则不动) */
  @IsOptional()
  blocks?: unknown;

  @IsOptional()
  @IsNumber()
  metricValue?: number;
}
