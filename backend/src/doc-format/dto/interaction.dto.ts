import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FEEDBACK_MAX_FILES, VIEW_DURATION_MAX_SEC } from '../doc-format-interaction.service';

export class SetFavoriteDto {
  @IsBoolean()
  on!: boolean;
}

export class CreateFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** 匿名反馈(对管理员也显示「匿名用户」;userId 仍会存,防刷/审计) */
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  /** 转换失败的原始文件 —— 先经 storage 传好再把 fileId 带进来 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FEEDBACK_MAX_FILES)
  @IsString({ each: true })
  fileIds?: string[];
}

export class ReplyFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class ListFeedbackQuery {
  @IsOptional()
  @IsIn(['all', 'mine'])
  scope?: 'all' | 'mine';

  @IsOptional()
  @IsIn(['open', 'replied', 'closed', 'all'])
  status?: string;
}

export class ViewBeaconDto {
  @IsString()
  viewLogId!: string;

  @IsInt()
  @Min(0)
  // 客户端也要按这个封顶,否则超 4h 的会话 beacon 会被 400 拒收、时长直接丢失
  @Max(VIEW_DURATION_MAX_SEC)
  durationSec!: number;
}
