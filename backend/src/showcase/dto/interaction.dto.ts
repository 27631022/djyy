import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** 匿名吐槽(对台主/作者/管理员均显示「匿名用户」) */
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class ReplyFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

/** 浏览时长回填(公开口,sendBeacon 带不了 auth 头) */
export class ViewBeaconDto {
  @IsString()
  viewLogId!: string;

  @IsInt()
  @Min(0)
  @Max(14400)
  durationSec!: number;
}
