import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CONTENT_MD_MAX } from './create-article.dto';

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_MD_MAX)
  contentMd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  versionLabel?: string;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//i, { message: '原文链接必须是 http(s) 网址' })
  sourceUrl?: string;

  /** 置顶 — 仅 knowledge:manage(service 校验) */
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
