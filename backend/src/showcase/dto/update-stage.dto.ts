import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RULES_MD_MAX } from './create-stage.dto';

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RULES_MD_MAX)
  rulesMd?: string;

  /** 台头介绍区块(service 过 normalizeBlocks 白名单重建;未传则不动) */
  @IsOptional()
  introBlocks?: unknown;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  /** 排位配置(已有作品后 service 拦截修改) */
  @IsOptional()
  @IsIn(['likes', 'metric'])
  rankBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  metricLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  metricUnit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  metricDecimals?: number;

  @IsOptional()
  @IsIn(['desc', 'asc'])
  metricOrder?: string;

  /** 仅管理员可置顶(service 门控) */
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
