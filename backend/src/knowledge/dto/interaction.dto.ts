import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** @回复:指向同文章另一条评论 id(单层) */
  @IsOptional()
  @IsString()
  replyToId?: string;
}

export class CreateFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** 匿名反馈(对作者/管理员均显示「匿名用户」) */
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

export class UpdateFeedbackDto {
  @IsString()
  status!: string; // 'closed'
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
