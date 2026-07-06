import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewArticleDto {
  @IsBoolean()
  approve!: boolean;

  /** 驳回原因(approve=false 时必填 —— service 校验) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
