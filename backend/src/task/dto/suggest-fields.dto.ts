import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 按填报要求文本生成填报字段(POST /tasks/suggest-fields) */
export class SuggestFieldsDto {
  @IsString()
  @MaxLength(4000)
  requirements!: string;

  /** 任务名(可选,帮助 AI 理解上下文) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
