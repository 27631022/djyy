import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 审核(晒台/作品共用):通过 → published;驳回 → rejected + 原因必填(service 校验) */
export class ReviewDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
