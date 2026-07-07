import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class FetchUrlDto {
  @IsString()
  @MaxLength(1000)
  url!: string;
}

export class AiCleanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  text!: string;
}

export class AiSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** 可选补充关键词/年份,拼进联网检索 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hint?: string;
}
