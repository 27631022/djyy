import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FaqItemDto } from './faq-item.dto';

/** 正文长度上限(字符)= 约 40 万字,足够长文;防超大 body 撑爆存储/渲染 */
export const CONTENT_MD_MAX = 400_000;

export class CreateArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  categoryId!: string;

  @IsString()
  typeCode!: string;

  /** Markdown 正文(草稿允许空串,提交时校验非空) */
  @IsString()
  @MaxLength(CONTENT_MD_MAX)
  contentMd!: string;

  /** 导读(通常 AI 生成后人工确认,也可手填) */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  /** 标签(service 归一化:去重/去空/限个数与长度) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** 常见问题答疑(通常先保存再 AI 生成/编辑;新建时一般为空)—— service 归一化去空/限量 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  @ArrayMaxSize(50)
  faqs?: FaqItemDto[];

  /** 「这是某篇现有文章的修订版」—— 传旧文章 id,建立版本链 */
  @IsOptional()
  @IsString()
  revisionOfId?: string;

  /** 版本说明,如「2026年修订」 */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  versionLabel?: string;

  @IsOptional()
  @IsString()
  coverFileId?: string;

  /** 原文链接(AI 归档/转载来源)—— 仅 http(s),防 javascript: 等危险协议 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//i, { message: '原文链接必须是 http(s) 网址' })
  sourceUrl?: string;
}
