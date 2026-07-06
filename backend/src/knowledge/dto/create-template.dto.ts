import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CONTENT_MD_MAX } from './create-article.dto';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(CONTENT_MD_MAX)
  contentMd!: string;
}
