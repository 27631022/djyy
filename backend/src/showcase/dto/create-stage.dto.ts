import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** 比拼规则 markdown 长度上限 */
export const RULES_MD_MAX = 20_000;

export class CreateStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  categoryId!: string;

  /** 一段话简介(列表卡) */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  intro?: string;

  /** 比拼规则(markdown) */
  @IsOptional()
  @IsString()
  @MaxLength(RULES_MD_MAX)
  rulesMd?: string;

  /** 台头介绍区块(service 过 normalizeBlocks 白名单重建) */
  @IsOptional()
  introBlocks?: unknown;

  /** 填报规则=区块模板 [{id,type,title,requirement?}](service 过 normalizeTemplate;参晒人逐块照填) */
  @IsOptional()
  template?: unknown;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  /** 排位依据:likes(作品点赞)| metric(申报数值) */
  @IsOptional()
  @IsIn(['likes', 'metric'])
  rankBy?: string;

  /** rankBy=metric:比拼指标名(如「安全行驶里程」) */
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
}
