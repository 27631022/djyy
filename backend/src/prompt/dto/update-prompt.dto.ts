import { IsString, MaxLength, MinLength } from 'class-validator';

/** 覆盖提示词:content = 新的提示词全文。 */
export class UpdatePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}
